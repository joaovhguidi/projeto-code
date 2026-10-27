import { Router } from 'express';
import {
  campaignSchema, commentSchema, customerContactSchema, deliveryOccurrenceSchema, deliverySchema, deliveryStatusSchema, equipmentSchema,
  feedbackActionSchema, feedbackSchema, issueSchema, issueUpdateSchema, maintenanceSchema, shiftSchema, swapDecisionSchema, swapRequestSchema,
  taskSchema, wasteSchema, DELIVERY_STATUS, TASK_STATUS, fromCents, lineTotal,
} from '@nexo/shared';
import { audit, nextNumber } from '../lib/audit';
import { Params, eq, eqId, dateFrom, dateTo, inList, resource } from '../lib/crud';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { h, isDate, isUuid, str } from '../lib/http';
import { modulePermission, requirePermission, tx } from '../middleware/auth';
import { localDate, systemCategory, addPayment } from '../services/finance';
import { moveStock } from '../services/stock';

const router = Router();

// ---------------------------------------------------------------------------
// Tarefas
// ---------------------------------------------------------------------------
router.use(resource({
  path: '/tasks', table: 'tasks', module: 'tarefas', entity: 'tarefa',
  schema: taskSchema,
  columns: ['title', 'description', 'assignee_id', 'priority', 'status', 'start_date', 'due_date', 'project'],
  select: `t.*, e.name AS assignee_name, e.color AS assignee_color,
    (t.status <> 'concluida' AND t.due_date < (now() AT TIME ZONE co.timezone)::date) AS is_overdue,
    (SELECT count(*)::int FROM task_comments c WHERE c.company_id = t.company_id AND c.task_id = t.id) AS comments_count`,
  joins: `JOIN companies co ON co.id = t.company_id LEFT JOIN employees e ON e.id = t.assignee_id AND e.company_id = t.company_id`,
  search: ['t.title', 't.description', 't.project', 'e.name'],
  filters: {
    status: inList('t.status', Object.keys(TASK_STATUS)),
    priority: inList('t.priority', ['baixa', 'media', 'alta', 'urgente']),
    assignee_id: eqId('t.assignee_id'),
    project: eq('t.project'),
    overdue: (v) => (v === '1' ? `t.status <> 'concluida' AND t.due_date < (now() AT TIME ZONE co.timezone)::date` : null),
    due_from: dateFrom('t.due_date'), due_to: dateTo('t.due_date'),
  },
  sort: {
    due_date: 't.due_date', title: 'lower(t.title)', created_at: 't.created_at', status: 't.status',
    priority: `CASE t.priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END`,
  },
  defaultSort: 'due_date',
  label: (r) => r.title,
  prepare: (_db, _ctx, d, existing) => {
    if (d.status === 'concluida' && existing?.status !== 'concluida') d.completed_at = new Date().toISOString();
    if (d.status !== 'concluida') d.completed_at = null;
    return d;
  },
  afterWrite: async (db, ctx, row, data) => {
    await db.query(`UPDATE tasks SET completed_at = $3 WHERE company_id = $1 AND id = $2`, [ctx.companyId, row.id, data.completed_at ?? null]);
  },
  detail: async (db, ctx, row) => {
    const comments = (await db.query(`SELECT c.*, u.name AS user_name FROM task_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.company_id = $1 AND c.task_id = $2 ORDER BY c.created_at`, [ctx.companyId, row.id])).rows;
    const history = (await db.query(`SELECT a.summary, a.created_at, u.name AS user_name FROM activity_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.company_id = $1 AND a.entity = 'tarefa' AND a.entity_id = $2 ORDER BY a.created_at DESC`, [ctx.companyId, row.id])).rows;
    return { ...row, comments, history };
  },
  extend: (r) => {
    r.patch('/tasks/:id/status', h(async (req, res) => {
      const status = String(req.body?.status ?? '');
      if (!(status in TASK_STATUS)) throw badRequest('Situação inválida.');
      await tx(req, async (db, ctx) => {
        const t = (await db.query(`SELECT title, status FROM tasks WHERE company_id = $1 AND id = $2`, [ctx.companyId, req.params.id])).rows[0];
        if (!t) throw notFound();
        await db.query(`UPDATE tasks SET status = $3, completed_at = CASE WHEN $3 = 'concluida' THEN coalesce(completed_at, now()) ELSE NULL END WHERE company_id = $1 AND id = $2`,
          [ctx.companyId, req.params.id, status]);
        await audit(db, ctx, 'atualizou', 'tarefa', req.params.id, `"${t.title}": ${TASK_STATUS[t.status as keyof typeof TASK_STATUS]} → ${TASK_STATUS[status as keyof typeof TASK_STATUS]}`);
      });
      res.json({ ok: true });
    }));
    r.post('/tasks/:id/comments', h(async (req, res) => {
      if (!isUuid(req.params.id)) throw notFound();
      const { body } = commentSchema.parse(req.body);
      await tx(req, async (db, ctx) => {
        await db.query(`INSERT INTO task_comments (company_id, task_id, user_id, body) VALUES ($1,$2,$3,$4)`, [ctx.companyId, req.params.id, ctx.user.id, body]);
        await audit(db, ctx, 'comentou', 'tarefa', req.params.id, 'Comentou na tarefa');
      });
      res.status(201).json({ ok: true });
    }));
  },
}));

