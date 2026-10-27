import { fromCents, lineTotal, toCents } from '@nexo/shared';
import type { Db } from '../db/pool';
import { audit, nextNumber } from '../lib/audit';
import { badRequest, conflict, notFound } from '../lib/errors';
import type { Ctx } from '../middleware/auth';
import { addPayment, cancelTransaction, localDate, systemCategory } from './finance';
import { moveStock } from './stock';

export interface SaleInput {
  customer_id?: string | null;
  employee_id?: string | null;
  sold_at?: string;
  items: { product_id?: string | null; service_id?: string | null; description: string; quantity: number; unit_price: number; discount?: number; unit_cost?: number }[];
  discount?: number;
  payment_method: string;
  payment_status: 'pago' | 'pendente';
  due_date?: string | null;
  notes?: string | null;
  appointment_id?: string | null;
  allow_negative_stock?: boolean;
  source?: 'balcao' | 'orcamento' | 'ordem_servico' | 'agendamento' | 'pedido';
  source_id?: string | null;
}

/**
 * Registra uma venda de forma transacional:
 * itens → baixa de estoque → lançamento financeiro único → vínculo com agendamento.
 * Deve ser chamada dentro de withTx; qualquer falha desfaz tudo.
 */
export async function createSale(db: Db, ctx: Ctx, input: SaleInput) {
  if (!input.items.length) throw badRequest('Adicione ao menos um item.');
  if (input.payment_method === 'a_prazo' && input.payment_status === 'pago')
    throw badRequest('Vendas a prazo devem ser registradas como pendentes.');

  // Carrega custos atuais de produtos e serviços (o cliente não define custo)
  const items: (SaleInput['items'][number] & { total: number; unit_cost: number })[] = [];
  for (const it of input.items) {
    let unitCost = it.unit_cost ?? 0;
    if (it.product_id) {
      const p = await db.query(`SELECT cost_price, active, archived_at FROM products WHERE company_id = $1 AND id = $2`, [ctx.companyId, it.product_id]);
      if (!p.rows[0]) throw badRequest(`Produto do item "${it.description}" não encontrado.`);
      if (p.rows[0].archived_at) throw badRequest(`O produto "${it.description}" está arquivado.`);
      unitCost = it.unit_cost ?? p.rows[0].cost_price;
    } else if (it.service_id) {
      const s = await db.query(`SELECT estimated_cost FROM services WHERE company_id = $1 AND id = $2`, [ctx.companyId, it.service_id]);
      if (!s.rows[0]) throw badRequest(`Serviço do item "${it.description}" não encontrado.`);
      unitCost = it.unit_cost ?? s.rows[0].estimated_cost;
    }
    const total = lineTotal(it.quantity, it.unit_price, it.discount ?? 0);
    if (toCents(it.discount ?? 0) > toCents(lineTotal(it.quantity, it.unit_price))) throw badRequest(`O desconto do item "${it.description}" é maior que o valor do item.`);
    items.push({ ...it, total, unit_cost: unitCost });
  }
  const subtotalC = items.reduce((s, i) => s + toCents(i.total), 0);
  const discountC = toCents(input.discount ?? 0);
  if (discountC > subtotalC) throw badRequest('O desconto não pode ser maior que o subtotal.');
  const totalC = subtotalC - discountC;
  const costC = items.reduce((s, i) => s + Math.round(toCents(i.unit_cost) * i.quantity), 0);

  const number = await nextNumber(db, ctx.companyId, 'sale');
  const soldAt = input.sold_at ?? new Date().toISOString();
  const sale = (await db.query(
    `INSERT INTO sales (company_id, number, customer_id, employee_id, sold_at, subtotal, discount, total, cost_total,
                        payment_method, payment_status, due_date, source, source_id, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [ctx.companyId, number, input.customer_id ?? null, input.employee_id ?? null, soldAt, fromCents(subtotalC), fromCents(discountC),
      fromCents(totalC), fromCents(costC), input.payment_method, input.payment_status, input.due_date ?? null,
      input.source ?? (input.appointment_id ? 'agendamento' : 'balcao'), input.source_id ?? input.appointment_id ?? null, input.notes ?? null, ctx.user.id],
  )).rows[0];

  for (const it of items) {
    await db.query(
      `INSERT INTO sale_items (company_id, sale_id, product_id, service_id, description, quantity, unit_price, discount, total, unit_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [ctx.companyId, sale.id, it.product_id ?? null, it.service_id ?? null, it.description, it.quantity, it.unit_price, it.discount ?? 0, it.total, it.unit_cost],
    );
    if (it.product_id) {
      await moveStock(db, ctx, {
        productId: it.product_id, delta: -it.quantity, type: 'venda', unitCost: it.unit_cost,
        reason: `Venda #${number}`, refType: 'sale', refId: sale.id, allowNegative: input.allow_negative_stock,
      });
    }
  }

  // Receita única vinculada à venda (índice único impede duplicação)
  if (totalC > 0) {
    const day = await localDate(db, ctx, soldAt);
    const categoryId = await systemCategory(db, ctx.companyId, 'vendas');
    const t = await db.query(
      `INSERT INTO financial_transactions (company_id, kind, description, category_id, amount, competence_date, due_date,
                                           payment_method, customer_id, sale_id, source, created_by)
       VALUES ($1,'receita',$2,$3,$4,$5,$6,$7,$8,$9,'venda',$10) RETURNING id`,
      [ctx.companyId, `Venda #${number}`, categoryId, fromCents(totalC), day, input.due_date ?? day, input.payment_method,
        input.customer_id ?? null, sale.id, ctx.user.id],
    );
    if (input.payment_status === 'pago') {
      await addPayment(db, ctx, t.rows[0].id, { amount: fromCents(totalC), paid_on: day, method: input.payment_method });
    }
  }

  if (input.appointment_id) {
    const a = await db.query(
      `UPDATE appointments SET sale_id = $3, status = 'concluido' WHERE company_id = $1 AND id = $2 AND sale_id IS NULL RETURNING id`,
      [ctx.companyId, input.appointment_id, sale.id],
    );
    if (!a.rows[0]) throw conflict('Este agendamento já possui uma venda registrada.');
  }

  await audit(db, ctx, 'criou', 'venda', sale.id, `Registrou a venda #${number} (${fromCents(totalC).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`);
  return sale;
}

/** Cancela a venda revertendo estoque e financeiro, sem apagar o histórico. */
export async function cancelSale(db: Db, ctx: Ctx, saleId: string, reason: string) {
  const s = (await db.query(`SELECT * FROM sales WHERE company_id = $1 AND id = $2 FOR UPDATE`, [ctx.companyId, saleId])).rows[0];
  if (!s) throw notFound('Venda não encontrada');
  if (s.status === 'cancelada') throw conflict('Esta venda já está cancelada.');
  const items = (await db.query(`SELECT * FROM sale_items WHERE company_id = $1 AND sale_id = $2`, [ctx.companyId, saleId])).rows;
  for (const it of items) {
    if (it.product_id) {
      await moveStock(db, ctx, { productId: it.product_id, delta: it.quantity, type: 'estorno_venda', unitCost: it.unit_cost,
        reason: `Cancelamento da venda #${s.number}`, refType: 'sale', refId: s.id, allowNegative: true });
    }
  }
  const t = await db.query(`SELECT id FROM financial_transactions WHERE company_id = $1 AND sale_id = $2`, [ctx.companyId, saleId]);
  if (t.rows[0]) await cancelTransaction(db, ctx, t.rows[0].id);
  await db.query(`UPDATE sales SET status = 'cancelada', canceled_at = now(), cancel_reason = $3 WHERE company_id = $1 AND id = $2`, [ctx.companyId, saleId, reason]);
  await db.query(`UPDATE appointments SET sale_id = NULL WHERE company_id = $1 AND sale_id = $2`, [ctx.companyId, saleId]);
  await db.query(`UPDATE work_orders SET sale_id = NULL, status = 'concluida' WHERE company_id = $1 AND sale_id = $2 AND status = 'entregue'`, [ctx.companyId, saleId]);
  await db.query(`UPDATE work_orders SET sale_id = NULL WHERE company_id = $1 AND sale_id = $2`, [ctx.companyId, saleId]);
  await audit(db, ctx, 'cancelou', 'venda', saleId, `Cancelou a venda #${s.number}: ${reason}`);
}
