import { Router } from 'express';
import { appointmentSchema, saleSchema, APPOINTMENT_STATUS } from '@nexo/shared';
import { audit } from '../lib/audit';
import { Params } from '../lib/crud';
import { badRequest, conflict, notFound } from '../lib/errors';
import { h, isDate, isUuid, str } from '../lib/http';
import { modulePermission, requirePermission, tx, type Ctx } from '../middleware/auth';
import type { Db } from '../db/pool';
import { createSale } from '../services/sales';

const router = Router();
router.use('/appointments', modulePermission('agenda'));

const SELECT = `a.*, c.name AS customer_name, c.phone AS customer_phone, e.name AS employee_name, e.color AS employee_color,
  s.name AS service_name, pt.name AS pet_name, sa.number AS sale_number`;
const JOINS = `LEFT JOIN customers c ON c.id = a.customer_id AND c.company_id = a.company_id
  LEFT JOIN employees e ON e.id = a.employee_id AND e.company_id = a.company_id
  LEFT JOIN services s ON s.id = a.service_id AND s.company_id = a.company_id
  LEFT JOIN pets pt ON pt.id = a.pet_id AND pt.company_id = a.company_id
  LEFT JOIN sales sa ON sa.id = a.sale_id AND sa.company_id = a.company_id`;

async function findConflict(db: Db, ctx: Ctx, employeeId: string, startsAt: string, endsAt: string, ignoreId?: string) {
  const r = await db.query(
    `SELECT a.starts_at, a.ends_at, coalesce(c.name, a.title) AS who FROM appointments a LEFT JOIN customers c ON c.id = a.customer_id
      WHERE a.company_id = $1 AND a.employee_id = $2 AND a.status IN ('agendado','confirmado','concluido')
        AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')
        AND ($5::uuid IS NULL OR a.id <> $5) LIMIT 1`,
    [ctx.companyId, employeeId, startsAt, endsAt, ignoreId ?? null]);
  return r.rows[0];
}

const hhmm = (iso: string, tz: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

router.get('/appointments', h(async (req, res) => {
  const rows = await tx(req, async (db, ctx) => {
    const p = new Params();
    const where = [`a.company_id = ${p.add(ctx.companyId)}`];
    const tz = p.add(ctx.company.timezone);
    where.push(`${tz}::text IS NOT NULL`);
    // intervalo por datas locais da empresa
    const from = isDate(req.query.from) ? req.query.from : null;
    const to = isDate(req.query.to) ? req.query.to : null;
    if (from) where.push(`a.starts_at >= (${p.add(from)}::date)::timestamp AT TIME ZONE ${tz}`);
    if (to) where.push(`a.starts_at < ((${p.add(to)}::date + 1)::timestamp AT TIME ZONE ${tz})`);
    if (isUuid(req.query.employee_id)) where.push(`a.employee_id = ${p.add(req.query.employee_id)}`);
    if (isUuid(req.query.service_id)) where.push(`a.service_id = ${p.add(req.query.service_id)}`);
    if (isUuid(req.query.customer_id)) where.push(`a.customer_id = ${p.add(req.query.customer_id)}`);
    const st = str(req.query.status);
    if (st) where.push(`a.status = ANY(${p.add(st.split(',').filter((s) => s in APPOINTMENT_STATUS))})`);
    const q = str(req.query.q);
    if (q) where.push(`(c.name ILIKE ${p.add('%' + q + '%')} OR a.title ILIKE $${p.values.length})`);
    const limit = from && to ? 2000 : 200;
    return (await db.query(`SELECT ${SELECT} FROM appointments a ${JOINS} WHERE ${where.join(' AND ')} ORDER BY a.starts_at ${from || to ? 'ASC' : 'DESC'} LIMIT ${limit}`, p.values)).rows;
  });
  res.json({ data: rows });
}));

// Horários livres de um dia, considerando expediente, duração e agendamentos do profissional
router.get('/appointments/availability', h(async (req, res) => {
  const date = isDate(req.query.date) ? req.query.date : null;
  if (!date) throw badRequest('Informe a data.');
  const duration = Math.min(600, Math.max(5, Number(req.query.duration) || 30));
  const data = await tx(req, async (db, ctx) => {
    const tz = ctx.company.timezone;
    const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
    const hours = (ctx.company as any).opening_hours?.[String(weekday)];
    const configured = !!(ctx.company as any).opening_hours && Object.keys((ctx.company as any).opening_hours).length > 0;
    if (configured && !hours) return { date, closed: true, slots: [], configured };
    const open = hours?.open ?? '08:00', close = hours?.close ?? '18:00';
    const employees = isUuid(req.query.employee_id)
      ? (await db.query(`SELECT id, name FROM employees WHERE company_id = $1 AND id = $2`, [ctx.companyId, req.query.employee_id])).rows
      : (await db.query(`SELECT id, name FROM employees WHERE company_id = $1 AND archived_at IS NULL AND status = 'ativo' ORDER BY name`, [ctx.companyId])).rows;
    const busy = (await db.query(
      `SELECT employee_id, starts_at, ends_at FROM appointments WHERE company_id = $1 AND status IN ('agendado','confirmado','concluido')
          AND starts_at < (($2::date + 1)::timestamp AT TIME ZONE $3) AND ends_at > ($2::date::timestamp AT TIME ZONE $3)`,
      [ctx.companyId, date, tz])).rows;
    const off = (await db.query(`SELECT employee_id FROM shifts WHERE company_id = $1 AND date = $2 AND kind <> 'turno'`, [ctx.companyId, date])).rows.map((r) => r.employee_id);
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const base = (await db.query(`SELECT extract(epoch FROM ($1::date::timestamp AT TIME ZONE $2))::bigint * 1000 AS ms`, [date, tz])).rows[0].ms as number;
    const now = Date.now();
    const result = employees.filter((e) => !off.includes(e.id)).map((e) => {
      const slots: string[] = [];
      for (let m = toMin(open); m + duration <= toMin(close); m += 15) {
        const s = base + m * 60000, en = s + duration * 60000;
        if (s < now) continue;
        const clash = busy.some((b) => b.employee_id === e.id && new Date(b.starts_at).getTime() < en && new Date(b.ends_at).getTime() > s);
        if (!clash) slots.push(new Date(s).toISOString());
      }
      return { employee_id: e.id, employee_name: e.name, slots };
    });
    return { date, closed: false, open, close, configured, employees: result };
  });
  res.json({ data });
}));

router.get('/appointments/:id', h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const row = await tx(req, async (db, ctx) => {
    const r = (await db.query(`SELECT ${SELECT} FROM appointments a ${JOINS} WHERE a.company_id = $1 AND a.id = $2`, [ctx.companyId, req.params.id])).rows[0];
    if (!r) throw notFound('Agendamento não encontrado');
    return r;
  });
  res.json({ data: row });
}));

