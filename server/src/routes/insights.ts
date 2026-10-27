import { Router } from 'express';
import { ALERT_CATALOG, REPORT_CATALOG, can, canDo, tipActionSchema, type AlertKey, type ChartKey, type ReportKey, type Role } from '@nexo/shared';
import { audit } from '../lib/audit';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { h, isDate, str } from '../lib/http';
import { tx, type Ctx } from '../middleware/auth';
import type { Db } from '../db/pool';
import { buildMe, getSegment } from '../services/workspace';
import { computeAlerts, computeChart, computeKpis, refDates } from '../services/insights';
import { computeTips } from '../services/tips';
import { runReport } from '../services/reports';

const router = Router();

async function workspaceOf(db: Db, ctx: Ctx) {
  const me = await buildMe(db, ctx as any);
  if (!me.workspace) throw notFound('Empresa sem segmento configurado.');
  return me;
}

router.get('/dashboard', h(async (req, res) => {
  const data = await tx(req, async (db, ctx) => {
    const me = await workspaceOf(db, ctx);
    const ws = me.workspace!;
    const segment = (await getSegment(db, ctx.company.segment_key))!;
    const C = ctx.companyId;
    const [kpis, alerts] = [await computeKpis(db, ctx, ws.kpis), await computeAlerts(db, ctx, ws.alerts)];
    const charts = [];
    for (const c of ws.charts.slice(0, 3)) charts.push(await computeChart(db, ctx, c as ChartKey));
    const agenda = can(ctx.role, 'agenda') ? (await db.query(
      `SELECT a.id, a.starts_at, a.ends_at, a.status, coalesce(c.name, a.title) AS customer_name, s.name AS service_name, e.name AS employee_name, e.color AS employee_color
         FROM appointments a LEFT JOIN customers c ON c.id = a.customer_id LEFT JOIN services s ON s.id = a.service_id LEFT JOIN employees e ON e.id = a.employee_id
        WHERE a.company_id = $1 AND a.status IN ('agendado','confirmado') AND a.ends_at >= now() ORDER BY a.starts_at LIMIT 6`, [C])).rows : [];
    const deliveries = can(ctx.role, 'entregas') ? (await db.query(
      `SELECT id, number, recipient_name, scheduled_for, status FROM deliveries WHERE company_id = $1 AND status NOT IN ('concluida','cancelada') ORDER BY scheduled_for LIMIT 5`, [C])).rows : [];
    const tasks = can(ctx.role, 'tarefas') ? (await db.query(
      `SELECT t.id, t.title, t.priority, t.status, t.due_date, e.name AS assignee_name, (t.due_date < (now() AT TIME ZONE $2)::date) AS is_overdue
         FROM tasks t LEFT JOIN employees e ON e.id = t.assignee_id WHERE t.company_id = $1 AND t.status <> 'concluida'
        ORDER BY t.due_date NULLS LAST, CASE t.priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END LIMIT 6`, [C, ctx.company.timezone])).rows : [];
    const tips = (await computeTips(db, ctx, segment.config)).slice(0, 3);
    const own = canDo(ctx.role, 'viewActivityLog') ? '' : 'AND a.user_id = $2';
    const activity = (await db.query(
      `SELECT a.id, a.summary, a.entity, a.action, a.created_at, u.name AS user_name FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
        WHERE a.company_id = $1 ${own} ORDER BY a.created_at DESC LIMIT 8`, own ? [C, ctx.user.id] : [C])).rows;
    const d = await refDates(db, ctx);
    return { today: d.today, kpis, alerts, charts, agenda, deliveries, tasks, tips, activity, workspace: ws };
  });
  res.json({ data });
}));

router.get('/notifications', h(async (req, res) => {
  const data = await tx(req, async (db, ctx) => {
    const all = Object.keys(ALERT_CATALOG) as AlertKey[];
    return computeAlerts(db, ctx, all);
  });
  res.json({ data });
}));

// ---------------------------------------------------------------------------
// Dicas
// ---------------------------------------------------------------------------
router.get('/tips', h(async (req, res) => {
  const data = await tx(req, async (db, ctx) => {
    const segment = (await getSegment(db, ctx.company.segment_key))!;
    return computeTips(db, ctx, segment.config);
  });
  res.json({ data });
}));

