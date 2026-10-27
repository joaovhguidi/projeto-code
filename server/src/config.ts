import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// carrega o .env da raiz do monorepo quando executado a partir de server/
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(here, '../../.env') });

const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITEST;

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest,
  port: Number(process.env.PORT ?? 3333),
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  databaseUrl: (isTest ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL) ?? 'postgres://nexo_app:nexo_app_dev@localhost:5432/nexo',
  migrationUrl: (isTest ? process.env.TEST_MIGRATION_DATABASE_URL : process.env.MIGRATION_DATABASE_URL) ?? 'postgres://nexo_owner:nexo_owner_dev@localhost:5432/nexo',
  storageDir: path.resolve(here, '..', '..', process.env.STORAGE_DIR ?? './storage', isTest ? 'test' : ''),
  sessionDays: 14,
  cookieName: 'nexo_sid',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Nexo Business <nao-responda@nexo.app>',
  },
  webDist: path.resolve(here, '..', '..', 'web', 'dist'),
  segmentsFile: path.resolve(here, '..', 'data', 'segments.json'),
};
export const smtpConfigured = () => !!config.smtp.host;