// ---------------------------------------------------------------------------
// Entregas e pedidos
// ---------------------------------------------------------------------------
router.use(resource({
  path: '/deliveries', table: 'deliveries', module: 'entregas', entity: 'entrega',
  schema: deliverySchema,
  columns: ['customer_id', 'sale_id', 'recipient_name', 'recipient_phone', 'address', 'neighborhood', 'description', 'courier_id', 'scheduled_for', 'fee', 'cost', 'distance_km', 'notes', 'number'],
  select: `t.*, c.name AS customer_name, e.name AS courier_name, s.number AS sale_number,
    (t.status NOT IN ('concluida','cancelada') AND t.scheduled_for < now()) AS is_late,
    (t.status = 'concluida' AND t.delivered_at > t.scheduled_for) AS delivered_late`,
  joins: `LEFT JOIN customers c ON c.id = t.customer_id AND c.company_id = t.company_id LEFT JOIN employees e ON e.id = t.courier_id AND e.company_id = t.company_id
          LEFT JOIN sales s ON s.id = t.sale_id AND s.company_id = t.company_id`,
  search: ['t.recipient_name', 't.address', 't.neighborhood', 't.number', 'c.name'],
  filters: {
    status: inList('t.status', Object.keys(DELIVERY_STATUS)),
    courier_id: eqId('t.courier_id'),
    late: (v) => (v === '1' ? `t.status NOT IN ('concluida','cancelada') AND t.scheduled_for < now()` : null),
    open: (v) => (v === '1' ? `t.status NOT IN ('concluida','cancelada')` : null),
    from: (v, p, req) => (isDate(v) ? `t.scheduled_for >= (${p.add(v)}::date)::timestamp AT TIME ZONE ${p.add((req as any).auth.company.timezone)}` : null),
    to: (v, p, req) => (isDate(v) ? `t.scheduled_for < ((${p.add(v)}::date + 1)::timestamp AT TIME ZONE ${p.add((req as any).auth.company.timezone)})` : null),
  },
  sort: { scheduled_for: 't.scheduled_for', number: 't.number', status: 't.status', recipient: 'lower(t.recipient_name)' },
  defaultSort: 'scheduled_for',
  label: (r) => `#${r.number} ${r.recipient_name}`,
  prepare: async (db, ctx, d, existing) => {
    if (!existing) d.number = await nextNumber(db, ctx.companyId, 'delivery');
    else if (['concluida', 'cancelada'].includes(existing.status)) throw conflict('Entregas concluídas ou canceladas não podem ser editadas.');
    return d;
  },
  afterWrite: async (db, ctx, row, _d, existing) => {
    if (!existing) await db.query(`INSERT INTO delivery_events (company_id, delivery_id, kind, status, note, user_id) VALUES ($1,$2,'status','aguardando','Pedido registrado',$3)`, [ctx.companyId, row.id, ctx.user.id]);
  },
  beforeDelete: async (_db, _ctx, row) => { if (row.status === 'concluida') throw conflict('Entregas concluídas fazem parte do histórico. Não é possível excluir.'); },
  detail: async (db, ctx, row) => {
    const events = (await db.query(`SELECT ev.*, u.name AS user_name FROM delivery_events ev LEFT JOIN users u ON u.id = ev.user_id WHERE ev.company_id = $1 AND ev.delivery_id = $2 ORDER BY ev.created_at DESC`, [ctx.companyId, row.id])).rows;
    return { ...row, events };
  },
  extend: (r) => {
    r.patch('/deliveries/:id/status', h(async (req, res) => {
      if (!isUuid(req.params.id)) throw notFound();
      const data = deliveryStatusSchema.parse(req.body);
      await tx(req, async (db, ctx) => {
        const d = (await db.query(`SELECT * FROM deliveries WHERE company_id = $1 AND id = $2 FOR UPDATE`, [ctx.companyId, req.params.id])).rows[0];
        if (!d) throw notFound();
        if (d.status === data.status) throw badRequest('A entrega já está nesta situação.');
        if (['concluida', 'cancelada'].includes(d.status)) throw conflict('Entrega encerrada. Registre uma ocorrência se necessário.');
        await db.query(`UPDATE deliveries SET status = $3, delivered_at = CASE WHEN $3 = 'concluida' THEN now() ELSE NULL END WHERE company_id = $1 AND id = $2`,
          [ctx.companyId, d.id, data.status]);
        await db.query(`INSERT INTO delivery_events (company_id, delivery_id, kind, status, note, user_id) VALUES ($1,$2,'status',$3,$4,$5)`,
          [ctx.companyId, d.id, data.status, data.note ?? null, ctx.user.id]);
        // custo operacional vira despesa quando a entrega é concluída (uma única vez)
        if (data.status === 'concluida' && d.cost > 0) {
          const day = await localDate(db, ctx);
          const cat = (await db.query(`SELECT id FROM finance_categories WHERE company_id = $1 AND name = 'Transporte e entregas'`, [ctx.companyId])).rows[0]?.id ?? null;
          await db.query(
            `INSERT INTO financial_transactions (company_id, kind, description, category_id, amount, competence_date, due_date, source, reference_id, created_by)
             VALUES ($1,'despesa',$2,$3,$4,$5,$5,'entrega',$6,$7) ON CONFLICT DO NOTHING`,
            [ctx.companyId, `Custo da entrega #${d.number}`, cat, d.cost, day, d.id, ctx.user.id]);
        }
        await audit(db, ctx, 'atualizou', 'entrega', d.id, `Entrega #${d.number}: ${DELIVERY_STATUS[data.status]}`);
      });
      res.json({ ok: true });
    }));
    r.post('/deliveries/:id/occurrences', h(async (req, res) => {
      if (!isUuid(req.params.id)) throw notFound();
      const { note } = deliveryOccurrenceSchema.parse(req.body);
      await tx(req, async (db, ctx) => {
        const d = (await db.query(`SELECT number FROM deliveries WHERE company_id = $1 AND id = $2`, [ctx.companyId, req.params.id])).rows[0];
        if (!d) throw notFound();
        await db.query(`INSERT INTO delivery_events (company_id, delivery_id, kind, note, user_id) VALUES ($1,$2,'ocorrencia',$3,$4)`, [ctx.companyId, req.params.id, note, ctx.user.id]);
        await audit(db, ctx, 'criou', 'entrega', req.params.id, `Ocorrência na entrega #${d.number}`);
      });
      res.status(201).json({ ok: true });
    }));
  },
}));

