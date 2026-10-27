import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { changePasswordSchema, forgotSchema, loginSchema, registerSchema, resetSchema } from '@nexo/shared';
import { config, smtpConfigured } from '../config';
import { pool, withTx } from '../db/pool';
import { HttpError, badRequest, forbidden } from '../lib/errors';
import { h, isUuid } from '../lib/http';
import { sendMail } from '../lib/mailer';
import { clearSessionCookie, createSession, hashToken, requireAuth } from '../middleware/auth';
import { buildMe } from '../services/workspace';

const router = Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 10_000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
});

// hash fixo usado para equalizar o tempo de resposta quando o e-mail não existe
const DUMMY_HASH = bcrypt.hashSync('nexo-dummy-password', 10);

router.post('/register', limiter, h(async (req, res) => {
  const data = registerSchema.parse(req.body);
  const hash = await bcrypt.hash(data.password, 12);
  const user = await withTx({}, async (db) => {
    const r = await db.query(
      `INSERT INTO users (name, email, phone, password_hash) VALUES ($1,$2,$3,$4) RETURNING id`,
      [data.name, data.email, data.phone ?? null, hash],
    );
    return r.rows[0];
  });
  await createSession(pool, user.id, null, req, res);
  res.status(201).json({ ok: true });
}));

router.post('/login', limiter, h(async (req, res) => {
  const data = loginSchema.parse(req.body);
  const r = await pool.query(`SELECT id, password_hash FROM users WHERE email = $1`, [data.email]);
  const user = r.rows[0];
  const ok = await bcrypt.compare(data.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'E-mail ou senha incorretos.');
  // seleciona a primeira empresa ativa do usuário
  const companies = await withTx({ userId: user.id }, (db) => db.query(`SELECT company_id FROM list_user_companies()`));
  await createSession(pool, user.id, companies.rows[0]?.company_id ?? null, req, res);
  await pool.query(`DELETE FROM sessions WHERE user_id = $1 AND expires_at < now()`, [user.id]);
  res.json({ ok: true });
}));

router.post('/logout', h(async (req, res) => {
  if (req.auth) await pool.query(`DELETE FROM sessions WHERE id = $1`, [req.auth.sessionId]);
  clearSessionCookie(res);
  res.json({ ok: true });
}));

router.get('/me', requireAuth, h(async (req, res) => {
  const me = await withTx({ companyId: req.auth!.companyId, userId: req.auth!.user.id }, (db) => buildMe(db, req.auth!));
  res.json({ data: me });
}));

router.post('/switch-company', requireAuth, h(async (req, res) => {
  const companyId = req.body?.companyId;
  if (!isUuid(companyId)) throw badRequest('Empresa inválida.');
  const ok = await withTx({ userId: req.auth!.user.id }, (db) =>
    db.query(`SELECT 1 FROM list_user_companies() WHERE company_id = $1`, [companyId]));
  if (!ok.rows[0]) throw forbidden('Você não pertence a esta empresa.');
  await pool.query(`UPDATE sessions SET company_id = $2 WHERE id = $1`, [req.auth!.sessionId, companyId]);
  res.json({ ok: true });
}));

router.post('/forgot', limiter, h(async (req, res) => {
  const { email } = forgotSchema.parse(req.body);
  const emailConfigured = smtpConfigured();
  const r = await pool.query(`SELECT id, name FROM users WHERE email = $1`, [email]);
  const user = r.rows[0];
  if (user) {
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query(`UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [user.id]);
    await pool.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')`,
      [user.id, hashToken(token)],
    );
    const link = `${config.appUrl}/redefinir-senha?token=${token}`;
    if (emailConfigured) {
      await sendMail(email, 'Redefinição de senha — Nexo Business',
        `Olá, ${user.name}.\n\nPara criar uma nova senha, acesse: ${link}\n\nO link vale por 1 hora. Se você não solicitou, ignore esta mensagem.`);
    } else if (!config.isProd && !config.isTest) {
      console.log(`\n[recuperação de senha] SMTP não configurado. Link de desenvolvimento para ${email}:\n${link}\n`);
    }
  }
  res.json({
    ok: true,
    emailConfigured,
    message: emailConfigured
      ? 'Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.'
      : 'O envio de e-mails ainda não está configurado neste servidor. Peça ao administrador para configurar o SMTP ou para gerar o link de redefinição.',
  });
}));

router.post('/reset', limiter, h(async (req, res) => {
  const data = resetSchema.parse(req.body);
  const r = await pool.query(
    `SELECT id, user_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [hashToken(data.token)],
  );
  const reset = r.rows[0];
  if (!reset) throw badRequest('Link inválido ou expirado. Solicite uma nova redefinição.');
  const hash = await bcrypt.hash(data.password, 12);
  await withTx({}, async (db) => {
    await db.query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [reset.user_id, hash]);
    await db.query(`UPDATE password_resets SET used_at = now() WHERE id = $1`, [reset.id]);
    await db.query(`DELETE FROM sessions WHERE user_id = $1`, [reset.user_id]);
  });
  res.json({ ok: true });
}));

router.post('/password', requireAuth, h(async (req, res) => {
  const data = changePasswordSchema.parse(req.body);
  const r = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [req.auth!.user.id]);
  if (!(await bcrypt.compare(data.currentPassword, r.rows[0].password_hash))) throw badRequest('Senha atual incorreta.', { fields: { currentPassword: 'Senha atual incorreta' } });
  const hash = await bcrypt.hash(data.newPassword, 12);
  await pool.query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [req.auth!.user.id, hash]);
  // encerra as demais sessões
  await pool.query(`DELETE FROM sessions WHERE user_id = $1 AND id <> $2`, [req.auth!.user.id, req.auth!.sessionId]);
  res.json({ ok: true });
}));

router.put('/profile', requireAuth, h(async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const phone = String(req.body?.phone ?? '').trim() || null;
  if (name.length < 2 || name.length > 120) throw new HttpError(422, 'Verifique os campos destacados.', undefined);
  await pool.query(`UPDATE users SET name = $2, phone = $3, updated_at = now() WHERE id = $1`, [req.auth!.user.id, name, phone]);
  res.json({ ok: true });
}));

export default router;
