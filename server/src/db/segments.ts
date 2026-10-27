import fs from 'node:fs';
import type pg from 'pg';
import { config } from '../config';

/**
 * Sincroniza data/segments.json com a tabela business_segments.
 * Para criar um novo segmento basta adicioná-lo ao arquivo (ou inserir
 * diretamente na tabela) — a interface lê os segmentos do banco.
 */
export async function syncSegments(client: pg.Client | pg.PoolClient) {
  const list = JSON.parse(fs.readFileSync(config.segmentsFile, 'utf8')) as any[];
  for (const s of list) {
    await client.query(
      `INSERT INTO business_segments (key, name, icon, description, config, sort_order, active, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,true,now())
       ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, description = EXCLUDED.description,
         config = EXCLUDED.config, sort_order = EXCLUDED.sort_order, updated_at = now()`,
      [s.key, s.name, s.icon, s.description, JSON.stringify(s.config), s.sort_order ?? 100],
    );
  }
  return list.length;
}