async function saveAppointment(db: Db, ctx: Ctx, data: any, existing: any | null) {
  if (data.employee_id && ['agendado', 'confirmado', 'concluido'].includes(data.status)) {
    const c = await findConflict(db, ctx, data.employee_id, data.starts_at, data.ends_at, existing?.id);
    if (c) {
      const tz = ctx.company.timezone;
      throw conflict(`Conflito de horário: o profissional já atende ${c.who ?? 'outro cliente'} das ${hhmm(c.starts_at, tz)} às ${hhmm(c.ends_at, tz)}.`);
    }
  }
  if (data.pet_id && data.customer_id) {
    const pet = await db.query(`SELECT 1 FROM pets WHERE company_id = $1 AND id = $2 AND customer_id = $3`, [ctx.companyId, data.pet_id, data.customer_id]);
    if (!pet.rows[0]) throw badRequest('O animal selecionado não pertence a este cliente.');
  }
  const cols = ['customer_id', 'employee_id', 'service_id', 'pet_id', 'title', 'starts_at', 'ends_at', 'status', 'price', 'notes', 'canceled_reason'];
  const vals = cols.map((c) => data[c] ?? (c === 'price' ? 0 : c === 'status' ? 'agendado' : null));
  if (existing) {
    await db.query(`UPDATE appointments SET ${cols.map((c, i) => `${c} = $${i + 3}`).join(', ')} WHERE company_id = $1 AND id = $2`, [ctx.companyId, existing.id, ...vals]);
    return existing.id as string;
  }
  const r = await db.query(`INSERT INTO appointments (company_id, created_by, ${cols.join(', ')}) VALUES ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(', ')}) RETURNING id`,
    [ctx.companyId, ctx.user.id, ...vals]);
  return r.rows[0].id as string;
}

router.post('/appointments', h(async (req, res) => {
  const data = appointmentSchema.parse(req.body);
  const row = await tx(req, async (db, ctx) => {
    const id = await saveAppointment(db, ctx, data, null);
    const r = (await db.query(`SELECT ${SELECT} FROM appointments a ${JOINS} WHERE a.company_id = $1 AND a.id = $2`, [ctx.companyId, id])).rows[0];
    await audit(db, ctx, 'criou', 'agendamento', id, `Agendou ${r.service_name ?? r.title ?? 'atendimento'} para ${r.customer_name ?? 'cliente'} em ${new Intl.DateTimeFormat('pt-BR', { timeZone: ctx.company.timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(r.starts_at))}`);
    return r;
  });
  res.status(201).json({ data: row });
}));

