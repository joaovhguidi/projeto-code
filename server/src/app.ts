import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { config } from './config';
import { errorHandler, HttpError } from './lib/errors';
import { csrfGuard, loadSession, requireCompany } from './middleware/auth';
import agenda from './routes/agenda';
import auth from './routes/auth';
import commerce from './routes/commerce';
import company from './routes/company';
import documents from './routes/documents';
import finance from './routes/finance';
import insights from './routes/insights';
import operations from './routes/operations';
import people from './routes/people';
import stock from './routes/stock';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: config.isProd ? undefined : false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(loadSession);
  api.use(csrfGuard);
  api.get('/health', (_req, res) => { res.json({ ok: true }); });
  api.use('/auth', auth);
  api.use(company); // /segments, /companies e /company/*
  // a partir daqui, todas as rotas exigem empresa ativa (dados isolados por RLS)
  api.use(requireCompany);
  for (const r of [people, stock, finance, agenda, commerce, operations, documents, insights]) api.use(r);
  api.use((_req, _res, next) => next(new HttpError(404, 'Rota não encontrada.')));
  app.use('/api', api);

  // Em produção a API também serve o frontend compilado
  if (fs.existsSync(config.webDist)) {
    app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
