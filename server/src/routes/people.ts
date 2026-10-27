import { Router } from 'express';
import { canDo, customerSchema, employeeSchema, petSchema, serviceSchema, trainingSchema, vehicleSchema } from '@nexo/shared';
import { eq, eqId, resource } from '../lib/crud';
import { h, isUuid } from '../lib/http';
import { requirePermission, tx } from '../middleware/auth';
import { notFound } from '../lib/errors';

const router = Router();
const digits = (v?: string | null) => (v ? v.replace(/\D/g, '') : v);

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------
const CUSTOMER_SELECT = `t.*, act.last_visit_at, act.visits, act.total_spent,
  CASE WHEN act.last_visit_at IS NULL THEN t.created_at < now() - interval '90 days'
       ELSE act.last_visit_at < now() - interval '90 days' END AS is_inactive`;
const CUSTOMER_JOIN = `LEFT JOIN LATERAL (
  SELECT max(x.at) AS last_visit_at, count(*)::int AS visits, coalesce(sum(x.amount), 0) AS total_spent FROM (
    SELECT s.sold_at AS at, s.total AS amount FROM sales s WHERE s.company_id = t.company_id AND s.customer_id = t.id AND s.status = 'concluida'
    UNION ALL
    SELECT a.starts_at, 0 FROM appointments a WHERE a.company_id = t.company_id AND a.customer_id = t.id AND a.status = 'concluido' AND a.sale_id IS NULL
  ) x) act ON true`;

router.use(resource({
  path: '/customers', table: 'customers', module: 'clientes', entity: 'cliente',
  schema: customerSchema,
  columns: ['name', 'phone', 'whatsapp', 'email', 'document', 'birth_date', 'address', 'relationship', 'notes'],
  select: CUSTOMER_SELECT, joins: CUSTOMER_JOIN,
  search: ['t.name', 't.phone', 't.email', 't.document'],
  filters: {
    relationship: eq('t.relationship', ['novo', 'ativo', 'vip', 'em_risco', 'inativo']),
    inactive: (v) => (v === '1' ? `(CASE WHEN act.last_visit_at IS NULL THEN t.created_at < now() - interval '90 days' ELSE act.last_visit_at < now() - interval '90 days' END)` : null),
  },
  sort: { name: 'lower(t.name)', created_at: 't.created_at', last_visit_at: 'act.last_visit_at', total_spent: 'act.total_spent', visits: 'act.visits' },
  defaultSort: 'name',
  softDelete: true,
  optionLabel: `t.name || coalesce(' · ' || t.phone, '')`,
  label: (r) => r.name,
  prepare: (_db, _ctx, d) => ({ ...d, document: digits(d.document) }),
  detail: async (db, ctx, row) => {
    const q = (sql: string) => db.query(sql, [ctx.companyId, row.id]).then((r) => r.rows);
    const [sales, appointments, pets, vehicles, receivables, contacts, feedbacks, workOrders] = await Promise.all([
      q(`SELECT s.id, s.number, s.sold_at, s.total, s.status, s.payment_method,
                (SELECT string_agg(i.description, ', ') FROM sale_items i WHERE i.sale_id = s.id) AS items
           FROM sales s WHERE s.company_id = $1 AND s.customer_id = $2 ORDER BY s.sold_at DESC LIMIT 50`),
      q(`SELECT a.id, a.starts_at, a.status, a.price, sv.name AS service_name, e.name AS employee_name
           FROM appointments a LEFT JOIN services sv ON sv.id = a.service_id LEFT JOIN employees e ON e.id = a.employee_id
          WHERE a.company_id = $1 AND a.customer_id = $2 ORDER BY a.starts_at DESC LIMIT 50`),
      q(`SELECT id, name, species, breed, next_return FROM pets WHERE company_id = $1 AND customer_id = $2 AND archived_at IS NULL`),
      q(`SELECT id, plate, brand, model, year FROM vehicles WHERE company_id = $1 AND customer_id = $2 AND archived_at IS NULL`),
      q(`SELECT id, description, amount, amount_paid, due_date, status FROM financial_transactions
          WHERE company_id = $1 AND customer_id = $2 AND kind = 'receita' AND status IN ('pendente','parcial') ORDER BY due_date`),
      q(`SELECT c.id, c.contacted_on, c.channel, c.outcome, c.notes, lc.name AS campaign_name FROM customer_contacts c
           LEFT JOIN loyalty_campaigns lc ON lc.id = c.campaign_id WHERE c.company_id = $1 AND c.customer_id = $2 ORDER BY c.contacted_on DESC LIMIT 30`),
      q(`SELECT id, type, title, status, rating, received_on FROM feedbacks WHERE company_id = $1 AND customer_id = $2 ORDER BY received_on DESC LIMIT 30`),
      q(`SELECT id, number, title, status, opened_on, total FROM work_orders WHERE company_id = $1 AND customer_id = $2 ORDER BY opened_on DESC LIMIT 30`),
    ]);
    return { ...row, history: { sales, appointments, pets, vehicles, receivables, contacts, feedbacks, workOrders } };
  },
}));