// ---------------------------------------------------------------------------
// Escalas
// ---------------------------------------------------------------------------
router.use('/shifts', modulePermission('escalas'));
router.use('/shift-swaps', modulePermission('escalas'));

router.get('/shifts', h(async (req, res) => {
  const from = isDate(req.query.from) ? req.query.from : null;
  const to = isDate(req.query.to) ? req.query.to : null;
  if (!from || !to) throw badRequest('Informe o período.');
  const data = await tx(req, async (db, ctx) => {
    const p = [ctx.companyId, from, to];
    let extra = '';
    if (isUuid(req.query.employee_id)) { p.push(req.query.employee_id); extra = ` AND s.employee_id = $4`; }
    const shifts = (await db.query(
      `SELECT s.*, e.name AS employee_name, e.color AS employee_color FROM shifts s JOIN employees e ON e.id = s.employee_id
        WHERE s.company_id = $1 AND s.date BETWEEN $2 AND $3${extra} ORDER BY s.date, s.start_time NULLS FIRST`, p)).rows;
    const swaps = (await db.query(
      `SELECT w.*, s.date, s.start_time, s.end_time, r.name AS requester_name, t.name AS target_name
         FROM shift_swap_requests w JOIN shifts s ON s.id = w.shift_id JOIN employees r ON r.id = w.requester_id LEFT JOIN employees t ON t.id = w.target_employee_id
        WHERE w.company_id = $1 AND (w.status = 'pendente' OR s.date BETWEEN $2 AND $3) ORDER BY w.created_at DESC`, [ctx.companyId, from, to])).rows;
    return { shifts, swaps };
  });
  res.json({ data });
}));

