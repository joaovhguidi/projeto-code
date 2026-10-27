import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config';
import { syncSegments } from './segments';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate(url = config.migrationUrl, { quiet = false } = {}) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        if (!quiet) console.log(`✔ migração aplicada: ${file}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Falha na migração ${file}: ${(e as Error).message}`);
      }
    }
    const n = await syncSegments(client);
    if (!quiet) console.log(`✔ ${n} segmentos sincronizados`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
}
