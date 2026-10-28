import { Router } from 'express';
import { canDo, fromCents, lineTotal, quoteConvertSchema, quoteSchema, quoteStatusSchema, saleCancelSchema, saleSchema, toCents, workOrderInvoiceSchema, workOrderSchema, WORK_ORDER_STATUS } from '@nexo/shared';
import type { Db } from '../db/pool';
import { audit, nextNumber } from '../lib/audit';
import { Params } from '../lib/crud';
import { badRequest, conflict, notFound } from '../lib/errors';
import { h, isDate, isUuid, pageParams, str } from '../lib/http';
import { modulePermission, requirePermission, tx, type Ctx } from '../middleware/auth';
import { localDate } from '../services/finance';
import { cancelSale, createSale } from '../services/sales';

const router = Router();
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ---------------------------------------------------------------------------
// Vendas
// ---------------------------------------------------------------------------
router.use('/sales', modulePermission('vendas'));

router.get('/sales', h(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const result = await tx(req, async (db, ctx) => {
    const p = new Params();
    const tz = p.add(ctx.company.timezone);
    const where = [`s.company_id = ${p.add(ctx.companyId)}`];
    where.push(`${tz}::text IS NOT NULL`);
    const st = str(req.query.status);
    if (st === 'concluida' || st === 'cancelada') where.push(`s.status = ${p.add(st)}`);
    const pm = str(req.query.payment_method);
    if (pm) where.push(`s.payment_method = ${p.add(pm)}`);
    if (isDate(req.query.from)) where.push(`(s.sold_at AT TIME ZONE ${tz})::date >= ${p.add(req.query.from)}`);
    if (isDate(req.query.to)) where.push(`(s.sold_at AT TIME ZONE ${tz})::date <= ${p.add(req.query.to)}`);
    if (isUuid(req.query.customer_id)) where.push(`s.customer_id = ${p.add(req.query.customer_id)}`);
    const q = str(req.query.q);
    if (q) {
      const like = p.add(`%${q}%`);
      where.push(`(c.name ILIKE ${like} OR s.number::text = ${p.add(q.replace('#', ''))} OR EXISTS (SELECT 1 FROM sale_items i WHERE i.sale_id = s.id AND i.description ILIKE ${like}))`);
    }
    const w = where.join(' AND ');
    const sums = (await db.query(`SELECT count(*)::int n, coalesce(sum(s.total) FILTER (WHERE s.status='concluida'),0) AS total FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE ${w}`, p.values)).rows[0];
    const sort = ({ number: 's.number', total: 's.total', sold_at: 's.sold_at', customer: 'lower(c.name)' } as Record<string, string>)[str(req.query.sort) ?? ''] ?? 's.sold_at';
    const dir = str(req.query.dir) === 'asc' ? 'ASC' : 'DESC';
    const rows = (await db.query(
      `SELECT s.*, c.name AS customer_name, e.name AS employee_name,
              (SELECT string_agg(i.description, ', ' ORDER BY i.id) FROM sale_items i WHERE i.sale_id = s.id) AS items_summary
         FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN employees e ON e.id = s.employee_id
        WHERE ${w} ORDER BY ${sort} ${dir} NULLS LAST LIMIT ${pageSize} OFFSET ${offset}`, p.values)).rows;
    const showCost = canDo(ctx.role, 'viewCosts');
    return { data: rows.map((r) => (showCost ? r : { ...r, cost_total: null })), total: sums.n, page, pageSize, sums: { total: sums.total } };
  });
  res.json(result);
}));

