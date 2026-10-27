import { Router } from 'express';
import { collectionContactSchema, financeCategorySchema, fromCents, paymentSchema, toCents, transactionSchema } from '@nexo/shared';
import { audit } from '../lib/audit';
import { Params, resource } from '../lib/crud';
import { badRequest, conflict, notFound } from '../lib/errors';
import { h, isDate, isUuid, pageParams, str } from '../lib/http';
import { requirePermission, tx, type Ctx } from '../middleware/auth';
import type { Request } from 'express';
import { addPayment, cancelTransaction, localDate, recalcTransaction } from '../services/finance';

const router = Router();

router.use(resource({
  path: '/finance-categories', table: 'finance_categories', module: 'financeiro', entity: 'categoria financeira',
  schema: financeCategorySchema,
  columns: ['name', 'kind'],
  search: ['t.name'],
  filters: { kind: (v, p) => (['receita', 'despesa'].includes(v) ? `t.kind = ${p.add(v)}` : null) },
  sort: { name: 'lower(t.name)', kind: 't.kind' },
  defaultSort: 'name', softDelete: true,
  label: (r) => r.name,
  beforeDelete: async (_db, _ctx, row) => { if (row.system_key) throw conflict('Categorias usadas automaticamente pelo sistema não podem ser removidas.'); },
}));

// ---------------------------------------------------------------------------
// Lançamentos (receitas, despesas, contas a pagar e a receber)
// ---------------------------------------------------------------------------
const TX_SELECT = `t.*, c.name AS category_name, cu.name AS customer_name, cu.phone AS customer_phone, su.name AS supplier_name, s.number AS sale_number,
  (t.status IN ('pendente','parcial') AND t.due_date < (now() AT TIME ZONE co.timezone)::date) AS is_overdue,
  ((now() AT TIME ZONE co.timezone)::date - t.due_date) AS days_overdue,
  (t.amount - t.amount_paid) AS balance,
  (SELECT max(cc.contacted_at) FROM collection_contacts cc WHERE cc.company_id = t.company_id AND cc.transaction_id = t.id) AS last_contact_at`;
const TX_JOINS = `JOIN companies co ON co.id = t.company_id
  LEFT JOIN finance_categories c ON c.id = t.category_id AND c.company_id = t.company_id
  LEFT JOIN customers cu ON cu.id = t.customer_id AND cu.company_id = t.company_id
  LEFT JOIN suppliers su ON su.id = t.supplier_id AND su.company_id = t.company_id
  LEFT JOIN sales s ON s.id = t.sale_id AND s.company_id = t.company_id`;

function txWhere(req: Request, ctx: Ctx, p: Params) {
  const where = [`t.company_id = ${p.add(ctx.companyId)}`];
  const kind = req.query.scope === 'cobrancas' ? 'receita' : str(req.query.kind);
  if (kind === 'receita' || kind === 'despesa') where.push(`t.kind = ${p.add(kind)}`);
  const status = str(req.query.status);
  if (status === 'atrasado') where.push(`t.status IN ('pendente','parcial') AND t.due_date < (now() AT TIME ZONE co.timezone)::date`);
  else if (status === 'aberto') where.push(`t.status IN ('pendente','parcial')`);
  else if (status && ['pendente', 'parcial', 'pago', 'cancelado'].includes(status)) where.push(`t.status = ${p.add(status)}`);
  else if (!status) where.push(`t.status <> 'cancelado'`);
  const dateField = str(req.query.dateField) === 'due' ? 't.due_date' : 't.competence_date';
  if (isDate(req.query.from)) where.push(`${dateField} >= ${p.add(req.query.from)}`);
  if (isDate(req.query.to)) where.push(`${dateField} <= ${p.add(req.query.to)}`);
  if (isUuid(req.query.category_id)) where.push(`t.category_id = ${p.add(req.query.category_id)}`);
  if (isUuid(req.query.customer_id)) where.push(`t.customer_id = ${p.add(req.query.customer_id)}`);
  if (isUuid(req.query.supplier_id)) where.push(`t.supplier_id = ${p.add(req.query.supplier_id)}`);
  const q = str(req.query.q);
  if (q) {
    const like = p.add(`%${q}%`);
    where.push(`(t.description ILIKE ${like} OR cu.name ILIKE ${like} OR su.name ILIKE ${like})`);
  }
  return where.join(' AND ');
}

