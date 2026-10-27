import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { canDo, companySchema, memberCreateSchema, memberUpdateSchema, onboardingSchema, preferencesSchema } from '@nexo/shared';
import { pool, withTx } from '../db/pool';
import { audit } from '../lib/audit';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { h, isUuid, pageParams } from '../lib/http';
import { requireAuth, requireCompany, tx } from '../middleware/auth';
import { seedCategories } from '../services/finance';
import { getSegment } from '../services/workspace';

const router = Router();

router.get('/segments', h(async (_req, res) => {
  const r = await pool.query(`SELECT key, name, icon, description, config FROM business_segments WHERE active ORDER BY sort_order, name`);
  res.json({ data: r.rows });
}));

// Assistente de cadastro: cria a empresa, vincula o usuário como proprietário e prepara os dados iniciais.
router.post('/companies', requireAuth, h(async (req, res) => {
  const data = onboardingSchema.parse(req.body);
  const auth = req.auth!;
  const companyId = crypto.randomUUID();
  await withTx({ companyId, userId: auth.user.id }, async (db) => {
    const segment = await getSegment(db, data.segment_key);
    if (!segment) throw badRequest('Segmento inválido.', { fields: { segment_key: 'Selecione um segmento' } });
    const doc = data.document?.replace(/\D/g, '') || null;
    const preferences = data.priority_modules?.length ? { priorityModules: data.priority_modules } : {};
    await db.query(
      `INSERT INTO companies (id, name, document, document_type, phone, email, city, state, segment_key, custom_segment, description,
                              employees_range, main_offerings, goals, difficulties, timezone, preferences, onboarding_done)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true)`,
      [companyId, data.name, doc, doc ? (doc.length === 11 ? 'cpf' : 'cnpj') : null, data.phone ?? null, data.email ?? null,
        data.city ?? null, data.state ?? null, data.segment_key, data.custom_segment ?? null, data.description ?? null,
        data.employees_range ?? null, data.main_offerings ?? null, data.goals, data.difficulties, data.timezone, JSON.stringify(preferences)],
    );
    // o responsável também é cadastrado como colaborador (para agenda/tarefas)
    const emp = await db.query(
      `INSERT INTO employees (company_id, name, role_title, email, phone) VALUES ($1,$2,'Responsável',$3,$4) RETURNING id`,
      [companyId, auth.user.name, auth.user.email, auth.user.phone],
    );
    await db.query(`INSERT INTO company_members (company_id, user_id, role, employee_id) VALUES ($1,$2,'proprietario',$3)`, [companyId, auth.user.id, emp.rows[0].id]);
    await seedCategories(db, companyId);
    // serviços sugeridos apenas se o usuário optou por usá-los
    if (req.body?.use_suggested_services && segment.config.suggestedServices?.length) {
      for (const s of segment.config.suggestedServices) {
        await db.query(`INSERT INTO services (company_id, name, duration_minutes, price) VALUES ($1,$2,$3,$4)`, [companyId, s.name, s.duration, s.price]);
      }
    }
    await db.query(
      `INSERT INTO activity_log (company_id, user_id, action, entity, entity_id, summary) VALUES ($1,$2,'criou','empresa',$4,$3)`,
      [companyId, auth.user.id, `Empresa ${data.name} cadastrada no segmento ${segment.name}`, companyId],
    );
  });
  await pool.query(`UPDATE sessions SET company_id = $2 WHERE id = $1`, [auth.sessionId, companyId]);
  res.status(201).json({ data: { id: companyId } });
}));

router.use('/company', requireCompany);

router.get('/company', h(async (req, res) => {
  const row = await tx(req, async (db, ctx) => (await db.query(`SELECT * FROM companies WHERE id = $1`, [ctx.companyId])).rows[0]);
  res.json({ data: row });
}));

router.put('/company', h(async (req, res) => {
  if (!canDo(req.auth!.role!, 'editCompany')) throw forbidden();
  const data = companySchema.parse(req.body);
  await tx(req, async (db, ctx) => {
    const segment = await getSegment(db, data.segment_key);
    if (!segment) throw badRequest('Segmento inválido.');
    const doc = data.document?.replace(/\D/g, '') || null;
    const current = (await db.query(`SELECT preferences, segment_key FROM companies WHERE id = $1`, [ctx.companyId])).rows[0];
    const prefs = { ...(current.preferences ?? {}) };
    if (data.priority_modules) prefs.priorityModules = data.priority_modules;
    if (data.segment_key === 'outro' && !(prefs.priorityModules?.length >= 2))
      throw badRequest('Escolha ao menos 2 módulos prioritários.', { fields: { priority_modules: 'Escolha ao menos 2 módulos prioritários' } });
    await db.query(
      `UPDATE companies SET name=$2, document=$3, document_type=$4, phone=$5, email=$6, city=$7, state=$8, segment_key=$9, custom_segment=$10,
              description=$11, employees_range=$12, main_offerings=$13, goals=$14, difficulties=$15, timezone=$16, preferences=$17
        WHERE id = $1`,
      [ctx.companyId, data.name, doc, doc ? (doc.length === 11 ? 'cpf' : 'cnpj') : null, data.phone ?? null, data.email ?? null, data.city ?? null,
        data.state ?? null, data.segment_key, data.custom_segment ?? null, data.description ?? null, data.employees_range ?? null,
        data.main_offerings ?? null, data.goals, data.difficulties, data.timezone, JSON.stringify(prefs)],
    );
    await audit(db, ctx, 'atualizou', 'empresa', ctx.companyId,
      current.segment_key !== data.segment_key ? `Alterou o segmento para ${segment.name}` : 'Atualizou os dados da empresa');
  });
  res.json({ ok: true });
}));

