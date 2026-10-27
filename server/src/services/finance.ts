import { toCents } from '@nexo/shared';
import type { Db } from '../db/pool';
import { badRequest, notFound } from '../lib/errors';
import type { Ctx } from '../middleware/auth';

export const DEFAULT_CATEGORIES: { name: string; kind: 'receita' | 'despesa'; system_key?: string }[] = [
  { name: 'Vendas', kind: 'receita', system_key: 'vendas' },
  { name: 'Serviços prestados', kind: 'receita', system_key: 'servicos' },
  { name: 'Mensalidades', kind: 'receita' },
  { name: 'Outras receitas', kind: 'receita' },
  { name: 'Mercadorias e insumos', kind: 'despesa', system_key: 'compras' },
  { name: 'Aluguel', kind: 'despesa' },
  { name: 'Salários e pró-labore', kind: 'despesa' },
  { name: 'Impostos e taxas', kind: 'despesa' },
  { name: 'Água, luz e internet', kind: 'despesa' },
  { name: 'Marketing', kind: 'despesa' },
  { name: 'Manutenção', kind: 'despesa', system_key: 'manutencao' },
  { name: 'Transporte e entregas', kind: 'despesa' },
  { name: 'Outras despesas', kind: 'despesa' },
];

export async function seedCategories(db: Db, companyId: string) {
  for (const c of DEFAULT_CATEGORIES) {
    await db.query(
      `INSERT INTO finance_categories (company_id, name, kind, system_key) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [companyId, c.name, c.kind, c.system_key ?? null],
    );
  }
}

export async function systemCategory(db: Db, companyId: string, key: string) {
  const r = await db.query(`SELECT id FROM finance_categories WHERE company_id = $1 AND system_key = $2`, [companyId, key]);
  return (r.rows[0]?.id as string) ?? null;
}

/** Recalcula valor pago e situação a partir dos pagamentos registrados. */
export async function recalcTransaction(db: Db, companyId: string, txId: string) {
  const r = await db.query(
    `SELECT t.amount, t.status,
            coalesce(sum(p.amount) FILTER (WHERE p.reversed_at IS NULL), 0) AS paid,
            max(p.paid_on) FILTER (WHERE p.reversed_at IS NULL) AS last_paid
       FROM financial_transactions t LEFT JOIN transaction_payments p ON p.transaction_id = t.id AND p.company_id = t.company_id
      WHERE t.company_id = $1 AND t.id = $2 GROUP BY t.id`,
    [companyId, txId],
  );
  const t = r.rows[0];
  if (!t) throw notFound('Lançamento não encontrado');
  if (t.status === 'cancelado') return;
  const paid = toCents(t.paid), amount = toCents(t.amount);
  if (paid > amount) throw badRequest('O total pago não pode ser maior que o valor do lançamento.');
  const status = paid === 0 ? 'pendente' : paid < amount ? 'parcial' : 'pago';
  await db.query(
    `UPDATE financial_transactions SET amount_paid = $3, status = $4, paid_at = $5 WHERE company_id = $1 AND id = $2`,
    [companyId, txId, paid / 100, status, status === 'pago' ? t.last_paid : null],
  );
}

export async function addPayment(db: Db, ctx: Ctx, txId: string, p: { amount: number; paid_on: string; method?: string | null; notes?: string | null }) {
  const t = await db.query(`SELECT amount, amount_paid, status FROM financial_transactions WHERE company_id = $1 AND id = $2 FOR UPDATE`, [ctx.companyId, txId]);
  const row = t.rows[0];
  if (!row) throw notFound('Lançamento não encontrado');
  if (row.status === 'cancelado') throw badRequest('Não é possível registrar pagamento em um lançamento cancelado.');
  const remaining = toCents(row.amount) - toCents(row.amount_paid);
  if (toCents(p.amount) > remaining) throw badRequest(`O valor excede o saldo em aberto (R$ ${(remaining / 100).toFixed(2).replace('.', ',')}).`);
  const r = await db.query(
    `INSERT INTO transaction_payments (company_id, transaction_id, amount, paid_on, method, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [ctx.companyId, txId, p.amount, p.paid_on, p.method ?? null, p.notes ?? null, ctx.user.id],
  );
  await recalcTransaction(db, ctx.companyId, txId);
  return r.rows[0].id as string;
}

/** Cancela um lançamento preservando o histórico: pagamentos são estornados, não apagados. */
export async function cancelTransaction(db: Db, ctx: Ctx, txId: string) {
  await db.query(`UPDATE transaction_payments SET reversed_at = now() WHERE company_id = $1 AND transaction_id = $2 AND reversed_at IS NULL`, [ctx.companyId, txId]);
  await db.query(`UPDATE financial_transactions SET status = 'cancelado', canceled_at = now(), amount_paid = 0, paid_at = NULL WHERE company_id = $1 AND id = $2`, [ctx.companyId, txId]);
}

export async function localDate(db: Db, ctx: Ctx, iso?: string | null) {
  const r = await db.query(`SELECT (coalesce($1::timestamptz, now()) AT TIME ZONE $2)::date AS d`, [iso ?? null, ctx.company.timezone]);
  return r.rows[0].d as string;
}