router.put('/appointments/:id', h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const data = appointmentSchema.parse(req.body);
  const row = await tx(req, async (db, ctx) => {
    const existing = (await db.query(`SELECT * FROM appointments WHERE company_id = $1 AND id = $2 FOR UPDATE`, [ctx.companyId, req.params.id])).rows[0];
    if (!existing) throw notFound('Agendamento não encontrado');
    if (existing.sale_id && data.status !== 'concluido') throw conflict('Este atendimento já tem venda registrada. Cancele a venda antes de alterar a situação.');
    await saveAppointment(db, ctx, data, existing);
    await audit(db, ctx, 'atualizou', 'agendamento', existing.id, `Atualizou agendamento (${APPOINTMENT_STATUS[data.status as keyof typeof APPOINTMENT_STATUS]})`);
    return (await db.query(`SELECT ${SELECT} FROM appointments a ${JOINS} WHERE a.company_id = $1 AND a.id = $2`, [ctx.companyId, existing.id])).rows[0];
  });
  res.json({ data: row });
}));

router.patch('/appointments/:id/status', h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const status = String(req.body?.status ?? '');
  if (!(status in APPOINTMENT_STATUS)) throw badRequest('Situação inválida.');
  await tx(req, async (db, ctx) => {
    const a = (await db.query(`SELECT * FROM appointments WHERE company_id = $1 AND id = $2 FOR UPDATE`, [ctx.companyId, req.params.id])).rows[0];
    if (!a) throw notFound('Agendamento não encontrado');
    if (a.sale_id && status !== 'concluido') throw conflict('Este atendimento já tem venda registrada. Cancele a venda antes de alterar a situação.');
    if (['agendado', 'confirmado', 'concluido'].includes(status) && a.employee_id) {
      const c = await findConflict(db, ctx, a.employee_id, a.starts_at, a.ends_at, a.id);
      if (c) throw conflict('Não é possível reativar: o horário já foi ocupado por outro atendimento.');
    }
    await db.query(`UPDATE appointments SET status = $3, canceled_reason = coalesce($4, canceled_reason) WHERE company_id = $1 AND id = $2`,
      [ctx.companyId, a.id, status, str(req.body?.reason) ?? null]);
    await audit(db, ctx, 'atualizou', 'agendamento', a.id, `Marcou agendamento como ${APPOINTMENT_STATUS[status as keyof typeof APPOINTMENT_STATUS]}`);
  });
  res.json({ ok: true });
}));

// Conclui o atendimento registrando a venda (e o pagamento) numa só operação
router.post('/appointments/:id/checkout', requirePermission('vendas', 'write'), h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const sale = await tx(req, async (db, ctx) => {
    const a = (await db.query(`SELECT a.*, s.name AS service_name FROM appointments a LEFT JOIN services s ON s.id = a.service_id WHERE a.company_id = $1 AND a.id = $2 FOR UPDATE OF a`, [ctx.companyId, req.params.id])).rows[0];
    if (!a) throw notFound('Agendamento não encontrado');
    if (a.sale_id) throw conflict('Este atendimento já possui venda registrada.');
    if (['cancelado', 'falta'].includes(a.status)) throw conflict('Atendimentos cancelados ou com falta não podem ser cobrados.');
    const input = saleSchema.parse({
      customer_id: a.customer_id, employee_id: a.employee_id, appointment_id: a.id,
      items: req.body?.items ?? [{ service_id: a.service_id, description: a.service_name ?? a.title ?? 'Atendimento', quantity: 1, unit_price: a.price }],
      discount: req.body?.discount ?? 0, payment_method: req.body?.payment_method, payment_status: req.body?.payment_status ?? 'pago', due_date: req.body?.due_date,
    });
    return createSale(db, ctx, { ...input, source: 'agendamento', source_id: a.id });
  });
  res.status(201).json({ data: sale });
}));

router.delete('/appointments/:id', h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  await tx(req, async (db, ctx) => {
    const a = (await db.query(`SELECT * FROM appointments WHERE company_id = $1 AND id = $2`, [ctx.companyId, req.params.id])).rows[0];
    if (!a) throw notFound('Agendamento não encontrado');
    if (a.sale_id) throw conflict('Atendimentos com venda registrada não podem ser excluídos. Cancele o agendamento para manter o histórico.');
    await db.query(`DELETE FROM appointments WHERE company_id = $1 AND id = $2`, [ctx.companyId, a.id]);
    await audit(db, ctx, 'excluiu', 'agendamento', a.id, 'Excluiu um agendamento');
  });
  res.json({ ok: true });
}));


export default router;
