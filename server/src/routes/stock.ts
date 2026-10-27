import { Router } from 'express';
import { canDo, fromCents, productSchema, purchaseReceiveSchema, purchaseSchema, stockMovementSchema, supplierQuoteSchema, supplierSchema, toCents, lineTotal } from '@nexo/shared';
import { audit } from '../lib/audit';
import { Params, eq, eqId, resource } from '../lib/crud';
import { badRequest, conflict, notFound } from '../lib/errors';
import { h, isUuid, pageParams, str } from '../lib/http';
import { modulePermission, requirePermission, tx } from '../middleware/auth';
import { addPayment, systemCategory } from '../services/finance';
import { moveStock } from '../services/stock';

const router = Router();
const digits = (v?: string | null) => (v ? v.replace(/\D/g, '') : v);

// ---------------------------------------------------------------------------
// Fornecedores
// ---------------------------------------------------------------------------
router.use(resource({
  path: '/suppliers', table: 'suppliers', module: 'fornecedores', entity: 'fornecedor',
  schema: supplierSchema,
  columns: ['name', 'contact_name', 'phone', 'email', 'document', 'category', 'address', 'products_supplied', 'lead_time_days', 'quality_rating', 'reliability_rating', 'notes'],
  select: `t.*, (SELECT count(*)::int FROM purchases p WHERE p.company_id = t.company_id AND p.supplier_id = t.id AND p.status = 'recebido') AS purchases_count,
           (SELECT max(p.ordered_on) FROM purchases p WHERE p.company_id = t.company_id AND p.supplier_id = t.id) AS last_purchase_on`,
  search: ['t.name', 't.contact_name', 't.category', 't.products_supplied', 't.phone'],
  filters: { category: eq('t.category') },
  sort: { name: 'lower(t.name)', category: 't.category', quality_rating: 't.quality_rating', reliability_rating: 't.reliability_rating', last_purchase_on: 'last_purchase_on' },
  defaultSort: 'name', softDelete: true,
  label: (r) => r.name,
  prepare: (_db, _ctx, d) => ({ ...d, document: digits(d.document) }),
  detail: async (db, ctx, row) => {
    const q = (sql: string) => db.query(sql, [ctx.companyId, row.id]).then((r) => r.rows);
    const [quotes, purchases, products] = await Promise.all([
      q(`SELECT q.*, p.name AS product_name FROM supplier_quotes q LEFT JOIN products p ON p.id = q.product_id WHERE q.company_id = $1 AND q.supplier_id = $2 ORDER BY q.quoted_on DESC`),
      q(`SELECT id, ordered_on, expected_on, received_on, status, total, delivered_on_time FROM purchases WHERE company_id = $1 AND supplier_id = $2 ORDER BY ordered_on DESC`),
      q(`SELECT id, name, stock_qty, min_stock, cost_price FROM products WHERE company_id = $1 AND supplier_id = $2 AND archived_at IS NULL ORDER BY name`),
    ]);
    const received = purchases.filter((p: any) => p.status === 'recebido' && p.delivered_on_time !== null);
    const onTimeRate = received.length ? received.filter((p: any) => p.delivered_on_time).length / received.length : null;
    return { ...row, quotes, purchases, products, onTimeRate };
  },
}));

router.use(resource({
  path: '/supplier-quotes', table: 'supplier_quotes', module: 'fornecedores', entity: 'cotação',
  schema: supplierQuoteSchema,
  columns: ['supplier_id', 'product_id', 'description', 'price', 'quoted_on', 'valid_until', 'notes'],
  select: 't.*, s.name AS supplier_name, p.name AS product_name',
  joins: 'JOIN suppliers s ON s.id = t.supplier_id AND s.company_id = t.company_id LEFT JOIN products p ON p.id = t.product_id AND p.company_id = t.company_id',
  search: ['t.description', 's.name', 'p.name'],
  filters: { supplier_id: eqId('t.supplier_id'), product_id: eqId('t.product_id') },
  sort: { quoted_on: 't.quoted_on', price: 't.price', supplier: 'lower(s.name)', description: 't.description' },
  defaultSort: 'quoted_on', defaultDir: 'desc',
  label: (r) => r.description,
}));