router.get('/sales/:id', h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const data = await tx(req, async (db, ctx) => {
    const s = (await db.query(
      `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, e.name AS employee_name, u.name AS created_by_name
         FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN employees e ON e.id = s.employee_id LEFT JOIN users u ON u.id = s.created_by
        WHERE s.company_id = $1 AND s.id = $2`, [ctx.companyId, req.params.id])).rows[0];
    if (!s) throw notFound('Venda não encontrada');
    s.items = (await db.query(`SELECT * FROM sale_items WHERE company_id = $1 AND sale_id = $2 ORDER BY id`, [ctx.companyId, s.id])).rows;
    s.transaction = (await db.query(`SELECT id, status, amount, amount_paid, due_date FROM financial_transactions WHERE company_id = $1 AND sale_id = $2`, [ctx.companyId, s.id])).rows[0] ?? null;
    if (!canDo(ctx.role, 'viewCosts')) { s.cost_total = null; s.items = s.items.map((i: any) => ({ ...i, unit_cost: null })); }
    return s;
  });
  res.json({ data });
}));

router.post('/sales', h(async (req, res) => {
  const data = saleSchema.parse(req.body);
  const sale = await tx(req, (db, ctx) => createSale(db, ctx, data));
  res.status(201).json({ data: sale });
}));