const SORTS: Record<string, string> = { due_date: 't.due_date', competence_date: 't.competence_date', amount: 't.amount', description: 'lower(t.description)', customer: 'lower(cu.name)', created_at: 't.created_at' };

// Contas a receber usa as mesmas rotas, com permissão de "cobrancas"
function txPermission(level: 'read' | 'write') {
  return (req: Request, res: any, next: any) => {
    const mod = req.query.scope === 'cobrancas' || req.body?.scope === 'cobrancas' ? 'cobrancas' : 'financeiro';
    return requirePermission(mod, level)(req, res, next);
  };
}

router.get('/transactions', txPermission('read'), h(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const result = await tx(req, async (db, ctx) => {
    const p = new Params();
    const where = txWhere(req, ctx, p);
    const sort = SORTS[str(req.query.sort) ?? ''] ?? 't.due_date';
    const dir = str(req.query.dir) === 'desc' ? 'DESC' : 'ASC';
    const totals = (await db.query(
      `SELECT count(*)::int AS n, coalesce(sum(t.amount),0) AS amount, coalesce(sum(t.amount_paid),0) AS paid FROM financial_transactions t ${TX_JOINS} WHERE ${where}`, p.values)).rows[0];
    const rows = (await db.query(`SELECT ${TX_SELECT} FROM financial_transactions t ${TX_JOINS} WHERE ${where} ORDER BY ${sort} ${dir}, t.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`, p.values)).rows;
    return { data: rows, total: totals.n, page, pageSize, sums: { amount: totals.amount, paid: totals.paid, balance: fromCents(toCents(totals.amount) - toCents(totals.paid)) } };
  });
  res.json(result);
}));

router.get('/transactions/:id', txPermission('read'), h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const data = await tx(req, async (db, ctx) => {
    const t = (await db.query(`SELECT ${TX_SELECT} FROM financial_transactions t ${TX_JOINS} WHERE t.company_id = $1 AND t.id = $2`, [ctx.companyId, req.params.id])).rows[0];
    if (!t) throw notFound('Lançamento não encontrado');
    t.payments = (await db.query(`SELECT p.*, u.name AS user_name FROM transaction_payments p LEFT JOIN users u ON u.id = p.created_by WHERE p.company_id = $1 AND p.transaction_id = $2 ORDER BY p.paid_on, p.created_at`, [ctx.companyId, t.id])).rows;
    t.contacts = (await db.query(`SELECT c.*, u.name AS user_name FROM collection_contacts c LEFT JOIN users u ON u.id = c.user_id WHERE c.company_id = $1 AND c.transaction_id = $2 ORDER BY c.contacted_at DESC`, [ctx.companyId, t.id])).rows;
    return t;
  });
  res.json({ data });
}));