// ---------------------------------------------------------------------------
// Produtos
// ---------------------------------------------------------------------------
const PRODUCT_SELECT = `t.*, s.name AS supplier_name,
  (t.stock_qty <= t.min_stock AND t.min_stock > 0) AS is_low,
  (t.stock_qty <= 0) AS is_out,
  (t.track_expiry AND t.expiry_date IS NOT NULL AND t.expiry_date <= current_date + 30) AS is_expiring,
  (SELECT max(m.created_at) FROM stock_movements m WHERE m.company_id = t.company_id AND m.product_id = t.id AND m.type = 'venda') AS last_sale_at`;

router.get('/products/categories', requirePermission('estoque'), h(async (req, res) => {
  const rows = await tx(req, async (db, ctx) => (await db.query(
    `SELECT DISTINCT category FROM products WHERE company_id = $1 AND category IS NOT NULL AND archived_at IS NULL ORDER BY 1`, [ctx.companyId])).rows);
  res.json({ data: rows.map((r) => r.category) });
}));

router.use(resource({
  path: '/products', table: 'products', module: 'estoque', entity: 'produto',
  schema: productSchema,
  columns: ['sku', 'barcode', 'name', 'category', 'unit', 'supplier_id', 'cost_price', 'sale_price', 'min_stock', 'track_expiry', 'expiry_date', 'active', 'notes'],
  select: PRODUCT_SELECT,
  joins: 'LEFT JOIN suppliers s ON s.id = t.supplier_id AND s.company_id = t.company_id',
  search: ['t.name', 't.sku', 't.barcode', 't.category'],
  filters: {
    category: eq('t.category'),
    supplier_id: eqId('t.supplier_id'),
    status: (v) => ({
      low: 't.stock_qty <= t.min_stock AND t.min_stock > 0',
      out: 't.stock_qty <= 0',
      expiring: 't.track_expiry AND t.expiry_date IS NOT NULL AND t.expiry_date <= current_date + 30',
      inactive: 'NOT t.active',
    } as Record<string, string>)[v] ?? null,
  },
  sort: { name: 'lower(t.name)', stock_qty: 't.stock_qty', sale_price: 't.sale_price', category: 't.category', expiry_date: 't.expiry_date', last_sale_at: 'last_sale_at' },
  defaultSort: 'name', softDelete: true,
  optionLabel: `t.name || coalesce(' · ' || t.sku, '')`,
  label: (r) => r.name,
  prepare: (_db, _ctx, d) => {
    if (d.track_expiry === false) d.expiry_date = null;
    return d;
  },
  afterWrite: async (db, ctx, row, data, existing) => {
    if (!existing && data.initial_stock > 0) {
      await moveStock(db, ctx, { productId: row.id, delta: data.initial_stock, type: 'entrada', unitCost: row.cost_price, reason: 'Estoque inicial' });
    }
  },
  redact: (row, ctx) => (canDo(ctx.role, 'viewCosts') ? row : { ...row, cost_price: null }),
  detail: async (db, ctx, row) => {
    const q = (sql: string) => db.query(sql, [ctx.companyId, row.id]).then((r) => r.rows);
    const [movements, sales30, quotes] = await Promise.all([
      q(`SELECT m.*, u.name AS user_name FROM stock_movements m LEFT JOIN users u ON u.id = m.user_id
          WHERE m.company_id = $1 AND m.product_id = $2 ORDER BY m.created_at DESC LIMIT 100`),
      q(`SELECT coalesce(sum(i.quantity), 0) AS qty, coalesce(sum(i.total), 0) AS amount FROM sale_items i JOIN sales s ON s.id = i.sale_id
          WHERE i.company_id = $1 AND i.product_id = $2 AND s.status = 'concluida' AND s.sold_at > now() - interval '30 days'`),
      q(`SELECT q.price, q.quoted_on, s.name AS supplier_name FROM supplier_quotes q JOIN suppliers s ON s.id = q.supplier_id
          WHERE q.company_id = $1 AND q.product_id = $2 ORDER BY q.quoted_on DESC LIMIT 10`),
    ]);
    return { ...row, movements, sold30: sales30[0], supplierQuotes: quotes };
  },
}));

