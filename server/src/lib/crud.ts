import { Router, type Request } from 'express';
import type { ZodTypeAny } from 'zod';
import type { ModuleKey } from '@nexo/shared';
import type { Db } from '../db/pool';
import { modulePermission, tx, type Ctx } from '../middleware/auth';
import { audit } from './audit';
import { notFound } from './errors';
import { h, isUuid, pageParams, str } from './http';

export class Params {
  values: unknown[] = [];
  add(v: unknown) { this.values.push(v); return `$${this.values.length}`; }
}

type Row = Record<string, any>;
type Data = Record<string, any>;

export interface ResourceDef {
  path: string;
  table: string;
  module: ModuleKey;
  entity: string;       // nome legível para o histórico (ex.: "cliente")
  schema: ZodTypeAny;
  updateSchema?: ZodTypeAny;
  columns: readonly string[];
  select?: string;
  joins?: string;
  search?: string[];
  filters?: Record<string, (value: string, p: Params, req: Request) => string | null>;
  sort: Record<string, string>;
  defaultSort: string;
  defaultDir?: 'asc' | 'desc';
  softDelete?: boolean;
  optionLabel?: string; // expressão SQL para listas de seleção
  label: (row: Row) => string;
  /** ajusta os dados antes de gravar (cálculos, validações de negócio) */
  prepare?: (db: Db, ctx: Ctx, data: Data, existing: Row | null) => Promise<Data> | Data;
  afterWrite?: (db: Db, ctx: Ctx, row: Row, data: Data, existing: Row | null) => Promise<void>;
  beforeDelete?: (db: Db, ctx: Ctx, row: Row) => Promise<void>;
  detail?: (db: Db, ctx: Ctx, row: Row) => Promise<Row>;
  /** oculta campos para papéis sem permissão (ex.: custos) */
  redact?: (row: Row, ctx: Ctx) => Row;
  noDelete?: boolean;
  /** restrição adicional aplicada a todas as listagens (ex.: documentos restritos) */
  scope?: (req: Request, p: Params, ctx: Ctx) => string | null;
  extend?: (router: Router) => void;
}