router.post('/sales/:id/cancel', h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const { reason } = saleCancelSchema.parse(req.body);
  await tx(req, (db, ctx) => cancelSale(db, ctx, req.params.id, reason));
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Itens compartilhados por orçamentos e ordens de serviço
// ---------------------------------------------------------------------------
type ItemIn = { kind: string; product_id?: string | null; service_id?: string | null; description: string; quantity: number; unit_cost: number; unit_price: number; discount: number };
function computeItems(items: ItemIn[], discount: number) {
  const out = items.map((i, idx) => {
    const gross = lineTotal(i.quantity, i.unit_price);
    if (toCents(i.discount) > toCents(gross)) throw badRequest(`O desconto do item "${i.description}" é maior que o valor do item.`);
    return { ...i, total: lineTotal(i.quantity, i.unit_price, i.discount), position: idx };
  });
  const subtotalC = out.reduce((s, i) => s + toCents(i.total), 0);
  if (toCents(discount) > subtotalC) throw badRequest('O desconto não pode ser maior que o subtotal.');
  const costC = out.reduce((s, i) => s + toCents(lineTotal(i.quantity, i.unit_cost)), 0);
  return { items: out, subtotal: fromCents(subtotalC), total: fromCents(subtotalC - toCents(discount)), cost: fromCents(costC) };
}

async function insertItems(db: Db, ctx: Ctx, table: 'quote_items' | 'work_order_items', fk: 'quote_id' | 'work_order_id', parentId: string, items: ReturnType<typeof computeItems>['items']) {
  await db.query(`DELETE FROM ${table} WHERE company_id = $1 AND ${fk} = $2`, [ctx.companyId, parentId]);
  for (const i of items) {
    await db.query(
      `INSERT INTO ${table} (company_id, ${fk}, kind, product_id, service_id, description, quantity, unit_cost, unit_price, discount, total, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [ctx.companyId, parentId, i.kind, i.product_id ?? null, i.service_id ?? null, i.description, i.quantity, i.unit_cost, i.unit_price, i.discount, i.total, i.position]);
  }
}

// itens de OS/orçamento viram itens de venda; só produtos com product_id movimentam estoque
const toSaleItems = (items: any[]) => items.map((i) => ({
  product_id: i.kind === 'produto' || i.kind === 'material' ? i.product_id ?? null : null,
  service_id: i.kind === 'servico' ? i.service_id ?? null : null,
  description: i.description, quantity: i.quantity, unit_price: i.unit_price, discount: i.discount, unit_cost: i.unit_cost,
}));

// ---------------------------------------------------------------------------
// Orçamentos
// ---------------------------------------------------------------------------
router.use('/quotes', modulePermission('orcamentos'));

async function expireQuotes(db: Db, ctx: Ctx) {
  const today = await localDate(db, ctx);
  await db.query(`UPDATE quotes SET status = 'expirado' WHERE company_id = $1 AND status IN ('rascunho','enviado') AND valid_until < $2`, [ctx.companyId, today]);
}

router.get('/quotes', h(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const result = await tx(req, async (db, ctx) => {
    await expireQuotes(db, ctx);
    const p = new Params();
    const where = [`q.company_id = ${p.add(ctx.companyId)}`];
    const st = str(req.query.status);
    if (st) where.push(`q.status = ANY(${p.add(st.split(','))})`);
    if (isUuid(req.query.customer_id)) where.push(`q.customer_id = ${p.add(req.query.customer_id)}`);
    if (isDate(req.query.from)) where.push(`q.issued_on >= ${p.add(req.query.from)}`);
    if (isDate(req.query.to)) where.push(`q.issued_on <= ${p.add(req.query.to)}`);
    const s = str(req.query.q);
    if (s) { const like = p.add(`%${s}%`); where.push(`(q.title ILIKE ${like} OR c.name ILIKE ${like} OR q.number::text = ${p.add(s.replace('#', ''))})`); }
    const w = where.join(' AND ');
    const total = (await db.query(`SELECT count(*)::int n FROM quotes q LEFT JOIN customers c ON c.id = q.customer_id WHERE ${w}`, p.values)).rows[0].n;
    const sort = ({ number: 'q.number', total: 'q.total', issued_on: 'q.issued_on', valid_until: 'q.valid_until', customer: 'lower(c.name)' } as Record<string, string>)[str(req.query.sort) ?? ''] ?? 'q.number';
    const dir = str(req.query.dir) === 'asc' ? 'ASC' : 'DESC';
    const rows = (await db.query(`SELECT q.*, c.name AS customer_name FROM quotes q LEFT JOIN customers c ON c.id = q.customer_id WHERE ${w} ORDER BY ${sort} ${dir} LIMIT ${pageSize} OFFSET ${offset}`, p.values)).rows;
    const showCost = canDo(ctx.role, 'viewCosts');
    return { data: rows.map((r) => (showCost ? r : { ...r, cost_total: null })), total, page, pageSize };
  });
  res.json(result);
}));

async function loadQuote(db: Db, ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound();
  const q = (await db.query(
    `SELECT q.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email, c.document AS customer_document, c.address AS customer_address,
            s.number AS sale_number, w.number AS work_order_number
       FROM quotes q LEFT JOIN customers c ON c.id = q.customer_id LEFT JOIN sales s ON s.id = q.converted_sale_id LEFT JOIN work_orders w ON w.id = q.converted_work_order_id
      WHERE q.company_id = $1 AND q.id = $2`, [ctx.companyId, id])).rows[0];
  if (!q) throw notFound('Orçamento não encontrado');
  q.items = (await db.query(`SELECT * FROM quote_items WHERE company_id = $1 AND quote_id = $2 ORDER BY position`, [ctx.companyId, q.id])).rows;
  return q;
}

router.get('/quotes/:id', h(async (req, res) => {
  const data = await tx(req, async (db, ctx) => {
    await expireQuotes(db, ctx);
    const q = await loadQuote(db, ctx, req.params.id);
    q.company = (await db.query(`SELECT name, document, phone, email, city, state FROM companies WHERE id = $1`, [ctx.companyId])).rows[0];
    if (!canDo(ctx.role, 'viewCosts')) { q.cost_total = null; q.items = q.items.map((i: any) => ({ ...i, unit_cost: null })); }
    return q;
  });
  res.json({ data });
}));

router.post('/quotes', h(async (req, res) => {
  const data = quoteSchema.parse(req.body);
  const row = await tx(req, async (db, ctx) => {
    const calc = computeItems(data.items, data.discount);
    const number = await nextNumber(db, ctx.companyId, 'quote');
    const q = (await db.query(
      `INSERT INTO quotes (company_id, number, customer_id, title, issued_on, valid_until, subtotal, discount, total, cost_total, estimated_hours, terms, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [ctx.companyId, number, data.customer_id ?? null, data.title, data.issued_on, data.valid_until, calc.subtotal, data.discount, calc.total, calc.cost,
        data.estimated_hours ?? null, data.terms ?? null, data.notes ?? null, ctx.user.id])).rows[0];
    await insertItems(db, ctx, 'quote_items', 'quote_id', q.id, calc.items);
    await audit(db, ctx, 'criou', 'orcamento', q.id, `Criou o orçamento #${number}: ${data.title} (${brl(calc.total)})`);
    return q;
  });
  res.status(201).json({ data: row });
}));