// ---------------------------------------------------------------------------
// Movimentações de estoque
// ---------------------------------------------------------------------------
router.get('/stock-movements', requirePermission('estoque'), h(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const result = await tx(req, async (db, ctx) => {
    const p = new Params();
    const where = [`m.company_id = ${p.add(ctx.companyId)}`];
    if (isUuid(req.query.product_id)) where.push(`m.product_id = ${p.add(req.query.product_id)}`);
    const type = str(req.query.type);
    if (type) where.push(`m.type = ${p.add(type)}`);
    if (str(req.query.from)) where.push(`m.created_at >= ${p.add(req.query.from)}::date`);
    if (str(req.query.to)) where.push(`m.created_at < ${p.add(req.query.to)}::date + 1`);
    const q = str(req.query.q);
    if (q) where.push(`p.name ILIKE ${p.add('%' + q + '%')}`);
    const w = where.join(' AND ');
    const total = (await db.query(`SELECT count(*)::int n FROM stock_movements m JOIN products p ON p.id = m.product_id WHERE ${w}`, p.values)).rows[0].n;
    const rows = (await db.query(
      `SELECT m.*, p.name AS product_name, p.unit, u.name AS user_name FROM stock_movements m
         JOIN products p ON p.id = m.product_id LEFT JOIN users u ON u.id = m.user_id
        WHERE ${w} ORDER BY m.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`, p.values)).rows;
    return { data: rows, total, page, pageSize };
  });
  res.json(result);
}));

router.post('/stock-movements', requirePermission('estoque', 'write'), h(async (req, res) => {
  const data = stockMovementSchema.parse(req.body);
  const result = await tx(req, async (db, ctx) => {
    const p = (await db.query(`SELECT id, name, stock_qty, archived_at FROM products WHERE company_id = $1 AND id = $2`, [ctx.companyId, data.product_id])).rows[0];
    if (!p) throw notFound('Produto não encontrado');
    if (p.archived_at) throw badRequest('Produto arquivado. Restaure-o para movimentar o estoque.');
    let delta = data.quantity;
    if (data.type === 'saida') delta = -data.quantity;
    if (data.type === 'ajuste') delta = Math.round((data.quantity - p.stock_qty) * 1000) / 1000;
    if (delta === 0) throw badRequest('O saldo informado é igual ao saldo atual.');
    const m = await moveStock(db, ctx, { productId: p.id, delta, type: data.type, unitCost: data.unit_cost ?? null, reason: data.reason ?? null });
    if (data.type === 'entrada' && data.unit_cost != null) {
      await db.query(`UPDATE products SET cost_price = $3 WHERE company_id = $1 AND id = $2`, [ctx.companyId, p.id, data.unit_cost]);
    }
    await audit(db, ctx, 'criou', 'estoque', p.id, `${data.type === 'entrada' ? 'Entrada' : data.type === 'saida' ? 'Saída' : 'Ajuste'} de estoque em ${p.name}: ${delta > 0 ? '+' : ''}${delta.toLocaleString('pt-BR')}`);
    return m;
  });
  res.status(201).json({ data: result });
}));

// ---------------------------------------------------------------------------
// Compras de fornecedores
// ---------------------------------------------------------------------------
router.use('/purchases', modulePermission('fornecedores'));

router.get('/purchases', h(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const result = await tx(req, async (db, ctx) => {
    const p = new Params();
    const where = [`t.company_id = ${p.add(ctx.companyId)}`];
    if (isUuid(req.query.supplier_id)) where.push(`t.supplier_id = ${p.add(req.query.supplier_id)}`);
    const st = str(req.query.status);
    if (st) where.push(`t.status = ${p.add(st)}`);
    const q = str(req.query.q);
    if (q) where.push(`s.name ILIKE ${p.add('%' + q + '%')}`);
    const w = where.join(' AND ');
    const total = (await db.query(`SELECT count(*)::int n FROM purchases t JOIN suppliers s ON s.id = t.supplier_id WHERE ${w}`, p.values)).rows[0].n;
    const rows = (await db.query(
      `SELECT t.*, s.name AS supplier_name, (SELECT count(*)::int FROM purchase_items i WHERE i.purchase_id = t.id) AS items_count
         FROM purchases t JOIN suppliers s ON s.id = t.supplier_id WHERE ${w} ORDER BY t.ordered_on DESC, t.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`, p.values)).rows;
    return { data: rows, total, page, pageSize };
  });
  res.json(result);
}));

router.get('/purchases/:id', h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const data = await tx(req, async (db, ctx) => {
    const p = (await db.query(`SELECT t.*, s.name AS supplier_name FROM purchases t JOIN suppliers s ON s.id = t.supplier_id WHERE t.company_id = $1 AND t.id = $2`, [ctx.companyId, req.params.id])).rows[0];
    if (!p) throw notFound();
    p.items = (await db.query(`SELECT i.*, pr.name AS product_name FROM purchase_items i LEFT JOIN products pr ON pr.id = i.product_id WHERE i.company_id = $1 AND i.purchase_id = $2`, [ctx.companyId, p.id])).rows;
    return p;
  });
  res.json({ data });
}));

