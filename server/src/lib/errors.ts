import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { config } from '../config';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown, public code?: string) {
    super(message);
  }
}
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const notFound = (msg = 'Registro não encontrado') => new HttpError(404, msg);
export const forbidden = (msg = 'Você não tem permissão para esta ação') => new HttpError(403, msg);
export const conflict = (msg: string, details?: unknown) => new HttpError(409, msg, details);

export function zodToFields(err: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

const PG_MESSAGES: Record<string, Record<string, string>> = {
  '23P01': {
    appointments_no_overlap: 'Este profissional já possui um atendimento nesse horário.',
    shifts_no_overlap: 'Este colaborador já tem um turno ou folga que se sobrepõe a esse horário.',
  },
};

/** Traduz erros do PostgreSQL para respostas compreensíveis, sem expor detalhes internos. */
function fromPg(err: any): HttpError | null {
  if (!err || typeof err.code !== 'string') return null;
  switch (err.code) {
    case '23505': {
      const c = String(err.constraint ?? '');
      if (c.includes('email')) return conflict('Este e-mail já está cadastrado.');
      if (c.includes('sku')) return conflict('Já existe um produto com este código (SKU).');
      if (c.includes('plate')) return conflict('Já existe um veículo com esta placa.');
      if (c.includes('kind_name')) return conflict('Já existe uma categoria com este nome.');
      return conflict('Já existe um registro com estes dados.');
    }
    case '23503':
      if (/update or delete/.test(err.message))
        return conflict('Este registro está vinculado a outros dados e não pode ser excluído. Você pode arquivá-lo.');
      return badRequest('Um dos registros relacionados não existe ou pertence a outra empresa.');
    case '23P01':
      return conflict(PG_MESSAGES['23P01'][err.constraint] ?? 'Conflito de horário com outro registro.');
    case '23514':
      return badRequest('Os dados informados não respeitam as regras do sistema. Revise os valores.', { constraint: err.constraint });
    case '22P02':
    case '22007':
    case '22008':
      return badRequest('Formato de dado inválido.');
    case '42501':
      return forbidden('Acesso negado a este registro.');
    default:
      return null;
  }
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(422).json({ error: 'Verifique os campos destacados.', fields: zodToFields(err) });
    return;
  }
  if (err?.type === 'entity.parse.failed') { res.status(400).json({ error: 'Corpo da requisição inválido.' }); return; }
  if (err?.code === 'LIMIT_FILE_SIZE') { res.status(413).json({ error: 'Arquivo maior que o limite de 15 MB.' }); return; }
  const http = err instanceof HttpError ? err : fromPg(err);
  if (http) {
    res.status(http.status).json({ error: http.message, ...(http.details ? { details: http.details } : {}), ...(http.code ? { code: http.code } : {}) });
    return;
  }
  if (!config.isTest) console.error('[erro]', err);
  res.status(500).json({ error: 'Ocorreu um erro inesperado. Tente novamente em instantes.' });
}