router.put('/company/preferences', h(async (req, res) => {
  const data = preferencesSchema.parse(req.body);
  const role = req.auth!.role!;
  // ordem de prioridades altera o negócio: apenas proprietário/gerente
  if (data.priorityModules && !canDo(role, 'editCompany')) throw forbidden();
  await tx(req, async (db, ctx) => {
    await db.query(`UPDATE companies SET preferences = preferences || $2::jsonb WHERE id = $1`, [ctx.companyId, JSON.stringify(data)]);
  });
  res.json({ ok: true });
}));

router.put('/company/hours', h(async (req, res) => {
  if (!canDo(req.auth!.role!, 'editCompany')) throw forbidden();
  const hours = req.body?.opening_hours;
  const days = ['0', '1', '2', '3', '4', '5', '6'];
  const valid = hours && typeof hours === 'object' && Object.entries(hours).every(([d, v]: [string, any]) =>
    days.includes(d) && (v === null || (typeof v === 'object' && /^\d{2}:\d{2}$/.test(v.open) && /^\d{2}:\d{2}$/.test(v.close) && v.close > v.open)));
  if (!valid) throw badRequest('Horário de funcionamento inválido. O fechamento deve ser depois da abertura.');
  await tx(req, async (db, ctx) => {
    await db.query(`UPDATE companies SET opening_hours = $2 WHERE id = $1`, [ctx.companyId, JSON.stringify(hours)]);
    await audit(db, ctx, 'atualizou', 'empresa', ctx.companyId, 'Atualizou o horário de funcionamento');
  });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Usuários e permissões
// ---------------------------------------------------------------------------
router.get('/company/members', h(async (req, res) => {
  const rows = await tx(req, async (db, ctx) => (await db.query(
    `SELECT m.user_id, m.role, m.active, m.employee_id, m.created_at, u.name, u.email, e.name AS employee_name
       FROM company_members m JOIN users u ON u.id = m.user_id LEFT JOIN employees e ON e.id = m.employee_id AND e.company_id = m.company_id
      WHERE m.company_id = $1 ORDER BY m.created_at`, [ctx.companyId])).rows);
  res.json({ data: rows });
}));

router.post('/company/members', h(async (req, res) => {
  if (!canDo(req.auth!.role!, 'manageUsers')) throw forbidden('Apenas o proprietário pode adicionar usuários.');
  const data = memberCreateSchema.parse(req.body);
  await tx(req, async (db, ctx) => {
    let user = (await db.query(`SELECT id FROM users WHERE email = $1`, [data.email])).rows[0];
    if (user) {
      const exists = await db.query(`SELECT 1 FROM company_members WHERE company_id = $1 AND user_id = $2`, [ctx.companyId, user.id]);
      if (exists.rows[0]) throw conflict('Este usuário já faz parte da empresa.');
    } else {
      const hash = await bcrypt.hash(data.password, 12);
      user = (await db.query(`INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id`, [data.name, data.email, hash])).rows[0];
    }
    await db.query(`INSERT INTO company_members (company_id, user_id, role, employee_id) VALUES ($1,$2,$3,$4)`,
      [ctx.companyId, user.id, data.role, data.employee_id ?? null]);
    await audit(db, ctx, 'criou', 'usuario', user.id, `Adicionou ${data.name} (${data.email}) como ${data.role}`);
  });
  res.status(201).json({ ok: true });
}));

router.put('/company/members/:userId', h(async (req, res) => {
  if (!canDo(req.auth!.role!, 'manageUsers')) throw forbidden('Apenas o proprietário pode alterar permissões.');
  if (!isUuid(req.params.userId)) throw notFound();
  const data = memberUpdateSchema.parse(req.body);
  await tx(req, async (db, ctx) => {
    const m = (await db.query(`SELECT role FROM company_members WHERE company_id = $1 AND user_id = $2`, [ctx.companyId, req.params.userId])).rows[0];
    if (!m) throw notFound('Usuário não encontrado nesta empresa.');
    if (m.role === 'proprietario' && (data.role !== 'proprietario' || !data.active)) {
      const owners = await db.query(`SELECT count(*)::int AS n FROM company_members WHERE company_id = $1 AND role = 'proprietario' AND active`, [ctx.companyId]);
      if (owners.rows[0].n <= 1) throw conflict('A empresa precisa de ao menos um proprietário ativo.');
    }
    await db.query(`UPDATE company_members SET role = $3, active = $4, employee_id = $5 WHERE company_id = $1 AND user_id = $2`,
      [ctx.companyId, req.params.userId, data.role, data.active, data.employee_id ?? null]);
    if (!data.active) await db.query(`DELETE FROM sessions WHERE user_id = $1 AND company_id = $2`, [req.params.userId, ctx.companyId]);
    await audit(db, ctx, 'atualizou', 'usuario', req.params.userId, `Alterou o acesso de um usuário para ${data.role}${data.active ? '' : ' (desativado)'}`);
  });
  res.json({ ok: true });
}));

router.delete('/company/members/:userId', h(async (req, res) => {
  if (!canDo(req.auth!.role!, 'manageUsers')) throw forbidden('Apenas o proprietário pode remover usuários.');
  if (req.params.userId === req.auth!.user.id) throw conflict('Você não pode remover a si mesmo.');
  if (!isUuid(req.params.userId)) throw notFound();
  await tx(req, async (db, ctx) => {
    const m = (await db.query(`DELETE FROM company_members WHERE company_id = $1 AND user_id = $2 RETURNING role`, [ctx.companyId, req.params.userId])).rows[0];
    if (!m) throw notFound('Usuário não encontrado nesta empresa.');
    if (m.role === 'proprietario') {
      const owners = await db.query(`SELECT count(*)::int AS n FROM company_members WHERE company_id = $1 AND role = 'proprietario' AND active`, [ctx.companyId]);
      if (owners.rows[0].n < 1) throw conflict('A empresa precisa de ao menos um proprietário ativo.');
    }
    await db.query(`DELETE FROM sessions WHERE user_id = $1 AND company_id = $2`, [req.params.userId, ctx.companyId]);
    await audit(db, ctx, 'excluiu', 'usuario', req.params.userId, 'Removeu um usuário da empresa');
  });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Histórico de atividades e exportação
// ---------------------------------------------------------------------------
router.get('/company/activity', h(async (req, res) => {
  const role = req.auth!.role!;
  const { page, pageSize, offset } = pageParams(req.query);
  const result = await tx(req, async (db, ctx) => {
    const params: unknown[] = [ctx.companyId];
    let where = 'a.company_id = $1';
    // colaboradores veem apenas as próprias ações
    if (!canDo(role, 'viewActivityLog')) { params.push(ctx.user.id); where += ` AND a.user_id = $${params.length}`; }
    if (typeof req.query.entity === 'string' && req.query.entity) { params.push(req.query.entity); where += ` AND a.entity = $${params.length}`; }
    if (isUuid(req.query.entityId)) { params.push(req.query.entityId); where += ` AND a.entity_id = $${params.length}`; }
    const total = (await db.query(`SELECT count(*)::int n FROM activity_log a WHERE ${where}`, params)).rows[0].n;
    const rows = (await db.query(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.summary, a.created_at, u.name AS user_name
         FROM activity_log a LEFT JOIN users u ON u.id = a.user_id WHERE ${where}
        ORDER BY a.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`, params)).rows;
    return { data: rows, total, page, pageSize };
  });
  res.json(result);
}));

const EXPORT_TABLES = ['customers', 'pets', 'vehicles', 'employees', 'employee_trainings', 'services', 'appointments', 'suppliers', 'supplier_quotes',
  'products', 'stock_movements', 'sales', 'sale_items', 'finance_categories', 'financial_transactions', 'transaction_payments', 'collection_contacts',
  'quotes', 'quote_items', 'work_orders', 'work_order_items', 'purchases', 'purchase_items', 'tasks', 'task_comments', 'deliveries', 'delivery_events',
  'shifts', 'shift_swap_requests', 'equipment', 'maintenance_orders', 'waste_records', 'feedbacks', 'feedback_actions', 'loyalty_campaigns',
  'customer_contacts', 'documents', 'issues', 'issue_updates', 'activity_log'];

router.get('/company/export', h(async (req, res) => {
  if (!canDo(req.auth!.role!, 'exportData')) throw forbidden('Apenas o proprietário pode exportar os dados.');
  const dump = await tx(req, async (db, ctx) => {
    const out: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      company: (await db.query(`SELECT * FROM companies WHERE id = $1`, [ctx.companyId])).rows[0],
    };
    for (const t of EXPORT_TABLES) out[t] = (await db.query(`SELECT * FROM ${t} WHERE company_id = $1`, [ctx.companyId])).rows;
    await audit(db, ctx, 'exportou', 'empresa', ctx.companyId, 'Exportou todos os dados da empresa');
    return out;
  });
  res.setHeader('Content-Disposition', `attachment; filename="nexo-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(dump);
}));

export default router;
