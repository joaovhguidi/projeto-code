import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

/** Encaminha erros de handlers assíncronos para o tratador central. */
export const h = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export const parse = <S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> => schema.parse(data);

export function pageParams(q: Record<string, unknown>) {
  const page = Math.max(1, Number.parseInt(String(q.page ?? '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(q.pageSize ?? '20'), 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
