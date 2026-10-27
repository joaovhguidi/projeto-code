import pg from 'pg';
import { config } from '../config';

// numeric -> number (valores monetários têm 2 casas; quantidades 3; seguros em double)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// int8 (count/bigint) -> number
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
// date -> string 'YYYY-MM-DD' (evita deslocamento de fuso)
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 15 });
pool.on('error', (err) => console.error('[db] erro inesperado no pool', err));

export type Db = pg.PoolClient;

export interface TxContext {
  companyId?: string | null;
  userId?: string | null;
}

/**
 * Executa fn numa transação com o contexto de segurança definido para o RLS.
 * Qualquer erro desfaz todas as alterações.
 */
export async function withTx<T>(ctx: TxContext, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.company_id', $1, true), set_config('app.user_id', $2, true)`, [
      ctx.companyId ?? '',
      ctx.userId ?? '',
    ]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function one<T = any>(db: Db, sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await db.query(sql, params);
  return (r.rows[0] as T) ?? null;
}
export async function many<T = any>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await db.query(sql, params);
  return r.rows as T[];
}