router.put('/quotes/:id', h(async (req, res) => {
  const data = quoteSchema.parse(req.body);
  await tx(req, async (db, ctx) => {
    const q = await loadQuote(db, ctx, req.params.id);
    if (!['rascunho', 'enviado', 'expirado'].includes(q.status)) throw conflict('Orçamentos aprovados, recusados ou convertidos não podem ser editados. Duplique-o para criar uma nova versão.');
    const calc = computeItems(data.items, data.discount);
    const status = q.status === 'expirado' ? 'rascunho' : q.status;
    await db.query(
      `UPDATE quotes SET customer_id=$3, title=$4, issued_on=$5, valid_until=$6, subtotal=$7, discount=$8, total=$9, cost_total=$10, estimated_hours=$11, terms=$12, notes=$13, status=$14
        WHERE company_id = $1 AND id = $2`,
      [ctx.companyId, q.id, data.customer_id ?? null, data.title, data.issued_on, data.valid_until, calc.subtotal, data.discount, calc.total, calc.cost,
        data.estimated_hours ?? null, data.terms ?? null, data.notes ?? null, status]);
    await insertItems(db, ctx, 'quote_items', 'quote_id', q.id, calc.items);
    await audit(db, ctx, 'atualizou', 'orcamento', q.id, `Atualizou o orçamento #${q.number}`);
  });
  res.json({ ok: true });
}));

router.patch('/quotes/:id/status', h(async (req, res) => {
  const { status } = quoteStatusSchema.parse(req.body);
  await tx(req, async (db, ctx) => {
    await expireQuotes(db, ctx);
    const q = await loadQuote(db, ctx, req.params.id);
    const allowed: Record<string, string[]> = { rascunho: ['enviado', 'aprovado', 'recusado'], enviado: ['aprovado', 'recusado', 'rascunho'], aprovado: ['recusado', 'enviado'], recusado: ['rascunho'], expirado: [] };
    if (!allowed[q.status]?.includes(status)) {
      throw conflict(q.status === 'expirado' ? 'Orçamento expirado. Edite a validade para reenviá-lo.' : `Não é possível mudar de "${q.status}" para "${status}".`);
    }
    await db.query(`UPDATE quotes SET status = $3, sent_at = CASE WHEN $3 = 'enviado' THEN now() ELSE sent_at END,
                    decided_at = CASE WHEN $3 IN ('aprovado','recusado') THEN now() ELSE decided_at END WHERE company_id = $1 AND id = $2`, [ctx.companyId, q.id, status]);
    await audit(db, ctx, 'atualizou', 'orcamento', q.id, `Orçamento #${q.number} marcado como ${status}`);
  });
  res.json({ ok: true });
}));

router.post('/quotes/:id/duplicate', h(async (req, res) => {
  const row = await tx(req, async (db, ctx) => {
    const q = await loadQuote(db, ctx, req.params.id);
    const today = await localDate(db, ctx);
    const days = Math.max(1, Math.round((Date.parse(q.valid_until) - Date.parse(q.issued_on)) / 86400000));
    const valid = new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);
    const number = await nextNumber(db, ctx.companyId, 'quote');
    const n = (await db.query(
      `INSERT INTO quotes (company_id, number, customer_id, title, issued_on, valid_until, subtotal, discount, total, cost_total, estimated_hours, terms, notes, created_by)
       SELECT company_id, $3, customer_id, title, $4, $5, subtotal, discount, total, cost_total, estimated_hours, terms, notes, $6 FROM quotes WHERE company_id = $1 AND id = $2 RETURNING *`,
      [ctx.companyId, q.id, number, today, valid, ctx.user.id])).rows[0];
    await insertItems(db, ctx, 'quote_items', 'quote_id', n.id, q.items);
    await audit(db, ctx, 'criou', 'orcamento', n.id, `Duplicou o orçamento #${q.number} como #${number}`);
    return n;
  });
  res.status(201).json({ data: row });
}));