export function buildWhere(def: ResourceDef, req: Request, ctx: Ctx, p: Params) {
  const where = [`t.company_id = ${p.add(ctx.companyId)}`];
  const q = str(req.query.q);
  if (q && def.search?.length) {
    const like = p.add(`%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`);
    const digits = q.replace(/\D/g, '');
    const parts = def.search.map((c) => `${c}::text ILIKE ${like}`);
    if (digits.length >= 3 && digits !== q) {
      const dl = p.add(`%${digits}%`);
      parts.push(...def.search.map((c) => `regexp_replace(${c}::text, '\\D', '', 'g') LIKE ${dl}`));
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  if (def.softDelete) {
    const a = str(req.query.archived);
    if (a === '1') where.push('t.archived_at IS NOT NULL');
    else if (a !== 'all') where.push('t.archived_at IS NULL');
  }
  const scoped = def.scope?.(req, p, ctx);
  if (scoped) where.push(scoped);
  for (const [key, fn] of Object.entries(def.filters ?? {})) {
    const v = str(req.query[key]);
    if (v === undefined) continue;
    const clause = fn(v, p, req);
    if (clause) where.push(clause);
  }
  return where.join(' AND ');
}

export const eq = (col: string, allowed?: readonly string[]) => (v: string, p: Params) =>
  allowed && !allowed.includes(v) ? null : `${col} = ${p.add(v)}`;
export const eqId = (col: string) => (v: string, p: Params) => (isUuid(v) ? `${col} = ${p.add(v)}` : 'false');
export const inList = (col: string, allowed: readonly string[]) => (v: string, p: Params) => {
  const vals = v.split(',').filter((x) => allowed.includes(x));
  return vals.length ? `${col} = ANY(${p.add(vals)})` : null;
};
export const dateFrom = (col: string) => (v: string, p: Params) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${col} >= ${p.add(v)}` : null);
export const dateTo = (col: string) => (v: string, p: Params) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${col} <= ${p.add(v)}` : null);

async function fetchOne(db: Db, def: ResourceDef, ctx: Ctx, id: string) {
  if (!isUuid(id)) return null;
  const p = new Params();
  const sql = `SELECT ${def.select ?? 't.*'} FROM ${def.table} t ${def.joins ?? ''}
               WHERE t.company_id = ${p.add(ctx.companyId)} AND t.id = ${p.add(id)}`;
  const r = await db.query(sql, p.values);
  return r.rows[0] ?? null;
}

export function resource(def: ResourceDef) {
  const router = Router();
  router.use(def.path, modulePermission(def.module));
  const redact = (row: Row, ctx: Ctx) => (def.redact ? def.redact(row, ctx) : row);
  // rotas específicas do módulo têm precedência sobre as genéricas
  def.extend?.(router);

  // opções para campos de seleção
  router.get(`${def.path}/options`, h(async (req, res) => {
    const rows = await tx(req, async (db, ctx) => {
      const p = new Params();
      let where = buildWhere(def, req, ctx, p);
      if (isUuid(req.query.id)) where += ` AND t.id = ${p.add(req.query.id)}`;
      const r = await db.query(
        `SELECT t.id, ${def.optionLabel ?? 't.name'} AS label, ${def.select ?? 't.*'} FROM ${def.table} t ${def.joins ?? ''}
         WHERE ${where} ORDER BY 2 LIMIT 50`, p.values);
      return r.rows.map((x) => redact(x, ctx));
    });
    res.json({ data: rows });
  }));

  router.get(def.path, h(async (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query);
    const result = await tx(req, async (db, ctx) => {
      const p = new Params();
      const where = buildWhere(def, req, ctx, p);
      const sortKey = str(req.query.sort);
      const sortCol = (sortKey && def.sort[sortKey]) || def.sort[def.defaultSort];
      const dir = str(req.query.dir) === 'asc' ? 'ASC' : str(req.query.dir) === 'desc' ? 'DESC' : (def.defaultDir ?? 'asc').toUpperCase();
      const count = await db.query(`SELECT count(*)::int AS n FROM ${def.table} t ${def.joins ?? ''} WHERE ${where}`, p.values);
      const rows = await db.query(
        `SELECT ${def.select ?? 't.*'} FROM ${def.table} t ${def.joins ?? ''} WHERE ${where}
         ORDER BY ${sortCol} ${dir} NULLS LAST, t.id LIMIT ${pageSize} OFFSET ${offset}`, p.values);
      return { data: rows.rows.map((x) => redact(x, ctx)), total: count.rows[0].n, page, pageSize };
    });
    res.json(result);
  }));

  router.get(`${def.path}/:id`, h(async (req, res) => {
    const row = await tx(req, async (db, ctx) => {
      const r = await fetchOne(db, def, ctx, req.params.id);
      if (!r) throw notFound();
      return redact(def.detail ? await def.detail(db, ctx, r) : r, ctx);
    });
    res.json({ data: row });
  }));

  const write = async (db: Db, ctx: Ctx, input: Data, existing: Row | null) => {
    let data = input;
    if (def.prepare) data = await def.prepare(db, ctx, { ...data }, existing);
    const cols = def.columns.filter((c) => c in data && data[c] !== undefined);
    const p = new Params();
    let id: string;
    if (existing) {
      if (cols.length) {
        const sets = cols.map((c) => `${c} = ${p.add(data[c])}`).join(', ');
        await db.query(`UPDATE ${def.table} SET ${sets} WHERE company_id = ${p.add(ctx.companyId)} AND id = ${p.add(existing.id)}`, p.values);
      }
      id = existing.id;
    } else {
      const names = ['company_id', ...cols];
      const vals = [p.add(ctx.companyId), ...cols.map((c) => p.add(data[c]))];
      const r = await db.query(`INSERT INTO ${def.table} (${names.join(', ')}) VALUES (${vals.join(', ')}) RETURNING id`, p.values);
      id = r.rows[0].id;
    }
    const row = (await fetchOne(db, def, ctx, id))!;
    if (def.afterWrite) await def.afterWrite(db, ctx, row, data, existing);
    await audit(db, ctx, existing ? 'atualizou' : 'criou', def.entity, id, `${existing ? 'Atualizou' : 'Cadastrou'} ${def.entity}: ${def.label(row)}`);
    return row;
  };

  router.post(def.path, h(async (req, res) => {
    const data = def.schema.parse(req.body);
    const row = await tx(req, (db, ctx) => write(db, ctx, data, null));
    res.status(201).json({ data: row });
  }));

  router.put(`${def.path}/:id`, h(async (req, res) => {
    const data = (def.updateSchema ?? def.schema).parse(req.body);
    const row = await tx(req, async (db, ctx) => {
      const existing = await fetchOne(db, def, ctx, req.params.id);
      if (!existing) throw notFound();
      return write(db, ctx, data, existing);
    });
    res.json({ data: row });
  }));

  if (def.softDelete) {
    router.post(`${def.path}/:id/restore`, h(async (req, res) => {
      await tx(req, async (db, ctx) => {
        const existing = await fetchOne(db, def, ctx, req.params.id);
        if (!existing) throw notFound();
        await db.query(`UPDATE ${def.table} SET archived_at = NULL WHERE company_id = $1 AND id = $2`, [ctx.companyId, existing.id]);
        await audit(db, ctx, 'restaurou', def.entity, existing.id, `Restaurou ${def.entity}: ${def.label(existing)}`);
      });
      res.json({ ok: true });
    }));
  }

  if (!def.noDelete) {
    router.delete(`${def.path}/:id`, h(async (req, res) => {
      const mode = await tx(req, async (db, ctx) => {
        const existing = await fetchOne(db, def, ctx, req.params.id);
        if (!existing) throw notFound();
        if (def.beforeDelete) await def.beforeDelete(db, ctx, existing);
        const permanent = req.query.permanent === '1' || !def.softDelete;
        if (permanent) {
          await db.query(`DELETE FROM ${def.table} WHERE company_id = $1 AND id = $2`, [ctx.companyId, existing.id]);
        } else {
          await db.query(`UPDATE ${def.table} SET archived_at = now() WHERE company_id = $1 AND id = $2`, [ctx.companyId, existing.id]);
        }
        await audit(db, ctx, permanent ? 'excluiu' : 'arquivou', def.entity, existing.id,
          `${permanent ? 'Excluiu' : 'Arquivou'} ${def.entity}: ${def.label(existing)}`);
        return permanent ? 'excluido' : 'arquivado';
      });
      res.json({ ok: true, mode });
    }));
  }

  return router;
}