router.post('/shifts', h(async (req, res) => {
  const data = shiftSchema.parse(req.body);
  const row = await tx(req, async (db, ctx) => {
    const r = await db.query(`INSERT INTO shifts (company_id, employee_id, date, kind, start_time, end_time, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [ctx.companyId, data.employee_id, data.date, data.kind, data.kind === 'turno' ? data.start_time : null, data.kind === 'turno' ? data.end_time : null, data.notes ?? null]);
    await audit(db, ctx, 'criou', 'escala', r.rows[0].id, `Lançou ${data.kind} em ${data.date.split('-').reverse().join('/')}`);
    return r.rows[0];
  });
  res.status(201).json({ data: row });
}));

// copia a escala de uma semana para a seguinte (sem sobrescrever conflitos)
router.post('/shifts/copy-week', h(async (req, res) => {
  const from = req.body?.from;
  if (!isDate(from)) throw badRequest('Informe a semana de origem.');
  const result = await tx(req, async (db, ctx) => {
    const src = (await db.query(`SELECT * FROM shifts WHERE company_id = $1 AND date BETWEEN $2::date AND $2::date + 6`, [ctx.companyId, from])).rows;
    let created = 0, skipped = 0;
    for (const s of src) {
      const r = await db.query(
        `INSERT INTO shifts (company_id, employee_id, date, kind, start_time, end_time, notes)
         SELECT $1,$2,$3::date + 7,$4,$5,$6,$7
          WHERE NOT EXISTS (SELECT 1 FROM shifts x WHERE x.company_id = $1 AND x.employee_id = $2 AND x.date = $3::date + 7)`,
        [ctx.companyId, s.employee_id, s.date, s.kind, s.start_time, s.end_time, s.notes]);
      if (r.rowCount) created++; else skipped++;
    }
    await audit(db, ctx, 'criou', 'escala', null, `Copiou a escala da semana de ${from.split('-').reverse().join('/')} (${created} lançamentos)`);
    return { created, skipped };
  });
  res.status(201).json({ data: result });
}));

router.put('/shifts/:id', h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const data = shiftSchema.parse(req.body);
  await tx(req, async (db, ctx) => {
    const r = await db.query(`UPDATE shifts SET employee_id=$3, date=$4, kind=$5, start_time=$6, end_time=$7, notes=$8 WHERE company_id = $1 AND id = $2 RETURNING id`,
      [ctx.companyId, req.params.id, data.employee_id, data.date, data.kind, data.kind === 'turno' ? data.start_time : null, data.kind === 'turno' ? data.end_time : null, data.notes ?? null]);
    if (!r.rows[0]) throw notFound();
    await audit(db, ctx, 'atualizou', 'escala', req.params.id, `Alterou escala de ${data.date.split('-').reverse().join('/')}`);
  });
  res.json({ ok: true });
}));

router.delete('/shifts/:id', h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  await tx(req, async (db, ctx) => {
    const r = await db.query(`DELETE FROM shifts WHERE company_id = $1 AND id = $2 RETURNING date`, [ctx.companyId, req.params.id]);
    if (!r.rows[0]) throw notFound();
    await audit(db, ctx, 'excluiu', 'escala', req.params.id, `Removeu escala de ${String(r.rows[0].date).split('-').reverse().join('/')}`);
  });
  res.json({ ok: true });
}));

router.post('/shift-swaps', h(async (req, res) => {
  const data = swapRequestSchema.parse(req.body);
  await tx(req, async (db, ctx) => {
    const s = (await db.query(`SELECT employee_id FROM shifts WHERE company_id = $1 AND id = $2`, [ctx.companyId, data.shift_id])).rows[0];
    if (!s) throw notFound('Turno não encontrado');
    if (s.employee_id !== data.requester_id) throw badRequest('Somente o colaborador escalado pode solicitar a troca deste turno.');
    if (data.target_employee_id === data.requester_id) throw badRequest('Escolha outro colaborador para a troca.');
    await db.query(`INSERT INTO shift_swap_requests (company_id, shift_id, requester_id, target_employee_id, reason) VALUES ($1,$2,$3,$4,$5)`,
      [ctx.companyId, data.shift_id, data.requester_id, data.target_employee_id ?? null, data.reason]);
    await audit(db, ctx, 'criou', 'escala', data.shift_id, 'Solicitou troca de turno');
  });
  res.status(201).json({ ok: true });
}));

router.patch('/shift-swaps/:id', requirePermission('equipe', 'write'), h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const { status } = swapDecisionSchema.parse(req.body);
  await tx(req, async (db, ctx) => {
    const w = (await db.query(`SELECT * FROM shift_swap_requests WHERE company_id = $1 AND id = $2 FOR UPDATE`, [ctx.companyId, req.params.id])).rows[0];
    if (!w) throw notFound();
    if (w.status !== 'pendente') throw conflict('Esta solicitação já foi decidida.');
    if (status === 'aprovada' && w.target_employee_id) {
      // a restrição de sobreposição impede aprovar se o substituto já tiver turno no horário
      await db.query(`UPDATE shifts SET employee_id = $3 WHERE company_id = $1 AND id = $2`, [ctx.companyId, w.shift_id, w.target_employee_id]);
    }
    await db.query(`UPDATE shift_swap_requests SET status = $3, decided_at = now(), decided_by = $4 WHERE company_id = $1 AND id = $2`, [ctx.companyId, w.id, status, ctx.user.id]);
    await audit(db, ctx, 'atualizou', 'escala', w.shift_id, `Troca de turno ${status}`);
  });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Equipamentos e manutenção
// ---------------------------------------------------------------------------
router.use(resource({
  path: '/equipment', table: 'equipment', module: 'manutencao', entity: 'equipamento',
  schema: equipmentSchema,
  columns: ['name', 'category', 'brand', 'model', 'serial', 'location', 'purchase_date', 'status', 'preventive_interval_days', 'next_preventive_on', 'notes'],
  select: `t.*, (SELECT coalesce(sum(m.cost),0) FROM maintenance_orders m WHERE m.company_id = t.company_id AND m.equipment_id = t.id AND m.status = 'concluida') AS total_cost,
    (SELECT count(*)::int FROM maintenance_orders m WHERE m.company_id = t.company_id AND m.equipment_id = t.id AND m.type = 'corretiva') AS defects,
    (t.next_preventive_on IS NOT NULL AND t.next_preventive_on <= current_date + 7) AS preventive_due`,
  search: ['t.name', 't.category', 't.brand', 't.model', 't.serial', 't.location'],
  filters: { status: eq('t.status', ['operando', 'com_defeito', 'em_manutencao', 'desativado']), preventive_due: (v) => (v === '1' ? 't.next_preventive_on <= current_date + 7' : null) },
  sort: { name: 'lower(t.name)', status: 't.status', next_preventive_on: 't.next_preventive_on', total_cost: 'total_cost' },
  defaultSort: 'name', softDelete: true,
  label: (r) => r.name,
  detail: async (db, ctx, row) => {
    const orders = (await db.query(`SELECT m.*, s.name AS supplier_name FROM maintenance_orders m LEFT JOIN suppliers s ON s.id = m.supplier_id WHERE m.company_id = $1 AND m.equipment_id = $2 ORDER BY coalesce(m.completed_on, m.scheduled_on, m.created_at::date) DESC`, [ctx.companyId, row.id])).rows;
    return { ...row, orders };
  },
}));

router.use(resource({
  path: '/maintenance', table: 'maintenance_orders', module: 'manutencao', entity: 'manutenção',
  schema: maintenanceSchema,
  columns: ['equipment_id', 'type', 'problem', 'solution', 'scheduled_on', 'completed_on', 'responsible', 'supplier_id', 'status', 'cost', 'notes'],
  select: 't.*, e.name AS equipment_name, s.name AS supplier_name',
  joins: 'JOIN equipment e ON e.id = t.equipment_id AND e.company_id = t.company_id LEFT JOIN suppliers s ON s.id = t.supplier_id AND s.company_id = t.company_id',
  search: ['t.problem', 'e.name', 't.responsible'],
  filters: { status: inList('t.status', ['aberta', 'em_andamento', 'concluida', 'cancelada']), type: eq('t.type', ['corretiva', 'preventiva']), equipment_id: eqId('t.equipment_id') },
  sort: { scheduled_on: 't.scheduled_on', completed_on: 't.completed_on', cost: 't.cost', equipment: 'lower(e.name)', created_at: 't.created_at' },
  defaultSort: 'created_at', defaultDir: 'desc',
  label: (r) => `${r.equipment_name}: ${r.problem}`,
  prepare: async (db, ctx, d) => {
    if (d.status === 'concluida' && !d.completed_on) d.completed_on = await localDate(db, ctx);
    if (d.status !== 'concluida') d.completed_on = null;
    return d;
  },
  afterWrite: async (db, ctx, row, data) => {
    // reflete a situação no equipamento
    const eqStatus = row.status === 'concluida' ? 'operando' : row.status === 'cancelada' ? null : 'em_manutencao';
    if (eqStatus) {
      await db.query(`UPDATE equipment SET status = $3,
          next_preventive_on = CASE WHEN $3 = 'operando' AND $4 = 'preventiva' AND preventive_interval_days IS NOT NULL THEN $5::date + preventive_interval_days ELSE next_preventive_on END
        WHERE company_id = $1 AND id = $2 AND status <> 'desativado'`, [ctx.companyId, row.equipment_id, eqStatus, row.type, row.completed_on]);
    }
    if (row.status === 'concluida' && data.register_expense && row.cost > 0) {
      const cat = await systemCategory(db, ctx.companyId, 'manutencao');
      const r = await db.query(
        `INSERT INTO financial_transactions (company_id, kind, description, category_id, amount, competence_date, due_date, supplier_id, source, reference_id, created_by)
         VALUES ($1,'despesa',$2,$3,$4,$5,$5,$6,'manutencao',$7,$8) ON CONFLICT DO NOTHING RETURNING id`,
        [ctx.companyId, `Manutenção: ${row.equipment_name}`, cat, row.cost, row.completed_on, row.supplier_id, row.id, ctx.user.id]);
      if (!r.rows[0]) {
        // já existia: mantém o valor sincronizado se ainda não houve pagamento
        await db.query(`UPDATE financial_transactions SET amount = $4 WHERE company_id = $1 AND source = 'manutencao' AND reference_id = $2 AND amount_paid = 0 AND status = 'pendente' AND amount <> $4 AND $3`,
          [ctx.companyId, row.id, true, row.cost]);
      }
    }
  },
}));

// ---------------------------------------------------------------------------
// Desperdícios (baixa no estoque quando vinculado a produto)
// ---------------------------------------------------------------------------
router.use(resource({
  path: '/waste', table: 'waste_records', module: 'desperdicios', entity: 'perda',
  schema: wasteSchema,
  columns: ['product_id', 'description', 'quantity', 'unit', 'unit_cost', 'total_cost', 'reason', 'occurred_on', 'notes'],
  select: 't.*, p.name AS product_name',
  joins: 'LEFT JOIN products p ON p.id = t.product_id AND p.company_id = t.company_id',
  search: ['t.description', 'p.name', 't.notes'],
  filters: { reason: inList('t.reason', ['vencido', 'danificado', 'perdido', 'erro_preparo', 'sobra', 'furto', 'outro']), product_id: eqId('t.product_id'), from: dateFrom('t.occurred_on'), to: dateTo('t.occurred_on') },
  sort: { occurred_on: 't.occurred_on', total_cost: 't.total_cost', quantity: 't.quantity', description: 'lower(t.description)' },
  defaultSort: 'occurred_on', defaultDir: 'desc',
  label: (r) => r.description,
  prepare: async (db, ctx, d, existing) => {
    if (d.product_id) {
      const p = (await db.query(`SELECT cost_price, unit FROM products WHERE company_id = $1 AND id = $2`, [ctx.companyId, d.product_id])).rows[0];
      if (!p) throw badRequest('Produto não encontrado.');
      if (!d.unit_cost) d.unit_cost = p.cost_price;
      d.unit = p.unit;
    }
    d.total_cost = lineTotal(d.quantity, d.unit_cost ?? 0);
    // estorna a baixa anterior para reaplicar com os novos valores
    if (existing?.stock_movement_id && existing.product_id) {
      await moveStock(db, ctx, { productId: existing.product_id, delta: existing.quantity, type: 'ajuste', reason: 'Correção de registro de perda', refType: 'waste', refId: existing.id, allowNegative: true });
      await db.query(`UPDATE waste_records SET stock_movement_id = NULL WHERE company_id = $1 AND id = $2`, [ctx.companyId, existing.id]);
    }
    return d;
  },
  afterWrite: async (db, ctx, row, data) => {
    if (row.product_id && data.deduct_stock) {
      const m = await moveStock(db, ctx, { productId: row.product_id, delta: -row.quantity, type: 'perda', unitCost: row.unit_cost, reason: `Perda: ${row.description}`, refType: 'waste', refId: row.id, allowNegative: true });
      await db.query(`UPDATE waste_records SET stock_movement_id = $3 WHERE company_id = $1 AND id = $2`, [ctx.companyId, row.id, m?.movementId ?? null]);
    }
  },
  beforeDelete: async (db, ctx, row) => {
    if (row.stock_movement_id && row.product_id) {
      await moveStock(db, ctx, { productId: row.product_id, delta: row.quantity, type: 'ajuste', reason: 'Exclusão de registro de perda', refType: 'waste', refId: row.id, allowNegative: true });
    }
  },
}));

router.get('/waste-summary', requirePermission('desperdicios'), h(async (req, res) => {
  const data = await tx(req, async (db, ctx) => {
    const today = await localDate(db, ctx);
    const from = isDate(req.query.from) ? req.query.from : today.slice(0, 8) + '01';
    const to = isDate(req.query.to) ? req.query.to : today;
    const byReason = (await db.query(`SELECT reason, count(*)::int AS count, sum(total_cost) AS total FROM waste_records WHERE company_id = $1 AND occurred_on BETWEEN $2 AND $3 GROUP BY reason ORDER BY 3 DESC`, [ctx.companyId, from, to])).rows;
    const byProduct = (await db.query(`SELECT coalesce(p.name, w.description) AS name, sum(w.quantity) AS quantity, sum(w.total_cost) AS total FROM waste_records w LEFT JOIN products p ON p.id = w.product_id WHERE w.company_id = $1 AND w.occurred_on BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 3 DESC LIMIT 10`, [ctx.companyId, from, to])).rows;
    const totals = (await db.query(`SELECT coalesce(sum(total_cost),0) AS total, count(*)::int AS count FROM waste_records WHERE company_id = $1 AND occurred_on BETWEEN $2 AND $3`, [ctx.companyId, from, to])).rows[0];
    const sales = (await db.query(`SELECT coalesce(sum(total),0) AS total FROM sales WHERE company_id = $1 AND status = 'concluida' AND (sold_at AT TIME ZONE $4)::date BETWEEN $2 AND $3`, [ctx.companyId, from, to, ctx.company.timezone])).rows[0];
    return { from, to, byReason, byProduct, total: totals.total, count: totals.count, salesTotal: sales.total, ratio: sales.total > 0 ? totals.total / sales.total : null };
  });
  res.json({ data });
}));

// ---------------------------------------------------------------------------
// Avaliações e reclamações
// ---------------------------------------------------------------------------
router.use(resource({
  path: '/feedbacks', table: 'feedbacks', module: 'avaliacoes', entity: 'avaliação',
  schema: feedbackSchema,
  columns: ['customer_id', 'type', 'rating', 'channel', 'title', 'description', 'responsible_id', 'status', 'due_date', 'received_on'],
  select: `t.*, c.name AS customer_name, e.name AS responsible_name,
    (t.status IN ('aberta','em_analise') AND t.due_date < current_date) AS is_overdue`,
  joins: 'LEFT JOIN customers c ON c.id = t.customer_id AND c.company_id = t.company_id LEFT JOIN employees e ON e.id = t.responsible_id AND e.company_id = t.company_id',
  search: ['t.title', 't.description', 'c.name'],
  filters: { type: inList('t.type', ['elogio', 'sugestao', 'reclamacao', 'avaliacao']), status: inList('t.status', ['aberta', 'em_analise', 'resolvida', 'arquivada']), responsible_id: eqId('t.responsible_id') },
  sort: { received_on: 't.received_on', due_date: 't.due_date', rating: 't.rating', status: 't.status' },
  defaultSort: 'received_on', defaultDir: 'desc',
  label: (r) => r.title,
  afterWrite: async (db, ctx, row, _d, existing) => {
    await db.query(`UPDATE feedbacks SET resolved_at = CASE WHEN status = 'resolvida' THEN coalesce(resolved_at, now()) ELSE NULL END WHERE company_id = $1 AND id = $2`, [ctx.companyId, row.id]);
    if (existing && existing.status !== row.status)
      await db.query(`INSERT INTO feedback_actions (company_id, feedback_id, description, user_id) VALUES ($1,$2,$3,$4)`, [ctx.companyId, row.id, `Situação alterada para "${row.status}"`, ctx.user.id]);
  },
  detail: async (db, ctx, row) => {
    const actions = (await db.query(`SELECT a.*, u.name AS user_name FROM feedback_actions a LEFT JOIN users u ON u.id = a.user_id WHERE a.company_id = $1 AND a.feedback_id = $2 ORDER BY a.created_at DESC`, [ctx.companyId, row.id])).rows;
    return { ...row, actions };
  },
  extend: (r) => {
    r.post('/feedbacks/:id/actions', h(async (req, res) => {
      if (!isUuid(req.params.id)) throw notFound();
      const { description } = feedbackActionSchema.parse(req.body);
      await tx(req, async (db, ctx) => {
        const f = (await db.query(`SELECT 1 FROM feedbacks WHERE company_id = $1 AND id = $2`, [ctx.companyId, req.params.id])).rows[0];
        if (!f) throw notFound();
        await db.query(`INSERT INTO feedback_actions (company_id, feedback_id, description, user_id) VALUES ($1,$2,$3,$4)`, [ctx.companyId, req.params.id, description, ctx.user.id]);
      });
      res.status(201).json({ ok: true });
    }));
  },
}));

router.get('/feedback-summary', requirePermission('avaliacoes'), h(async (req, res) => {
  const data = await tx(req, async (db, ctx) => (await db.query(
    `SELECT round(avg(rating) FILTER (WHERE received_on > current_date - 90), 2) AS avg_rating_90d,
            count(*) FILTER (WHERE rating IS NOT NULL AND received_on > current_date - 90)::int AS ratings_90d,
            count(*) FILTER (WHERE type = 'reclamacao' AND status IN ('aberta','em_analise'))::int AS open_complaints,
            count(*) FILTER (WHERE status IN ('aberta','em_analise') AND due_date < current_date)::int AS overdue,
            round(avg(extract(epoch FROM resolved_at - created_at) / 86400) FILTER (WHERE resolved_at IS NOT NULL), 1) AS avg_resolution_days
       FROM feedbacks WHERE company_id = $1`, [ctx.companyId])).rows[0]);
  res.json({ data });
}));

// ---------------------------------------------------------------------------
// Fidelização
// ---------------------------------------------------------------------------
router.use(resource({
  path: '/campaigns', table: 'loyalty_campaigns', module: 'fidelizacao', entity: 'campanha',
  schema: campaignSchema,
  columns: ['name', 'goal', 'audience', 'channel', 'offer', 'start_date', 'end_date', 'status'],
  select: `t.*, (SELECT count(*)::int FROM customer_contacts c WHERE c.company_id = t.company_id AND c.campaign_id = t.id) AS contacts,
    (SELECT count(*)::int FROM customer_contacts c WHERE c.company_id = t.company_id AND c.campaign_id = t.id AND c.outcome IN ('retornou','agendou')) AS conversions`,
  search: ['t.name', 't.goal'],
  filters: { status: inList('t.status', ['planejada', 'ativa', 'encerrada']) },
  sort: { start_date: 't.start_date', name: 'lower(t.name)' },
  defaultSort: 'start_date', defaultDir: 'desc',
  label: (r) => r.name,
}));

router.use(resource({
  path: '/customer-contacts', table: 'customer_contacts', module: 'fidelizacao', entity: 'contato',
  schema: customerContactSchema,
  columns: ['customer_id', 'campaign_id', 'contacted_on', 'channel', 'outcome', 'returned_on', 'notes', 'user_id'],
  select: 't.*, c.name AS customer_name, c.phone AS customer_phone, lc.name AS campaign_name',
  joins: 'JOIN customers c ON c.id = t.customer_id AND c.company_id = t.company_id LEFT JOIN loyalty_campaigns lc ON lc.id = t.campaign_id AND lc.company_id = t.company_id',
  search: ['c.name', 't.notes'],
  filters: { campaign_id: eqId('t.campaign_id'), customer_id: eqId('t.customer_id'), outcome: inList('t.outcome', ['sem_resposta', 'interessado', 'retornou', 'agendou', 'nao_interessado']) },
  sort: { contacted_on: 't.contacted_on', customer: 'lower(c.name)' },
  defaultSort: 'contacted_on', defaultDir: 'desc',
  label: (r) => `${r.customer_name} (${r.channel})`,
  prepare: (_db, ctx, d) => { d.user_id = ctx.user.id; return d; },
}));

router.get('/loyalty/overview', requirePermission('fidelizacao'), h(async (req, res) => {
  const data = await tx(req, async (db, ctx) => {
    const activity = `WITH act AS (
        SELECT customer_id, at FROM (
          SELECT customer_id, sold_at AS at FROM sales WHERE company_id = $1 AND status = 'concluida' AND customer_id IS NOT NULL
          UNION ALL SELECT customer_id, starts_at FROM appointments WHERE company_id = $1 AND status = 'concluido' AND sale_id IS NULL AND customer_id IS NOT NULL
        ) x),
      per AS (SELECT c.id, c.name, c.phone, c.whatsapp, c.created_at, max(a.at) AS last_at, count(a.at)::int AS visits,
                     count(a.at) FILTER (WHERE a.at > now() - interval '90 days')::int AS visits_90d
                FROM customers c LEFT JOIN act a ON a.customer_id = c.id WHERE c.company_id = $1 AND c.archived_at IS NULL GROUP BY c.id)`;
    const stats = (await db.query(`${activity}
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE visits_90d >= 2)::int AS recurring,
             count(*) FILTER (WHERE visits >= 1 AND last_at < now() - interval '90 days')::int AS inactive,
             count(*) FILTER (WHERE visits = 0)::int AS never,
             count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new_30d
        FROM per`, [ctx.companyId])).rows[0];
    const inactive = (await db.query(`${activity}
      SELECT id, name, phone, whatsapp, last_at, visits,
             (SELECT max(contacted_on) FROM customer_contacts cc WHERE cc.company_id = $1 AND cc.customer_id = per.id) AS last_contact_on
        FROM per WHERE visits >= 1 AND last_at < now() - interval '60 days' ORDER BY visits DESC, last_at DESC LIMIT 50`, [ctx.companyId])).rows;
    const returns = (await db.query(
      `SELECT count(*)::int AS contacts, count(*) FILTER (WHERE outcome IN ('retornou','agendou'))::int AS returned
         FROM customer_contacts WHERE company_id = $1 AND contacted_on > current_date - 90`, [ctx.companyId])).rows[0];
    return { ...stats, recurrenceRate: stats.total ? stats.recurring / stats.total : null, inactiveList: inactive, contacts90d: returns.contacts, returned90d: returns.returned };
  });
  res.json({ data });
}));

// ---------------------------------------------------------------------------
// Central de solicitações e problemas
// ---------------------------------------------------------------------------
router.use(resource({
  path: '/issues', table: 'issues', module: 'solicitacoes', entity: 'solicitação',
  schema: issueSchema,
  columns: ['title', 'category', 'description', 'priority', 'responsible_id', 'status', 'due_date', 'equipment_id'],
  select: `t.*, e.name AS responsible_name, eq.name AS equipment_name, u.name AS created_by_name,
    (t.status IN ('aberta','em_andamento') AND t.due_date < current_date) AS is_overdue`,
  joins: 'LEFT JOIN employees e ON e.id = t.responsible_id AND e.company_id = t.company_id LEFT JOIN equipment eq ON eq.id = t.equipment_id AND eq.company_id = t.company_id LEFT JOIN users u ON u.id = t.created_by',
  search: ['t.title', 't.description', 'e.name'],
  filters: {
    status: inList('t.status', ['aberta', 'em_andamento', 'resolvida', 'cancelada']),
    category: inList('t.category', ['equipamento', 'sistema', 'processo', 'infraestrutura', 'pessoas', 'outro']),
    priority: inList('t.priority', ['baixa', 'media', 'alta', 'urgente']),
    responsible_id: eqId('t.responsible_id'),
  },
  sort: { created_at: 't.created_at', due_date: 't.due_date', priority: `CASE t.priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END`, status: 't.status' },
  defaultSort: 'created_at', defaultDir: 'desc',
  label: (r) => r.title,
  prepare: (_db, ctx, d, existing) => { if (!existing) d.created_by = ctx.user.id; return d; },
  afterWrite: async (db, ctx, row, _d, existing) => {
    await db.query(`UPDATE issues SET resolved_at = CASE WHEN status = 'resolvida' THEN coalesce(resolved_at, now()) ELSE NULL END,
                    created_by = coalesce(created_by, $3) WHERE company_id = $1 AND id = $2`, [ctx.companyId, row.id, ctx.user.id]);
    if (existing && existing.status !== row.status)
      await db.query(`INSERT INTO issue_updates (company_id, issue_id, body, status, user_id) VALUES ($1,$2,$3,$4,$5)`, [ctx.companyId, row.id, 'Situação alterada', row.status, ctx.user.id]);
  },
  detail: async (db, ctx, row) => {
    const updates = (await db.query(`SELECT i.*, u.name AS user_name FROM issue_updates i LEFT JOIN users u ON u.id = i.user_id WHERE i.company_id = $1 AND i.issue_id = $2 ORDER BY i.created_at DESC`, [ctx.companyId, row.id])).rows;
    return { ...row, updates };
  },
  extend: (r) => {
    r.post('/issues/:id/updates', h(async (req, res) => {
      if (!isUuid(req.params.id)) throw notFound();
      const data = issueUpdateSchema.parse(req.body);
      await tx(req, async (db, ctx) => {
        const i = (await db.query(`SELECT title FROM issues WHERE company_id = $1 AND id = $2`, [ctx.companyId, req.params.id])).rows[0];
        if (!i) throw notFound();
        await db.query(`INSERT INTO issue_updates (company_id, issue_id, body, status, user_id) VALUES ($1,$2,$3,$4,$5)`, [ctx.companyId, req.params.id, data.body, data.status ?? null, ctx.user.id]);
        if (data.status) await db.query(`UPDATE issues SET status = $3, resolved_at = CASE WHEN $3 = 'resolvida' THEN now() ELSE NULL END WHERE company_id = $1 AND id = $2`, [ctx.companyId, req.params.id, data.status]);
        await audit(db, ctx, 'atualizou', 'solicitação', req.params.id, `Atualizou a solicitação "${i.title}"`);
      });
      res.status(201).json({ ok: true });
    }));
  },
}));

export default router;
