import type { Db } from '../db/pool';
import { conflict, notFound } from '../lib/errors';
import type { Ctx } from '../middleware/auth';

export type MovementType = 'entrada' | 'saida' | 'ajuste' | 'venda' | 'estorno_venda' | 'perda' | 'compra';

/**
 * Altera o saldo de um produto e registra a movimentação no histórico.
 * O UPDATE bloqueia a linha do produto até o fim da transação, evitando
 * condições de corrida entre vendas simultâneas.
 */
export async function moveStock(db: Db, ctx: Ctx, input: {
  productId: string;
  delta: number;
  type: MovementType;
  unitCost?: number | null;
  reason?: string | null;
  refType?: string;
  refId?: string;
  allowNegative?: boolean;
}) {
  const delta = Math.round(input.delta * 1000) / 1000;
  if (delta === 0) return null;
  const r = await db.query(
    `UPDATE products SET stock_qty = stock_qty + $3 WHERE company_id = $1 AND id = $2
     RETURNING id, name, stock_qty, unit`,
    [ctx.companyId, input.productId, delta],
  );
  const p = r.rows[0];
  if (!p) throw notFound('Produto não encontrado');
  if (p.stock_qty < 0 && !input.allowNegative) {
    const available = Math.round((p.stock_qty - delta) * 1000) / 1000;
    throw conflict(`Estoque insuficiente para "${p.name}". Disponível: ${available.toLocaleString('pt-BR')} ${p.unit}.`, { productId: p.id, available }, );
  }
  const m = await db.query(
    `INSERT INTO stock_movements (company_id, product_id, type, quantity, balance_after, unit_cost, reason, reference_type, reference_id, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [ctx.companyId, input.productId, input.type, delta, p.stock_qty, input.unitCost ?? null, input.reason ?? null, input.refType ?? null, input.refId ?? null, ctx.user.id],
  );
  return { movementId: m.rows[0].id as string, balance: p.stock_qty as number, name: p.name as string };
}