router.post('/transactions', txPermission('write'), h(async (req, res) => {
  const data = transactionSchema.parse(req.body);
  if (req.body?.scope === 'cobrancas' && data.kind !== 'receita') throw badRequest('Em Contas a receber só é possível lançar receitas.');
  const ids = await tx(req, async (db, ctx) => {
    const n = data.installments ?? 1;
    if (n > 1 && data.paid_on) throw badRequest('Lançamentos parcelados são criados como pendentes. Registre os pagamentos em cada parcela.');
    // divide em parcelas sem perder centavos: a última parcela absorve o resto
    const totalC = toCents(data.amount);
    const baseC = Math.floor(totalC / n);
    const created: string[] = [];
    for (let i = 0; i < n; i++) {
      const amountC = i === n - 1 ? totalC - baseC * (n - 1) : baseC;
      const due = n > 1 ? addMonths(data.due_date, i) : data.due_date;
      const r = await db.query(
        `INSERT INTO financial_transactions (company_id, kind, description, category_id, amount, competence_date, due_date, payment_method,
                                             customer_id, supplier_id, notes, installment, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [ctx.companyId, data.kind, data.description, data.category_id ?? null, fromCents(amountC), n > 1 ? addMonths(data.competence_date, i) : data.competence_date, due,
          data.payment_method ?? null, data.customer_id ?? null, data.supplier_id ?? null, data.notes ?? null, n > 1 ? `${i + 1}/${n}` : null, ctx.user.id]);
      created.push(r.rows[0].id);
      if (data.paid_on) await addPayment(db, ctx, r.rows[0].id, { amount: fromCents(amountC), paid_on: data.paid_on, method: data.payment_method });
    }
    await audit(db, ctx, 'criou', 'lancamento', created[0], `Lançou ${data.kind}: ${data.description} (${data.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}${n > 1 ? ` em ${n}x` : ''})`);
    return created;
  });
  res.status(201).json({ data: { ids } });
}));

function addMonths(d: string, months: number) {
  const [y, m, day] = d.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

router.put('/transactions/:id', txPermission('write'), h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const data = transactionSchema.omit({ paid_on: true, installments: true }).parse(req.body);
  await tx(req, async (db, ctx) => {
    const t = (await db.query(`SELECT * FROM financial_transactions WHERE company_id = $1 AND id = $2 FOR UPDATE`, [ctx.companyId, req.params.id])).rows[0];
    if (!t) throw notFound('Lançamento não encontrado');
    if (t.status === 'cancelado') throw conflict('Lançamentos cancelados não podem ser editados.');
    if (t.source !== 'manual' && (toCents(data.amount) !== toCents(t.amount) || data.kind !== t.kind))
      throw conflict('Este lançamento foi gerado automaticamente (venda/compra). Altere o valor pela origem ou cancele-a.');
    if (toCents(data.amount) < toCents(t.amount_paid)) throw badRequest('O valor não pode ser menor que o total já pago.');
    await db.query(
      `UPDATE financial_transactions SET kind=$3, description=$4, category_id=$5, amount=$6, competence_date=$7, due_date=$8, payment_method=$9,
              customer_id=$10, supplier_id=$11, notes=$12 WHERE company_id = $1 AND id = $2`,
      [ctx.companyId, t.id, data.kind, data.description, data.category_id ?? null, data.amount, data.competence_date, data.due_date,
        data.payment_method ?? null, data.customer_id ?? null, data.supplier_id ?? null, data.notes ?? null]);
    await recalcTransaction(db, ctx.companyId, t.id);
    await audit(db, ctx, 'atualizou', 'lancamento', t.id, `Atualizou o lançamento: ${data.description}`);
  });
  res.json({ ok: true });
}));

router.post('/transactions/:id/cancel', txPermission('write'), h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  await tx(req, async (db, ctx) => {
    const t = (await db.query(`SELECT * FROM financial_transactions WHERE company_id = $1 AND id = $2 FOR UPDATE`, [ctx.companyId, req.params.id])).rows[0];
    if (!t) throw notFound('Lançamento não encontrado');
    if (t.status === 'cancelado') throw conflict('Este lançamento já está cancelado.');
    if (t.source === 'venda') throw conflict('Este lançamento pertence a uma venda. Cancele a venda para estornar estoque e financeiro juntos.');
    await cancelTransaction(db, ctx, t.id);
    await audit(db, ctx, 'cancelou', 'lancamento', t.id, `Cancelou o lançamento: ${t.description}`);
  });
  res.json({ ok: true });
}));

router.delete('/transactions/:id', txPermission('write'), h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  await tx(req, async (db, ctx) => {
    const t = (await db.query(`SELECT * FROM financial_transactions WHERE company_id = $1 AND id = $2`, [ctx.companyId, req.params.id])).rows[0];
    if (!t) throw notFound('Lançamento não encontrado');
    if (t.source !== 'manual') throw conflict('Lançamentos automáticos não podem ser excluídos; cancele a origem.');
    const pays = await db.query(`SELECT 1 FROM transaction_payments WHERE company_id = $1 AND transaction_id = $2 LIMIT 1`, [ctx.companyId, t.id]);
    if (pays.rows[0]) throw conflict('Este lançamento possui pagamentos registrados. Use "Cancelar" para preservar o histórico.');
    await db.query(`DELETE FROM financial_transactions WHERE company_id = $1 AND id = $2`, [ctx.companyId, t.id]);
    await audit(db, ctx, 'excluiu', 'lancamento', t.id, `Excluiu o lançamento: ${t.description}`);
  });
  res.json({ ok: true });
}));

router.post('/transactions/:id/payments', txPermission('write'), h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const data = paymentSchema.parse(req.body);
  await tx(req, async (db, ctx) => {
    await addPayment(db, ctx, req.params.id, data);
    await audit(db, ctx, 'criou', 'pagamento', req.params.id, `Registrou pagamento de ${data.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  });
  res.status(201).json({ ok: true });
}));

router.post('/transactions/:id/payments/:paymentId/reverse', txPermission('write'), h(async (req, res) => {
  if (!isUuid(req.params.id) || !isUuid(req.params.paymentId)) throw notFound();
  await tx(req, async (db, ctx) => {
    const t = (await db.query(`SELECT source, status FROM financial_transactions WHERE company_id = $1 AND id = $2`, [ctx.companyId, req.params.id])).rows[0];
    if (!t) throw notFound();
    if (t.status === 'cancelado') throw conflict('Lançamento cancelado.');
    const r = await db.query(`UPDATE transaction_payments SET reversed_at = now() WHERE company_id = $1 AND transaction_id = $2 AND id = $3 AND reversed_at IS NULL RETURNING amount`,
      [ctx.companyId, req.params.id, req.params.paymentId]);
    if (!r.rows[0]) throw notFound('Pagamento não encontrado ou já estornado.');
    await recalcTransaction(db, ctx.companyId, req.params.id);
    await audit(db, ctx, 'estornou', 'pagamento', req.params.id, `Estornou pagamento de ${Number(r.rows[0].amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  });
  res.json({ ok: true });
}));

router.post('/transactions/:id/contacts', requirePermission('cobrancas', 'write'), h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const data = collectionContactSchema.parse(req.body);
  await tx(req, async (db, ctx) => {
    const t = (await db.query(`SELECT description, kind FROM financial_transactions WHERE company_id = $1 AND id = $2`, [ctx.companyId, req.params.id])).rows[0];
    if (!t) throw notFound();
    if (t.kind !== 'receita') throw badRequest('Contatos de cobrança só se aplicam a valores a receber.');
    await db.query(`INSERT INTO collection_contacts (company_id, transaction_id, channel, outcome, promised_date, notes, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [ctx.companyId, req.params.id, data.channel, data.outcome, data.promised_date ?? null, data.notes ?? null, ctx.user.id]);
    await audit(db, ctx, 'criou', 'cobranca', req.params.id, `Registrou contato de cobrança: ${t.description}`);
  });
  res.status(201).json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Resumo financeiro. Faturamento ≠ lucro ≠ saldo de caixa:
//  - faturamento: receitas reconhecidas no período (regime de competência)
//  - resultado estimado: receitas − despesas do período (competência)
//  - saldo de caixa: tudo o que efetivamente entrou − saiu (pagamentos), acumulado
// ---------------------------------------------------------------------------
router.get('/finance/summary', requirePermission('financeiro'), h(async (req, res) => {
  const data = await tx(req, async (db, ctx) => {
    const today = await localDate(db, ctx);
    const from = isDate(req.query.from) ? req.query.from : today.slice(0, 8) + '01';
    const to = isDate(req.query.to) ? req.query.to : today;
    const one = (sql: string, params: unknown[]) => db.query(sql, params).then((r) => r.rows[0]);
    const P = [ctx.companyId, from, to];
    const comp = await one(
      `SELECT coalesce(sum(amount) FILTER (WHERE kind='receita'),0) AS revenue, coalesce(sum(amount) FILTER (WHERE kind='despesa'),0) AS expenses
         FROM financial_transactions WHERE company_id=$1 AND status <> 'cancelado' AND competence_date BETWEEN $2 AND $3`, P);
    const cashPeriod = await one(
      `SELECT coalesce(sum(p.amount) FILTER (WHERE t.kind='receita'),0) AS inflow, coalesce(sum(p.amount) FILTER (WHERE t.kind='despesa'),0) AS outflow
         FROM transaction_payments p JOIN financial_transactions t ON t.id = p.transaction_id
        WHERE p.company_id=$1 AND p.reversed_at IS NULL AND p.paid_on BETWEEN $2 AND $3`, P);
    const cashTotal = await one(
      `SELECT coalesce(sum(CASE WHEN t.kind='receita' THEN p.amount ELSE -p.amount END),0) AS balance
         FROM transaction_payments p JOIN financial_transactions t ON t.id = p.transaction_id
        WHERE p.company_id=$1 AND p.reversed_at IS NULL AND p.paid_on <= $2`, [ctx.companyId, to]);
    const open = await one(
      `SELECT coalesce(sum(amount-amount_paid) FILTER (WHERE kind='receita'),0) AS receivable,
              coalesce(sum(amount-amount_paid) FILTER (WHERE kind='despesa'),0) AS payable,
              coalesce(sum(amount-amount_paid) FILTER (WHERE kind='receita' AND due_date < $2),0) AS receivable_overdue,
              coalesce(sum(amount-amount_paid) FILTER (WHERE kind='despesa' AND due_date < $2),0) AS payable_overdue,
              count(*) FILTER (WHERE kind='receita' AND due_date < $2)::int AS receivable_overdue_count,
              count(*) FILTER (WHERE kind='despesa' AND due_date < $2)::int AS payable_overdue_count
         FROM financial_transactions WHERE company_id=$1 AND status IN ('pendente','parcial')`, [ctx.companyId, today]);
    const cogs = await one(
      `SELECT coalesce(sum(s.cost_total),0) AS cost, coalesce(sum(s.total),0) AS sales FROM sales s
        WHERE s.company_id=$1 AND s.status='concluida' AND (s.sold_at AT TIME ZONE $4)::date BETWEEN $2 AND $3`, [...P, ctx.company.timezone]);
    const monthly = (await db.query(
      `WITH months AS (SELECT generate_series(date_trunc('month', $2::date) - interval '11 months', date_trunc('month', $2::date), interval '1 month')::date AS m)
       SELECT to_char(m, 'YYYY-MM') AS month,
              coalesce(sum(t.amount) FILTER (WHERE t.kind='receita'),0) AS revenue,
              coalesce(sum(t.amount) FILTER (WHERE t.kind='despesa'),0) AS expenses
         FROM months LEFT JOIN financial_transactions t ON t.company_id=$1 AND t.status <> 'cancelado' AND date_trunc('month', t.competence_date) = months.m
        GROUP BY m ORDER BY m`, [ctx.companyId, to])).rows;
    const byCategory = (await db.query(
      `SELECT coalesce(c.name, 'Sem categoria') AS name, t.kind, sum(t.amount) AS total FROM financial_transactions t
         LEFT JOIN finance_categories c ON c.id = t.category_id
        WHERE t.company_id=$1 AND t.status <> 'cancelado' AND t.competence_date BETWEEN $2 AND $3
        GROUP BY 1, 2 ORDER BY 3 DESC`, P)).rows;
    const cashflow = (await db.query(
      `WITH days AS (SELECT generate_series($2::date, $3::date, interval '1 day')::date AS d)
       SELECT d AS date,
              coalesce(sum(p.amount) FILTER (WHERE t.kind='receita'),0) AS inflow,
              coalesce(sum(p.amount) FILTER (WHERE t.kind='despesa'),0) AS outflow
         FROM days LEFT JOIN transaction_payments p ON p.company_id=$1 AND p.reversed_at IS NULL AND p.paid_on = days.d
         LEFT JOIN financial_transactions t ON t.id = p.transaction_id
        GROUP BY d ORDER BY d`, P)).rows;
    const hasData = (await one(`SELECT EXISTS (SELECT 1 FROM financial_transactions WHERE company_id=$1) AS x`, [ctx.companyId])).x;
    return {
      period: { from, to },
      revenue: comp.revenue,
      expenses: comp.expenses,
      result: fromCents(toCents(comp.revenue) - toCents(comp.expenses)),
      grossMargin: cogs.sales > 0 ? (cogs.sales - cogs.cost) / cogs.sales : null,
      salesCost: cogs.cost,
      cash: { inflow: cashPeriod.inflow, outflow: cashPeriod.outflow, net: fromCents(toCents(cashPeriod.inflow) - toCents(cashPeriod.outflow)), balance: cashTotal.balance },
      open,
      monthly,
      byCategory,
      cashflow,
      hasData,
    };
  });
  res.json({ data });
}));

export default router;