// ---------------------------------------------------------------------------
// Animais (pet shop) e veículos (oficina)
// ---------------------------------------------------------------------------
router.use(resource({
  path: '/pets', table: 'pets', module: 'animais', entity: 'animal',
  schema: petSchema,
  columns: ['customer_id', 'name', 'species', 'breed', 'size', 'birth_date', 'weight_kg', 'allergies', 'next_return', 'notes'],
  select: 't.*, c.name AS customer_name, c.phone AS customer_phone',
  joins: 'JOIN customers c ON c.id = t.customer_id AND c.company_id = t.company_id',
  search: ['t.name', 't.breed', 'c.name'],
  filters: {
    customer_id: eqId('t.customer_id'),
    species: eq('t.species'),
    returns_due: (v) => (v === '1' ? `t.next_return <= current_date + 7` : null),
  },
  sort: { name: 'lower(t.name)', customer: 'lower(c.name)', next_return: 't.next_return', created_at: 't.created_at' },
  defaultSort: 'name', softDelete: true,
  optionLabel: `t.name || ' (' || c.name || ')'`,
  label: (r) => r.name,
  detail: async (db, ctx, row) => {
    const visits = (await db.query(
      `SELECT a.id, a.starts_at, a.status, sv.name AS service_name FROM appointments a LEFT JOIN services sv ON sv.id = a.service_id
        WHERE a.company_id = $1 AND a.pet_id = $2 ORDER BY a.starts_at DESC LIMIT 50`, [ctx.companyId, row.id])).rows;
    return { ...row, visits };
  },
}));

router.use(resource({
  path: '/vehicles', table: 'vehicles', module: 'veiculos', entity: 'veículo',
  schema: vehicleSchema,
  columns: ['customer_id', 'plate', 'brand', 'model', 'year', 'color', 'mileage', 'notes'],
  select: 't.*, c.name AS customer_name, c.phone AS customer_phone',
  joins: 'JOIN customers c ON c.id = t.customer_id AND c.company_id = t.company_id',
  search: ['t.plate', 't.model', 't.brand', 'c.name'],
  filters: { customer_id: eqId('t.customer_id') },
  sort: { plate: 't.plate', model: 'lower(t.model)', customer: 'lower(c.name)', created_at: 't.created_at' },
  defaultSort: 'plate', softDelete: true,
  optionLabel: `t.plate || ' · ' || coalesce(t.brand || ' ', '') || t.model`,
  label: (r) => `${r.plate} ${r.model}`,
  prepare: (_db, _ctx, d) => ({ ...d, plate: String(d.plate).replace('-', '') }),
  detail: async (db, ctx, row) => {
    const orders = (await db.query(
      `SELECT id, number, title, status, opened_on, completed_on, total FROM work_orders WHERE company_id = $1 AND vehicle_id = $2 ORDER BY opened_on DESC`,
      [ctx.companyId, row.id])).rows;
    return { ...row, orders };
  },
}));

