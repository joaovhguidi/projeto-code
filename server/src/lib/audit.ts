import type { Db } from '../db/pool';
import type { Ctx } from '../middleware/auth';

export async function audit(db: Db, ctx: Ctx, action: string, entity: string, entityId: string | null, summary: string, details: Record<string, unknown> = {}) {
  await db.query(
    `INSERT INTO activity_log (company_id, user_id, action, entity, entity_id, summary, details) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [ctx.companyId, ctx.user.id, action, entity, entityId, summary.slice(0, 300), JSON.stringify(details)],
  );
}

export async function nextNumber(db: Db, companyId: string, name: string): Promise<number> {
  const r = await db.query(
    `INSERT INTO company_counters (company_id, name, value) VALUES ($1, $2, 1)
     ON CONFLICT (company_id, name) DO UPDATE SET value = company_counters.value + 1
     RETURNING value`,
    [companyId, name],
  );
  return Number(r.rows[0].value);
}