router.post('/purchases', h(async (req, res) => {
  const data = purchaseSchema.parse(req.body);
  const row = await tx(req, async (db, ctx) => {
    const totalC = data.items.reduce((s, i) => s + toCents(lineTotal(i.quantity, i.unit_cost)), 0);
    const p = (await db.query(
      `INSERT INTO purchases (company_id, supplier_id, ordered_on, expected_on, notes, total, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [ctx.companyId, data.supplier_id, data.ordered_on, data.expected_on ?? null, data.notes ?? null, fromCents(totalC), ctx.user.id])).rows[0];
    for (const i of data.items) {
      await db.query(`INSERT INTO purchase_items (company_id, purchase_id, product_id, description, quantity, unit_cost, total) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [ctx.companyId, p.id, i.product_id ?? null, i.description, i.quantity, i.unit_cost, lineTotal(i.quantity, i.unit_cost)]);
    }
    await audit(db, ctx, 'criou', 'compra', p.id, `Registrou pedido de compra (${fromCents(totalC).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`);
    return p;
  });
  res.status(201).json({ data: row });
}));

// Recebimento: entrada no estoque + despesa no financeiro, numa única transação
router.post('/purchases/:id/receive', h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const data = purchaseReceiveSchema.parse(req.body);
  await tx(req, async (db, ctx) => {
    const p = (await db.query(`SELECT t.*, s.name AS supplier_name FROM purchases t JOIN suppliers s ON s.id = t.supplier_id WHERE t.company_id = $1 AND t.id = $2 FOR UPDATE OF t`, [ctx.companyId, req.params.id])).rows[0];
    if (!p) throw notFound();
    if (p.status !== 'pedido') throw conflict('Esta compra já foi recebida ou cancelada.');
    const items = (await db.query(`SELECT * FROM purchase_items WHERE company_id = $1 AND purchase_id = $2`, [ctx.companyId, p.id])).rows;
    for (const i of items) {
      if (!i.product_id) continue;
      await moveStock(db, ctx, { productId: i.product_id, delta: i.quantity, type: 'compra', unitCost: i.unit_cost, reason: `Compra de ${p.supplier_name}`, refType: 'purchase', refId: p.id });
      await db.query(`UPDATE products SET cost_price = $3 WHERE company_id = $1 AND id = $2`, [ctx.companyId, i.product_id, i.unit_cost]);
    }
    const onTime = p.expected_on ? data.received_on <= p.expected_on : null;
    await db.query(`UPDATE purchases SET status = 'recebido', received_on = $3, delivered_on_time = $4 WHERE company_id = $1 AND id = $2`, [ctx.companyId, p.id, data.received_on, onTime]);
    if (p.total > 0) {
      const cat = await systemCategory(db, ctx.companyId, 'compras');
      const t = await db.query(
        `INSERT INTO financial_transactions (company_id, kind, description, category_id, amount, competence_date, due_date, payment_method, supplier_id, purchase_id, source, created_by)
         VALUES ($1,'despesa',$2,$3,$4,$5,$6,$7,$8,$9,'compra',$10) RETURNING id`,
        [ctx.companyId, `Compra - ${p.supplier_name}`, cat, p.total, data.received_on, data.due_date, data.payment_method ?? null, p.supplier_id, p.id, ctx.user.id]);
      if (data.paid) await addPayment(db, ctx, t.rows[0].id, { amount: p.total, paid_on: data.received_on, method: data.payment_method });
    }
    await audit(db, ctx, 'atualizou', 'compra', p.id, `Recebeu a compra de ${p.supplier_name}`);
  });
  res.json({ ok: true });
}));

router.post('/purchases/:id/cancel', h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  await tx(req, async (db, ctx) => {
    const r = await db.query(`UPDATE purchases SET status = 'cancelado' WHERE company_id = $1 AND id = $2 AND status = 'pedido' RETURNING id`, [ctx.companyId, req.params.id]);
    if (!r.rows[0]) throw conflict('Apenas pedidos ainda não recebidos podem ser cancelados.');
    await audit(db, ctx, 'cancelou', 'compra', req.params.id, 'Cancelou um pedido de compra');
  });
  res.json({ ok: true });
}));

export default router;
