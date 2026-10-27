import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { canDo, documentSchema } from '@nexo/shared';
import { config } from '../config';
import { audit } from '../lib/audit';
import { dateTo, eq, resource } from '../lib/crud';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { h, isUuid } from '../lib/http';
import { requirePermission, tx } from '../middleware/auth';

const router = Router();
const ALLOWED = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (ALLOWED.has(file.mimetype) ? cb(null, true) : cb(badRequest('Tipo de arquivo não permitido. Envie PDF, imagem, texto, Word ou Excel.'))),
});

// Documentos restritos só aparecem para proprietário/gerente
const restrictionFilter = (_v: string, _p: unknown, req: any) => (canDo(req.auth.role, 'restrictedDocuments') ? null : 'NOT t.restricted');

router.use(resource({
  path: '/documents', table: 'documents', module: 'documentos', entity: 'documento',
  schema: documentSchema,
  columns: ['title', 'category', 'description', 'issued_on', 'expires_on', 'responsible', 'restricted'],
  select: `t.*, (t.expires_on IS NOT NULL AND t.expires_on < current_date) AS is_expired,
    (t.expires_on IS NOT NULL AND t.expires_on BETWEEN current_date AND current_date + 30) AS is_expiring,
    (SELECT json_build_object('id', f.id, 'file_name', f.file_name, 'size_bytes', f.size_bytes, 'mime_type', f.mime_type)
       FROM document_files f WHERE f.company_id = t.company_id AND f.document_id = t.id ORDER BY f.version DESC LIMIT 1) AS current_file`,
  search: ['t.title', 't.description', 't.responsible'],
  filters: {
    category: eq('t.category'),
    expiring: (v) => (v === '1' ? 't.expires_on <= current_date + 30' : null),
    expires_to: dateTo('t.expires_on'),
  },
  scope: (req) => restrictionFilter('', null, req),
  sort: { title: 'lower(t.title)', expires_on: 't.expires_on', issued_on: 't.issued_on', updated_at: 't.updated_at' },
  defaultSort: 'expires_on',
  softDelete: true,
  label: (r) => r.title,
  prepare: (_db, ctx, d) => {
    if (d.restricted === false && !canDo(ctx.role, 'restrictedDocuments')) return d;
    if (d.restricted && !canDo(ctx.role, 'restrictedDocuments')) throw forbidden('Apenas proprietário ou gerente podem criar documentos restritos.');
    return d;
  },
  detail: async (db, ctx, row) => {
    if (row.restricted && !canDo(ctx.role, 'restrictedDocuments')) throw notFound();
    const files = (await db.query(`SELECT f.id, f.version, f.file_name, f.mime_type, f.size_bytes, f.created_at, u.name AS uploaded_by_name
                                     FROM document_files f LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.company_id = $1 AND f.document_id = $2 ORDER BY f.version DESC`, [ctx.companyId, row.id])).rows;
    const history = (await db.query(`SELECT a.summary, a.created_at, u.name AS user_name FROM activity_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.company_id = $1 AND a.entity = 'documento' AND a.entity_id = $2 ORDER BY a.created_at DESC`, [ctx.companyId, row.id])).rows;
    return { ...row, files, history };
  },
  beforeDelete: async (_db, ctx, row) => { if (row.restricted && !canDo(ctx.role, 'restrictedDocuments')) throw notFound(); },
}));

router.post('/documents/:id/files', requirePermission('documentos', 'write'), upload.single('file'), h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  if (!req.file) throw badRequest('Selecione um arquivo.');
  const file = req.file;
  await tx(req, async (db, ctx) => {
    const d = (await db.query(`SELECT * FROM documents WHERE company_id = $1 AND id = $2 FOR UPDATE`, [ctx.companyId, req.params.id])).rows[0];
    if (!d || (d.restricted && !canDo(ctx.role, 'restrictedDocuments'))) throw notFound();
    const version = d.current_version + 1;
    const key = `${ctx.companyId}/${crypto.randomUUID()}`;
    const full = path.join(config.storageDir, key);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, file.buffer, { mode: 0o600 });
    const sha = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const safeName = path.basename(file.originalname).replace(/[^\w.\- ()À-ú]/g, '_').slice(0, 150);
    await db.query(`INSERT INTO document_files (company_id, document_id, version, storage_key, file_name, mime_type, size_bytes, sha256, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [ctx.companyId, d.id, version, key, safeName, file.mimetype, file.size, sha, ctx.user.id]);
    await db.query(`UPDATE documents SET current_version = $3, updated_at = now() WHERE company_id = $1 AND id = $2`, [ctx.companyId, d.id, version]);
    await audit(db, ctx, 'atualizou', 'documento', d.id, `Enviou a versão ${version} de "${d.title}" (${safeName})`);
  });
  res.status(201).json({ ok: true });
}));

router.get('/documents/:id/files/:fileId', requirePermission('documentos'), h(async (req, res) => {
  if (!isUuid(req.params.id) || !isUuid(req.params.fileId)) throw notFound();
  const f = await tx(req, async (db, ctx) => {
    const r = (await db.query(
      `SELECT f.*, d.restricted, d.title FROM document_files f JOIN documents d ON d.id = f.document_id
        WHERE f.company_id = $1 AND f.document_id = $2 AND f.id = $3`, [ctx.companyId, req.params.id, req.params.fileId])).rows[0];
    if (!r || (r.restricted && !canDo(ctx.role, 'restrictedDocuments'))) throw notFound();
    await audit(db, ctx, 'baixou', 'documento', req.params.id, `Baixou "${r.title}" (v${r.version})`);
    return r;
  });
  const full = path.join(config.storageDir, f.storage_key);
  if (!full.startsWith(config.storageDir) || !fs.existsSync(full)) throw notFound('Arquivo indisponível no armazenamento.');
  res.setHeader('Content-Type', f.mime_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `${req.query.inline === '1' && /^(image|application\/pdf)/.test(f.mime_type) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.file_name)}`);
  fs.createReadStream(full).pipe(res);
}));

export default router;