router.post('/quotes/:id/convert', h(async (req, res) => {
  const data = quoteConvertSchema.parse(req.body);
  const result = await tx(req, async (db, ctx) => {
    const q = await loadQuote(db, ctx, req.params.id);
    if (q.status !== 'aprovado') throw conflict('Apenas orçamentos aprovados podem ser convertidos.');
    if (data.target === 'venda') {
      if (!data.payment_method) throw badRequest('Selecione a forma de pagamento.', { fields: { payment_method: 'Selecione a forma de pagamento' } });
      const sale = await createSale(db, ctx, {
        customer_id: q.customer_id, items: toSaleItems(q.items), discount: q.discount, payment_method: data.payment_method,
        payment_status: data.payment_status, due_date: data.due_date ?? null, notes: `Gerada a partir do orçamento #${q.number}`,
        source: 'orcamento', source_id: q.id, allow_negative_stock: false,
      });
      await db.query(`UPDATE quotes SET status = 'convertido', converted_sale_id = $3 WHERE company_id = $1 AND id = $2`, [ctx.companyId, q.id, sale.id]);
      return { target: 'venda', id: sale.id, number: sale.number };
    }
    const number = await nextNumber(db, ctx.companyId, 'work_order');
    const today = await localDate(db, ctx);
    const wo = (await db.query(
      `INSERT INTO work_orders (company_id, number, customer_id, title, problem, opened_on, total, cost_total, estimated_hours, quote_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [ctx.companyId, number, q.customer_id, q.title, q.notes, today, q.total, q.cost_total, q.estimated_hours, q.id, ctx.user.id])).rows[0];
    await insertItems(db, ctx, 'work_order_items', 'work_order_id', wo.id, q.items);
    if (toCents(q.discount) > 0) {
      // desconto global do orçamento vira um ajuste no último item para manter o total
      await db.query(`UPDATE work_orders SET total = $3 WHERE company_id = $1 AND id = $2`, [ctx.companyId, wo.id, q.total]);
    }
    await db.query(`UPDATE quotes SET status = 'convertido', converted_work_order_id = $3 WHERE company_id = $1 AND id = $2`, [ctx.companyId, q.id, wo.id]);
    await audit(db, ctx, 'criou', 'ordem de serviço', wo.id, `Converteu o orçamento #${q.number} na OS #${number}`);
    return { target: 'ordem_servico', id: wo.id, number };
  });
  res.status(201).json({ data: result });
}));

router.delete('/quotes/:id', h(async (req, res) => {
  await tx(req, async (db, ctx) => {
    const q = await loadQuote(db, ctx, req.params.id);
    if (q.status === 'convertido' || q.status === 'aprovado') throw conflict('Orçamentos aprovados ou convertidos fazem parte do histórico e não podem ser excluídos.');
    await db.query(`DELETE FROM quotes WHERE company_id = $1 AND id = $2`, [ctx.companyId, q.id]);
    await audit(db, ctx, 'excluiu', 'orcamento', q.id, `Excluiu o orçamento #${q.number}`);
  });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Ordens de serviço
// ---------------------------------------------------------------------------
router.use('/work-orders', modulePermission('ordens_servico'));

const WO_SELECT = `w.*, c.name AS customer_name, c.phone AS customer_phone, v.plate AS vehicle_plate, v.model AS vehicle_model, e.name AS employee_name,
  s.number AS sale_number, q.number AS quote_number,
  (w.due_date IS NOT NULL AND w.due_date < (now() AT TIME ZONE co.timezone)::date AND w.status IN ('aberta','em_andamento','aguardando_pecas')) AS is_late`;
const WO_JOINS = `JOIN companies co ON co.id = w.company_id LEFT JOIN customers c ON c.id = w.customer_id LEFT JOIN vehicles v ON v.id = w.vehicle_id
  LEFT JOIN employees e ON e.id = w.employee_id LEFT JOIN sales s ON s.id = w.sale_id LEFT JOIN quotes q ON q.id = w.quote_id`;

router.get('/work-orders', h(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const result = await tx(req, async (db, ctx) => {
    const p = new Params();
    const where = [`w.company_id = ${p.add(ctx.companyId)}`];
    const st = str(req.query.status);
    if (st === 'abertas') where.push(`w.status IN ('aberta','em_andamento','aguardando_pecas')`);
    else if (st) where.push(`w.status = ANY(${p.add(st.split(','))})`);
    if (req.query.late === '1') where.push(`w.due_date < (now() AT TIME ZONE co.timezone)::date AND w.status IN ('aberta','em_andamento','aguardando_pecas')`);
    if (isUuid(req.query.employee_id)) where.push(`w.employee_id = ${p.add(req.query.employee_id)}`);
    if (isUuid(req.query.vehicle_id)) where.push(`w.vehicle_id = ${p.add(req.query.vehicle_id)}`);
    if (isUuid(req.query.customer_id)) where.push(`w.customer_id = ${p.add(req.query.customer_id)}`);
    const s = str(req.query.q);
    if (s) { const like = p.add(`%${s}%`); where.push(`(w.title ILIKE ${like} OR c.name ILIKE ${like} OR v.plate ILIKE ${like} OR w.number::text = ${p.add(s.replace('#', ''))})`); }
    const w = where.join(' AND ');
    const total = (await db.query(`SELECT count(*)::int n FROM work_orders w ${WO_JOINS} WHERE ${w}`, p.values)).rows[0].n;
    const sort = ({ number: 'w.number', due_date: 'w.due_date', opened_on: 'w.opened_on', total: 'w.total' } as Record<string, string>)[str(req.query.sort) ?? ''] ?? 'w.number';
    const dir = str(req.query.dir) === 'asc' ? 'ASC' : 'DESC';
    const rows = (await db.query(`SELECT ${WO_SELECT} FROM work_orders w ${WO_JOINS} WHERE ${w} ORDER BY ${sort} ${dir} NULLS LAST LIMIT ${pageSize} OFFSET ${offset}`, p.values)).rows;
    return { data: rows, total, page, pageSize };
  });
  res.json(result);
}));

async function loadWO(db: Db, ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound();
  const w = (await db.query(`SELECT ${WO_SELECT} FROM work_orders w ${WO_JOINS} WHERE w.company_id = $1 AND w.id = $2`, [ctx.companyId, id])).rows[0];
  if (!w) throw notFound('Ordem de serviço não encontrada');
  w.items = (await db.query(`SELECT * FROM work_order_items WHERE company_id = $1 AND work_order_id = $2 ORDER BY position`, [ctx.companyId, w.id])).rows;
  return w;
}

router.get('/work-orders/:id', h(async (req, res) => {
  const data = await tx(req, async (db, ctx) => {
    const w = await loadWO(db, ctx, req.params.id);
    w.history = (await db.query(`SELECT a.summary, a.created_at, u.name AS user_name FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
                                 WHERE a.company_id = $1 AND a.entity = 'ordem de serviço' AND a.entity_id = $2 ORDER BY a.created_at DESC`, [ctx.companyId, w.id])).rows;
    if (!canDo(ctx.role, 'viewCosts')) { w.cost_total = null; w.items = w.items.map((i: any) => ({ ...i, unit_cost: null })); }
    return w;
  });
  res.json({ data });
}));

async function validateVehicle(db: Db, ctx: Ctx, vehicleId?: string | null, customerId?: string | null) {
  if (!vehicleId || !customerId) return;
  const v = await db.query(`SELECT 1 FROM vehicles WHERE company_id = $1 AND id = $2 AND customer_id = $3`, [ctx.companyId, vehicleId, customerId]);
  if (!v.rows[0]) throw badRequest('O veículo selecionado não pertence a este cliente.', { fields: { vehicle_id: 'Veículo de outro cliente' } });
}

router.post('/work-orders', h(async (req, res) => {
  const data = workOrderSchema.parse(req.body);
  const row = await tx(req, async (db, ctx) => {
    await validateVehicle(db, ctx, data.vehicle_id, data.customer_id);
    const calc = computeItems(data.items, 0);
    const number = await nextNumber(db, ctx.companyId, 'work_order');
    const w = (await db.query(
      `INSERT INTO work_orders (company_id, number, customer_id, vehicle_id, employee_id, title, problem, diagnosis, status, opened_on, due_date, total, cost_total,
                                estimated_hours, actual_hours, notes, created_by, completed_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, CASE WHEN $9 IN ('concluida','entregue') THEN $10::date END) RETURNING *`,
      [ctx.companyId, number, data.customer_id ?? null, data.vehicle_id ?? null, data.employee_id ?? null, data.title, data.problem ?? null, data.diagnosis ?? null,
        data.status, data.opened_on, data.due_date ?? null, calc.total, calc.cost, data.estimated_hours ?? null, data.actual_hours ?? null, data.notes ?? null, ctx.user.id])).rows[0];
    await insertItems(db, ctx, 'work_order_items', 'work_order_id', w.id, calc.items);
    await audit(db, ctx, 'criou', 'ordem de serviço', w.id, `Abriu a OS #${number}: ${data.title}`);
    return w;
  });
  res.status(201).json({ data: row });
}));

router.put('/work-orders/:id', h(async (req, res) => {
  const data = workOrderSchema.parse(req.body);
  await tx(req, async (db, ctx) => {
    const w = await loadWO(db, ctx, req.params.id);
    if (w.sale_id) throw conflict('Esta OS já foi faturada. Cancele a venda vinculada para editá-la.');
    if (data.status === 'entregue') throw badRequest('Para entregar, use "Faturar e entregar" — isso registra a venda e o recebimento.');
    await validateVehicle(db, ctx, data.vehicle_id, data.customer_id);
    const calc = computeItems(data.items, 0);
    await db.query(
      `UPDATE work_orders SET customer_id=$3, vehicle_id=$4, employee_id=$5, title=$6, problem=$7, diagnosis=$8, status=$9, opened_on=$10, due_date=$11,
              total=$12, cost_total=$13, estimated_hours=$14, actual_hours=$15, notes=$16,
              completed_on = CASE WHEN $9 = 'concluida' THEN coalesce(completed_on, (now() AT TIME ZONE $17)::date) ELSE NULL END
        WHERE company_id = $1 AND id = $2`,
      [ctx.companyId, w.id, data.customer_id ?? null, data.vehicle_id ?? null, data.employee_id ?? null, data.title, data.problem ?? null, data.diagnosis ?? null,
        data.status, data.opened_on, data.due_date ?? null, calc.total, calc.cost, data.estimated_hours ?? null, data.actual_hours ?? null, data.notes ?? null, ctx.company.timezone]);
    await insertItems(db, ctx, 'work_order_items', 'work_order_id', w.id, calc.items);
    await audit(db, ctx, 'atualizou', 'ordem de serviço', w.id, w.status !== data.status
      ? `OS #${w.number}: ${WORK_ORDER_STATUS[w.status as keyof typeof WORK_ORDER_STATUS]} → ${WORK_ORDER_STATUS[data.status]}` : `Atualizou a OS #${w.number}`);
  });
  res.json({ ok: true });
}));

router.patch('/work-orders/:id/status', h(async (req, res) => {
  const status = String(req.body?.status ?? '');
  if (!(status in WORK_ORDER_STATUS) || status === 'entregue') throw badRequest('Situação inválida.');
  await tx(req, async (db, ctx) => {
    const w = await loadWO(db, ctx, req.params.id);
    if (w.sale_id) throw conflict('Esta OS já foi faturada.');
    await db.query(`UPDATE work_orders SET status = $3, completed_on = CASE WHEN $3 = 'concluida' THEN coalesce(completed_on, (now() AT TIME ZONE $4)::date) ELSE NULL END
                    WHERE company_id = $1 AND id = $2`, [ctx.companyId, w.id, status, ctx.company.timezone]);
    await audit(db, ctx, 'atualizou', 'ordem de serviço', w.id, `OS #${w.number}: ${WORK_ORDER_STATUS[w.status as keyof typeof WORK_ORDER_STATUS]} → ${WORK_ORDER_STATUS[status as keyof typeof WORK_ORDER_STATUS]}`);
  });
  res.json({ ok: true });
}));

// Faturar: gera a venda (estoque + financeiro) e marca a OS como entregue
router.post('/work-orders/:id/invoice', requirePermission('vendas', 'write'), h(async (req, res) => {
  const data = workOrderInvoiceSchema.parse(req.body);
  const sale = await tx(req, async (db, ctx) => {
    const w = await loadWO(db, ctx, req.params.id);
    if (w.sale_id) throw conflict('Esta OS já foi faturada.');
    if (w.status === 'cancelada') throw conflict('OS cancelada não pode ser faturada.');
    if (!w.items.length) throw badRequest('Adicione os itens (serviços, peças, mão de obra) antes de faturar.');
    const quoteDiscount = w.quote_id ? (await db.query(`SELECT discount FROM quotes WHERE id = $1`, [w.quote_id])).rows[0]?.discount ?? 0 : 0;
    const sale = await createSale(db, ctx, {
      customer_id: w.customer_id, employee_id: w.employee_id, items: toSaleItems(w.items), discount: quoteDiscount,
      payment_method: data.payment_method, payment_status: data.payment_status, due_date: data.due_date ?? null,
      notes: `OS #${w.number}${w.vehicle_plate ? ` · ${w.vehicle_plate}` : ''}`, source: 'ordem_servico', source_id: w.id,
    });
    await db.query(`UPDATE work_orders SET sale_id = $3, status = 'entregue', completed_on = coalesce(completed_on, (now() AT TIME ZONE $4)::date)
                    WHERE company_id = $1 AND id = $2`, [ctx.companyId, w.id, sale.id, ctx.company.timezone]);
    await audit(db, ctx, 'atualizou', 'ordem de serviço', w.id, `OS #${w.number} faturada (venda #${sale.number}) e entregue`);
    return sale;
  });
  res.status(201).json({ data: sale });
}));

router.delete('/work-orders/:id', h(async (req, res) => {
  await tx(req, async (db, ctx) => {
    const w = await loadWO(db, ctx, req.params.id);
    if (w.sale_id) throw conflict('OS faturadas fazem parte do histórico e não podem ser excluídas.');
    await db.query(`UPDATE quotes SET status = 'aprovado', converted_work_order_id = NULL WHERE company_id = $1 AND converted_work_order_id = $2`, [ctx.companyId, w.id]);
    await db.query(`DELETE FROM work_orders WHERE company_id = $1 AND id = $2`, [ctx.companyId, w.id]);
    await audit(db, ctx, 'excluiu', 'ordem de serviço', w.id, `Excluiu a OS #${w.number}`);
  });
  res.json({ ok: true });
}));

export default router;