router.post('/tips/state', h(async (req, res) => {
  const data = tipActionSchema.parse(req.body);
  await tx(req, async (db, ctx) => {
    const segment = (await getSegment(db, ctx.company.segment_key))!;
    // só aceita ações sobre dicas que de fato existem para a empresa agora
    const current = await computeTips(db, ctx, segment.config, { includeHidden: true });
    const tip = current.find((t) => t.key === data.key && t.fingerprint === data.fingerprint);
    if (!tip) throw badRequest('Esta dica não está mais disponível. Atualize a página.');
    await db.query(`INSERT INTO tip_states (company_id, tip_key, fingerprint, status, title, snapshot, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [ctx.companyId, tip.key, tip.fingerprint, data.status, tip.title, JSON.stringify({ reason: tip.reason, indicator: tip.indicator ?? null, kind: tip.kind }), ctx.user.id]);
    await audit(db, ctx, data.status === 'concluida' ? 'concluiu' : 'dispensou', 'dica', null, `${data.status === 'concluida' ? 'Concluiu' : 'Dispensou'} a dica: ${tip.title}`);
  });
  res.status(201).json({ ok: true });
}));

router.get('/tips/history', h(async (req, res) => {
  const data = await tx(req, async (db, ctx) => (await db.query(
    `SELECT s.id, s.tip_key, s.status, s.title, s.snapshot, s.created_at, u.name AS user_name FROM tip_states s LEFT JOIN users u ON u.id = s.user_id
      WHERE s.company_id = $1 ORDER BY s.created_at DESC LIMIT 100`, [ctx.companyId])).rows);
  res.json({ data });
}));

router.delete('/tips/history/:id', h(async (req, res) => {
  await tx(req, async (db, ctx) => {
    const r = await db.query(`DELETE FROM tip_states WHERE company_id = $1 AND id = $2 RETURNING title`, [ctx.companyId, req.params.id]).catch(() => ({ rows: [] as any[] }));
    if (!r.rows[0]) throw notFound();
    await audit(db, ctx, 'restaurou', 'dica', null, `Reativou a dica: ${r.rows[0].title}`);
  });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Relatórios
// ---------------------------------------------------------------------------
router.get('/reports/:key', h(async (req, res) => {
  const key = req.params.key as ReportKey;
  const meta = REPORT_CATALOG[key];
  if (!meta) throw notFound('Relatório não encontrado');
  if (!can(req.auth!.role as Role, meta.module, 'read')) throw forbidden();
  const data = await tx(req, async (db, ctx) => {
    const d = await refDates(db, ctx);
    const from = isDate(req.query.from) ? req.query.from : d.month_start;
    const to = isDate(req.query.to) ? req.query.to : d.today;
    if (from > to) throw badRequest('A data inicial deve ser anterior à final.');
    return runReport(db, ctx, key, from, to, str(req.query.group));
  });
  res.json({ data: { key, label: meta.label, ...data } });
}));

// ---------------------------------------------------------------------------
// Busca global
// ---------------------------------------------------------------------------
router.get('/search', h(async (req, res) => {
  const q = str(req.query.q);
  if (!q || q.length < 2) return res.json({ data: [] });
  const data = await tx(req, async (db, ctx) => {
    const like = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
    const out: { type: string; id: string; title: string; subtitle?: string; href: string }[] = [];
    const add = async (module: Parameters<typeof can>[1], sql: string, map: (r: any) => (typeof out)[number]) => {
      if (!can(ctx.role, module)) return;
      for (const r of (await db.query(sql, [ctx.companyId, like])).rows) out.push(map(r));
    };
    await add('clientes', `SELECT id, name, phone FROM customers WHERE company_id=$1 AND archived_at IS NULL AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2) ORDER BY name LIMIT 5`,
      (r) => ({ type: 'Cliente', id: r.id, title: r.name, subtitle: r.phone, href: `/app/clientes/${r.id}` }));
    await add('estoque', `SELECT id, name, sku, stock_qty FROM products WHERE company_id=$1 AND archived_at IS NULL AND (name ILIKE $2 OR sku ILIKE $2 OR barcode ILIKE $2) ORDER BY name LIMIT 5`,
      (r) => ({ type: 'Produto', id: r.id, title: r.name, subtitle: `Estoque: ${Number(r.stock_qty).toLocaleString('pt-BR')}`, href: `/app/estoque/${r.id}` }));
    await add('servicos', `SELECT id, name FROM services WHERE company_id=$1 AND archived_at IS NULL AND name ILIKE $2 LIMIT 3`,
      (r) => ({ type: 'Serviço', id: r.id, title: r.name, href: `/app/servicos?q=${encodeURIComponent(r.name)}` }));
    await add('fornecedores', `SELECT id, name, category FROM suppliers WHERE company_id=$1 AND archived_at IS NULL AND name ILIKE $2 LIMIT 3`,
      (r) => ({ type: 'Fornecedor', id: r.id, title: r.name, subtitle: r.category, href: `/app/fornecedores/${r.id}` }));
    await add('tarefas', `SELECT id, title, status FROM tasks WHERE company_id=$1 AND title ILIKE $2 ORDER BY created_at DESC LIMIT 3`,
      (r) => ({ type: 'Tarefa', id: r.id, title: r.title, href: `/app/tarefas?abrir=${r.id}` }));
    await add('orcamentos', `SELECT id, number, title FROM quotes WHERE company_id=$1 AND (title ILIKE $2 OR number::text = trim(both '%' from $2)) ORDER BY number DESC LIMIT 3`,
      (r) => ({ type: 'Orçamento', id: r.id, title: `#${r.number} ${r.title}`, href: `/app/orcamentos/${r.id}` }));
    await add('veiculos', `SELECT v.id, v.plate, v.model FROM vehicles v WHERE v.company_id=$1 AND v.archived_at IS NULL AND (v.plate ILIKE $2 OR v.model ILIKE $2) LIMIT 3`,
      (r) => ({ type: 'Veículo', id: r.id, title: `${r.plate} · ${r.model}`, href: `/app/veiculos?q=${r.plate}` }));
    await add('animais', `SELECT id, name, species FROM pets WHERE company_id=$1 AND archived_at IS NULL AND name ILIKE $2 LIMIT 3`,
      (r) => ({ type: 'Animal', id: r.id, title: r.name, href: `/app/animais?q=${encodeURIComponent(r.name)}` }));
    return out;
  });
  res.json({ data });
}));

export default router;