// ---------------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------------
router.use(resource({
  path: '/employees', table: 'employees', module: 'equipe', entity: 'colaborador',
  schema: employeeSchema,
  columns: ['name', 'role_title', 'responsibilities', 'phone', 'email', 'document', 'hire_date', 'work_schedule', 'color', 'status', 'notes'],
  select: `t.*, (SELECT count(*)::int FROM tasks k WHERE k.company_id = t.company_id AND k.assignee_id = t.id AND k.status <> 'concluida') AS open_tasks,
           (SELECT m.role FROM company_members m WHERE m.company_id = t.company_id AND m.employee_id = t.id LIMIT 1) AS user_role`,
  search: ['t.name', 't.role_title', 't.phone', 't.email'],
  filters: { status: eq('t.status', ['ativo', 'ferias', 'afastado', 'desligado']) },
  sort: { name: 'lower(t.name)', role_title: 't.role_title', hire_date: 't.hire_date', status: 't.status' },
  defaultSort: 'name', softDelete: true,
  label: (r) => r.name,
  prepare: (_db, _ctx, d) => ({ ...d, document: digits(d.document) }),
  redact: (row, ctx) => (canDo(ctx.role, 'editCompany') ? row : { ...row, document: null }),
  detail: async (db, ctx, row) => {
    const q = (sql: string) => db.query(sql, [ctx.companyId, row.id]).then((r) => r.rows);
    const [trainings, tasks, shifts] = await Promise.all([
      q(`SELECT * FROM employee_trainings WHERE company_id = $1 AND employee_id = $2 ORDER BY coalesce(completed_on, created_at::date) DESC`),
      q(`SELECT id, title, status, priority, due_date FROM tasks WHERE company_id = $1 AND assignee_id = $2 AND status <> 'concluida' ORDER BY due_date NULLS LAST`),
      q(`SELECT id, date, kind, start_time, end_time FROM shifts WHERE company_id = $1 AND employee_id = $2 AND date >= current_date - 7 ORDER BY date LIMIT 30`),
    ]);
    return { ...row, trainings, tasks, shifts };
  },
}));

router.use(resource({
  path: '/employee-trainings', table: 'employee_trainings', module: 'equipe', entity: 'treinamento',
  schema: trainingSchema,
  columns: ['employee_id', 'title', 'kind', 'completed_on', 'expires_on', 'notes'],
  select: 't.*, e.name AS employee_name',
  joins: 'JOIN employees e ON e.id = t.employee_id AND e.company_id = t.company_id',
  search: ['t.title', 'e.name'],
  filters: { employee_id: eqId('t.employee_id') },
  sort: { title: 't.title', completed_on: 't.completed_on', expires_on: 't.expires_on' },
  defaultSort: 'completed_on', defaultDir: 'desc',
  label: (r) => r.title,
}));

// ---------------------------------------------------------------------------
// Serviços
// ---------------------------------------------------------------------------
router.use(resource({
  path: '/services', table: 'services', module: 'servicos', entity: 'serviço',
  schema: serviceSchema,
  columns: ['name', 'description', 'category', 'duration_minutes', 'price', 'estimated_cost', 'active'],
  select: `t.*, (SELECT count(*)::int FROM appointments a WHERE a.company_id = t.company_id AND a.service_id = t.id AND a.status = 'concluido' AND a.starts_at > now() - interval '30 days') AS done_30d`,
  search: ['t.name', 't.category'],
  filters: { active: (v) => (v === '1' ? 't.active' : v === '0' ? 'NOT t.active' : null), category: eq('t.category') },
  sort: { name: 'lower(t.name)', price: 't.price', duration_minutes: 't.duration_minutes', done_30d: 'done_30d' },
  defaultSort: 'name', softDelete: true,
  optionLabel: `t.name`,
  label: (r) => r.name,
  redact: (row, ctx) => (canDo(ctx.role, 'viewCosts') ? row : { ...row, estimated_cost: null }),
}));

// lista de responsáveis (para selects em qualquer módulo, sem exigir acesso ao módulo Equipe)
router.get('/staff/options', h(async (req, res) => {
  const rows = await tx(req, async (db, ctx) => (await db.query(
    `SELECT id, name AS label, color, role_title FROM employees WHERE company_id = $1 AND archived_at IS NULL AND status <> 'desligado' ORDER BY name`,
    [ctx.companyId])).rows);
  res.json({ data: rows });
}));

router.get('/customers-lookup/:id/pets', requirePermission('clientes'), h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const rows = await tx(req, async (db, ctx) => (await db.query(
    `SELECT id, name AS label FROM pets WHERE company_id = $1 AND customer_id = $2 AND archived_at IS NULL ORDER BY name`, [ctx.companyId, req.params.id])).rows);
  res.json({ data: rows });
}));

export default router;
