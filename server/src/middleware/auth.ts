import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { can, type ModuleKey, type Role } from '@nexo/shared';
import { config } from '../config';
import { pool, withTx, type Db } from '../db/pool';
import { forbidden, HttpError } from '../lib/errors';

export interface CompanyRow {
  id: string;
  name: string;
  segment_key: string;
  timezone: string;
  onboarding_done: boolean;
  [k: string]: unknown;
}
export interface Ctx {
  user: { id: string; name: string; email: string; phone: string | null };
  sessionId: string;
  companyId: string;
  role: Role;
  employeeId: string | null;
  company: CompanyRow;
}
export interface MaybeCtx {
  user: Ctx['user'];
  sessionId: string;
  companyId: string | null;
  role: Role | null;
  employeeId: string | null;
  company: CompanyRow | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { auth?: MaybeCtx }
  }
}

export const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export async function createSession(db: Db | typeof pool, userId: string, companyId: string | null, req: Request, res: Response) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.sessionDays * 86400_000);
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, company_id, expires_at, ip, user_agent) VALUES ($1,$2,$3,$4,$5,$6)`,
    [hashToken(token), userId, companyId, expires, req.ip ?? null, String(req.headers['user-agent'] ?? '').slice(0, 300)],
  );
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    expires,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(config.cookieName, { path: '/' });
}

/** Carrega usuário, empresa ativa e papel a partir do cookie de sessão. */
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[config.cookieName];
    if (!token || typeof token !== 'string') return next();
    const { rows } = await pool.query(
      `SELECT s.id AS session_id, s.company_id, u.id, u.name, u.email, u.phone
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(token)],
    );
    const row = rows[0];
    if (!row) return next();
    const auth: MaybeCtx = {
      user: { id: row.id, name: row.name, email: row.email, phone: row.phone },
      sessionId: row.session_id,
      companyId: null,
      role: null,
      employeeId: null,
      company: null,
    };
    if (row.company_id) {
      await withTx({ companyId: row.company_id, userId: row.id }, async (db) => {
        const m = await db.query(
          `SELECT m.role, m.employee_id, row_to_json(c) AS company
             FROM company_members m JOIN companies c ON c.id = m.company_id
            WHERE m.company_id = $1 AND m.user_id = $2 AND m.active`,
          [row.company_id, row.id],
        );
        if (m.rows[0]) {
          auth.companyId = row.company_id;
          auth.role = m.rows[0].role;
          auth.employeeId = m.rows[0].employee_id;
          auth.company = m.rows[0].company;
        }
      });
    }
    req.auth = auth;
    next();
  } catch (e) {
    next(e);
  }
}

/** Bloqueia requisições de outras origens que tentem alterar dados (CSRF). */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers['x-nexo-request'] !== '1') return next(new HttpError(403, 'Requisição bloqueada por segurança.'));
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(new HttpError(401, 'Faça login para continuar.', undefined, 'UNAUTHENTICATED'));
  next();
}

export function requireCompany(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(new HttpError(401, 'Faça login para continuar.', undefined, 'UNAUTHENTICATED'));
  if (!req.auth.companyId) return next(new HttpError(409, 'Cadastre ou selecione uma empresa.', undefined, 'NO_COMPANY'));
  next();
}

export const ctxOf = (req: Request): Ctx => {
  if (!req.auth?.companyId) throw new HttpError(409, 'Cadastre ou selecione uma empresa.', undefined, 'NO_COMPANY');
  return req.auth as Ctx;
};

/** Executa uma transação no escopo da empresa ativa (RLS). */
export const tx = <T>(req: Request, fn: (db: Db, ctx: Ctx) => Promise<T>) => {
  const ctx = ctxOf(req);
  return withTx({ companyId: ctx.companyId, userId: ctx.user.id }, (db) => fn(db, ctx));
};

export function requirePermission(module: ModuleKey, level: 'read' | 'write' = 'read') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.auth?.role;
    if (!role || !can(role, module, level)) return next(forbidden());
    next();
  };
}

/** Exige leitura em GET e escrita nos demais métodos. */
export function modulePermission(module: ModuleKey) {
  return (req: Request, res: Response, next: NextFunction) =>
    requirePermission(module, req.method === 'GET' ? 'read' : 'write')(req, res, next);
}
