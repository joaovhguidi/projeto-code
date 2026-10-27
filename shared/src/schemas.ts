import { z } from 'zod';
import * as L from './labels';
import { MODULE_KEYS } from './modules';
import { ROLES } from './permissions';

// ---------------------------------------------------------------------------
// Blocos reutilizáveis. Campos vazios vindos de formulários viram null.
// ---------------------------------------------------------------------------
const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const emptyToUndef = (v: unknown) => (v === '' || v === null ? undefined : v);

export const text = (max = 200, min = 0) =>
  z.preprocess(emptyToNull, z.string().trim().min(min, 'Campo obrigatório').max(max, `Máximo de ${max} caracteres`).nullable().optional());
export const requiredText = (max = 200, min = 2) =>
  z.string({ required_error: 'Campo obrigatório', invalid_type_error: 'Campo obrigatório' })
    .trim().min(min, min <= 1 ? 'Campo obrigatório' : `Informe ao menos ${min} caracteres`).max(max, `Máximo de ${max} caracteres`);
export const id = z.string().uuid('Identificador inválido');
export const optionalId = z.preprocess(emptyToNull, id.nullable().optional());
export const enumOf = <T extends Record<string, string>>(labels: T, msg = 'Opção inválida') =>
  z.enum(L.enumKeys(labels as Record<keyof T & string, string>), { errorMap: () => ({ message: msg }) });

const decimal = (places: number) => (v: number) => Math.abs(Math.round(v * 10 ** places) - v * 10 ** places) < 1e-6;
export const money = z.preprocess(
  (v) => (typeof v === 'string' ? Number(v.replace(/\./g, '').replace(',', '.')) : v),
  z.number({ invalid_type_error: 'Informe um valor' }).finite().min(0, 'O valor não pode ser negativo').max(9_999_999_999, 'Valor muito alto')
    .refine(decimal(2), 'Use no máximo 2 casas decimais'),
);
export const positiveMoney = money.refine((v) => v > 0, 'O valor deve ser maior que zero');
export const quantity = z.preprocess(
  (v) => (typeof v === 'string' ? Number(v.replace(',', '.')) : v),
  z.number({ invalid_type_error: 'Informe a quantidade' }).finite().max(9_999_999).refine(decimal(3), 'Use no máximo 3 casas decimais'),
);
export const positiveQty = quantity.refine((v) => v > 0, 'A quantidade deve ser maior que zero');
export const intOpt = (min: number, max: number) =>
  z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().int('Use um número inteiro').min(min, `Mínimo ${min}`).max(max, `Máximo ${max}`).nullable().optional());

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const date = z.string({ required_error: 'Informe a data' }).regex(DATE_RE, 'Data inválida')
  .refine((s) => !Number.isNaN(Date.parse(s + 'T00:00:00Z')), 'Data inválida');
export const optionalDate = z.preprocess(emptyToNull, date.nullable().optional());
export const dateTime = z.string({ required_error: 'Informe data e hora' }).refine((s) => !Number.isNaN(Date.parse(s)), 'Data/hora inválida');
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Horário inválido');
export const optionalTime = z.preprocess(emptyToNull, time.nullable().optional());
export const email = z.string().trim().toLowerCase().email('E-mail inválido').max(160);
export const optionalEmail = z.preprocess(emptyToNull, email.nullable().optional());
export const phone = z.preprocess(emptyToNull, z.string().trim()
  .refine((s) => { const d = s.replace(/\D/g, ''); return d.length >= 10 && d.length <= 13; }, 'Telefone inválido (inclua o DDD)')
  .nullable().optional());
export const bool = z.preprocess((v) => v === 'true' || v === true || v === 'on' ? true : v === 'false' || v === false || v === '' || v == null ? false : v, z.boolean());
export const rating = intOpt(1, 5);

// ---------------------------------------------------------------------------
// CPF / CNPJ
// ---------------------------------------------------------------------------
export function isValidCPF(value: string) {
  const c = value.replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
}
export function isValidCNPJ(value: string) {
  const c = value.replace(/\D/g, '');
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(c[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}
export const documentNumber = z.preprocess(emptyToNull, z.string().trim()
  .refine((s) => { const d = s.replace(/\D/g, ''); return d.length === 11 ? isValidCPF(d) : d.length === 14 ? isValidCNPJ(d) : false; }, 'CPF ou CNPJ inválido')
  .nullable().optional());

// ---------------------------------------------------------------------------
// Autenticação e empresa
// ---------------------------------------------------------------------------
export const password = z.string().min(8, 'A senha deve ter ao menos 8 caracteres').max(128)
  .refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), 'Use letras e números na senha');

export const registerSchema = z.object({
  name: requiredText(120),
  email,
  password,
  phone,
});
export const loginSchema = z.object({ email, password: z.string().min(1, 'Informe a senha') });
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({ token: z.string().min(20), password });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1, 'Informe a senha atual'), newPassword: password });

export const companySchema = z.object({
  name: requiredText(120),
  document: documentNumber,
  phone,
  email: optionalEmail,
  city: text(80),
  state: z.preprocess(emptyToNull, z.enum(L.UF, { errorMap: () => ({ message: 'UF inválida' }) }).nullable().optional()),
  segment_key: z.string().regex(/^[a-z0-9_]+$/, 'Selecione um segmento'),
  custom_segment: text(160),
  description: text(1000),
  employees_range: z.preprocess(emptyToNull, enumOf(L.EMPLOYEE_RANGES).nullable().optional()),
  main_offerings: text(1000),
  goals: z.array(enumOf(L.GOALS)).max(10).default([]),
  difficulties: z.array(enumOf(L.DIFFICULTIES)).max(12).default([]),
  timezone: z.string().max(60).default('America/Sao_Paulo'),
  priority_modules: z.array(z.enum(MODULE_KEYS)).max(10).optional(),
});
export const onboardingSchema = companySchema.superRefine((v, ctx) => {
  if (v.segment_key === 'outro') {
    if (!v.custom_segment) ctx.addIssue({ code: 'custom', path: ['custom_segment'], message: 'Descreva a sua atividade' });
    if (!v.priority_modules || v.priority_modules.length < 2)
      ctx.addIssue({ code: 'custom', path: ['priority_modules'], message: 'Escolha ao menos 2 módulos prioritários' });
  }
});

export const preferencesSchema = z.object({
  priorityModules: z.array(z.enum(MODULE_KEYS)).max(10).optional(),
  favorites: z.array(z.enum(MODULE_KEYS)).max(8).optional(),
  cardOrder: z.array(z.string().max(40)).max(20).optional(),
  hiddenCards: z.array(z.string().max(40)).max(20).optional(),
  kpis: z.array(z.string().max(60)).max(12).optional(),
});

export const memberCreateSchema = z.object({
  name: requiredText(120),
  email,
  password,
  role: z.enum(ROLES),
  employee_id: optionalId,
});
export const memberUpdateSchema = z.object({
  role: z.enum(ROLES),
  active: bool,
  employee_id: optionalId,
});

// ---------------------------------------------------------------------------
// Cadastros
// ---------------------------------------------------------------------------
export const customerSchema = z.object({
  name: requiredText(120),
  phone, whatsapp: phone,
  email: optionalEmail,
  document: documentNumber,
  birth_date: optionalDate,
  address: text(300),
  relationship: enumOf(L.CUSTOMER_RELATIONSHIP).default('ativo'),
  notes: text(2000),
});

export const petSchema = z.object({
  customer_id: id,
  name: requiredText(80, 1),
  species: enumOf(L.PET_SPECIES).default('cachorro'),
  breed: text(80),
  size: z.preprocess(emptyToNull, enumOf(L.PET_SIZE).nullable().optional()),
  birth_date: optionalDate,
  weight_kg: z.preprocess(emptyToNull, quantity.nullable().optional()),
  allergies: text(500),
  next_return: optionalDate,
  notes: text(2000),
});

export const vehicleSchema = z.object({
  customer_id: id,
  plate: z.string().trim().toUpperCase().regex(/^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/, 'Placa inválida (ex.: ABC1D23)'),
  brand: text(60),
  model: requiredText(80, 1),
  year: intOpt(1900, 2100),
  color: text(40),
  mileage: intOpt(0, 5_000_000),
  notes: text(2000),
});

export const employeeSchema = z.object({
  name: requiredText(120),
  role_title: text(80),
  responsibilities: text(1000),
  phone,
  email: optionalEmail,
  document: documentNumber,
  hire_date: optionalDate,
  work_schedule: text(300),
  color: z.preprocess(emptyToUndef, z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida').default('#0E9670')),
  status: enumOf(L.EMPLOYEE_STATUS).default('ativo'),
  notes: text(2000),
});

export const trainingSchema = z.object({
  employee_id: id,
  title: requiredText(160),
  kind: enumOf(L.TRAINING_KIND).default('treinamento'),
  completed_on: optionalDate,
  expires_on: optionalDate,
  notes: text(1000),
});

export const serviceSchema = z.object({
  name: requiredText(120),
  description: text(1000),
  category: text(80),
  duration_minutes: z.preprocess((v) => Number(v), z.number().int().min(5, 'Mínimo de 5 minutos').max(1440)),
  price: money,
  estimated_cost: money.default(0),
  active: bool.default(true),
});

export const supplierSchema = z.object({
  name: requiredText(120),
  contact_name: text(120),
  phone,
  email: optionalEmail,
  document: documentNumber,
  category: text(80),
  address: text(300),
  products_supplied: text(1000),
  lead_time_days: intOpt(0, 365),
  quality_rating: rating,
  reliability_rating: rating,
  notes: text(2000),
});

export const supplierQuoteSchema = z.object({
  supplier_id: id,
  product_id: optionalId,
  description: requiredText(200),
  price: money,
  quoted_on: date,
  valid_until: optionalDate,
  notes: text(1000),
});

export const productSchema = z.object({
  sku: text(60),
  barcode: text(60),
  name: requiredText(160, 1),
  category: text(80),
  unit: z.preprocess(emptyToUndef, z.string().trim().max(10).default('un')),
  supplier_id: optionalId,
  cost_price: money,
  sale_price: money,
  min_stock: quantity.refine((v) => v >= 0, 'Não pode ser negativo').default(0),
  initial_stock: quantity.refine((v) => v >= 0, 'Não pode ser negativo').optional(),
  track_expiry: bool.default(false),
  expiry_date: optionalDate,
  active: bool.default(true),
  notes: text(2000),
});

export const stockMovementSchema = z.object({
  product_id: id,
  type: z.enum(['entrada', 'saida', 'ajuste']),
  quantity: quantity, // entrada/saída: positiva; ajuste: novo saldo
  unit_cost: z.preprocess(emptyToNull, money.nullable().optional()),
  reason: text(300),
}).superRefine((v, ctx) => {
  if (v.type !== 'ajuste' && v.quantity <= 0) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'A quantidade deve ser maior que zero' });
  if (v.type === 'ajuste' && v.quantity < 0) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'O saldo não pode ser negativo' });
  if (v.type === 'ajuste' && !v.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Informe o motivo do ajuste' });
});

// ---------------------------------------------------------------------------
// Financeiro
// ---------------------------------------------------------------------------
export const financeCategorySchema = z.object({
  name: requiredText(60),
  kind: enumOf(L.TX_KIND),
});

export const transactionSchema = z.object({
  kind: enumOf(L.TX_KIND),
  description: requiredText(200),
  category_id: optionalId,
  amount: positiveMoney,
  competence_date: date,
  due_date: date,
  payment_method: z.preprocess(emptyToNull, enumOf(L.PAYMENT_METHODS).nullable().optional()),
  customer_id: optionalId,
  supplier_id: optionalId,
  notes: text(1000),
  /** quando informado, registra o pagamento integral na criação */
  paid_on: optionalDate,
  installments: intOpt(1, 48),
});

export const paymentSchema = z.object({
  amount: positiveMoney,
  paid_on: date,
  method: z.preprocess(emptyToNull, enumOf(L.PAYMENT_METHODS).nullable().optional()),
  notes: text(300),
});

export const collectionContactSchema = z.object({
  channel: enumOf(L.COLLECTION_CHANNEL),
  outcome: enumOf(L.COLLECTION_OUTCOME),
  promised_date: optionalDate,
  notes: text(1000),
});

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------
export const appointmentSchema = z.object({
  customer_id: optionalId,
  employee_id: optionalId,
  service_id: optionalId,
  pet_id: optionalId,
  title: text(160),
  starts_at: dateTime,
  ends_at: dateTime,
  status: enumOf(L.APPOINTMENT_STATUS).default('agendado'),
  price: money.default(0),
  notes: text(1000),
  canceled_reason: text(300),
}).refine((v) => Date.parse(v.ends_at) > Date.parse(v.starts_at), { path: ['ends_at'], message: 'O término deve ser depois do início' })
  .refine((v) => v.customer_id || v.title, { path: ['customer_id'], message: 'Selecione um cliente ou informe um título' });

// ---------------------------------------------------------------------------
// Vendas, orçamentos e OS
// ---------------------------------------------------------------------------
export const saleItemSchema = z.object({
  product_id: optionalId,
  service_id: optionalId,
  description: requiredText(200, 1),
  quantity: positiveQty,
  unit_price: money,
  discount: money.default(0),
}).refine((v) => !(v.product_id && v.service_id), { message: 'Item não pode ser produto e serviço ao mesmo tempo' });

export const saleSchema = z.object({
  customer_id: optionalId,
  employee_id: optionalId,
  sold_at: z.preprocess(emptyToUndef, dateTime.optional()),
  items: z.array(saleItemSchema).min(1, 'Adicione ao menos um item').max(200),
  discount: money.default(0),
  payment_method: enumOf(L.PAYMENT_METHODS, 'Selecione a forma de pagamento'),
  payment_status: z.enum(['pago', 'pendente']).default('pago'),
  due_date: optionalDate,
  notes: text(1000),
  appointment_id: optionalId,
  allow_negative_stock: bool.default(false),
});
export const saleCancelSchema = z.object({ reason: requiredText(300, 3) });

export const quoteItemSchema = z.object({
  kind: enumOf(L.ITEM_KIND),
  product_id: optionalId,
  service_id: optionalId,
  description: requiredText(200, 1),
  quantity: positiveQty,
  unit_cost: money.default(0),
  unit_price: money,
  discount: money.default(0),
});
export const quoteSchema = z.object({
  customer_id: optionalId,
  title: requiredText(160),
  issued_on: date,
  valid_until: date,
  discount: money.default(0),
  estimated_hours: z.preprocess(emptyToNull, quantity.nullable().optional()),
  terms: text(3000),
  notes: text(2000),
  items: z.array(quoteItemSchema).min(1, 'Adicione ao menos um item').max(200),
}).refine((v) => v.valid_until >= v.issued_on, { path: ['valid_until'], message: 'A validade deve ser igual ou posterior à emissão' });
export const quoteStatusSchema = z.object({ status: z.enum(['rascunho', 'enviado', 'aprovado', 'recusado']) });
export const quoteConvertSchema = z.object({
  target: z.enum(['venda', 'ordem_servico']),
  payment_method: z.preprocess(emptyToNull, enumOf(L.PAYMENT_METHODS).nullable().optional()),
  payment_status: z.enum(['pago', 'pendente']).default('pendente'),
  due_date: optionalDate,
});

export const workOrderSchema = z.object({
  customer_id: optionalId,
  vehicle_id: optionalId,
  employee_id: optionalId,
  title: requiredText(160),
  problem: text(3000),
  diagnosis: text(3000),
  status: enumOf(L.WORK_ORDER_STATUS).default('aberta'),
  opened_on: date,
  due_date: optionalDate,
  estimated_hours: z.preprocess(emptyToNull, quantity.nullable().optional()),
  actual_hours: z.preprocess(emptyToNull, quantity.nullable().optional()),
  notes: text(2000),
  items: z.array(quoteItemSchema).max(200).default([]),
});
export const workOrderInvoiceSchema = z.object({
  payment_method: enumOf(L.PAYMENT_METHODS, 'Selecione a forma de pagamento'),
  payment_status: z.enum(['pago', 'pendente']).default('pago'),
  due_date: optionalDate,
});

// ---------------------------------------------------------------------------
// Compras
// ---------------------------------------------------------------------------
export const purchaseSchema = z.object({
  supplier_id: id,
  ordered_on: date,
  expected_on: optionalDate,
  notes: text(1000),
  items: z.array(z.object({
    product_id: optionalId,
    description: requiredText(200, 1),
    quantity: positiveQty,
    unit_cost: money,
  })).min(1, 'Adicione ao menos um item'),
});
export const purchaseReceiveSchema = z.object({
  received_on: date,
  due_date: date,
  payment_method: z.preprocess(emptyToNull, enumOf(L.PAYMENT_METHODS).nullable().optional()),
  paid: bool.default(false),
});

// ---------------------------------------------------------------------------
// Tarefas, entregas, escalas
// ---------------------------------------------------------------------------
export const taskSchema = z.object({
  title: requiredText(160),
  description: text(4000),
  assignee_id: optionalId,
  priority: enumOf(L.PRIORITY).default('media'),
  status: enumOf(L.TASK_STATUS).default('pendente'),
  start_date: optionalDate,
  due_date: optionalDate,
  project: text(80),
}).refine((v) => !v.start_date || !v.due_date || v.due_date >= v.start_date, { path: ['due_date'], message: 'O prazo deve ser igual ou posterior ao início' });
export const commentSchema = z.object({ body: requiredText(2000, 1) });

export const deliverySchema = z.object({
  customer_id: optionalId,
  sale_id: optionalId,
  recipient_name: requiredText(120),
  recipient_phone: phone,
  address: requiredText(300, 5),
  neighborhood: text(80),
  description: text(1000),
  courier_id: optionalId,
  scheduled_for: dateTime,
  fee: money.default(0),
  cost: money.default(0),
  distance_km: z.preprocess(emptyToNull, quantity.nullable().optional()),
  notes: text(1000),
});
export const deliveryStatusSchema = z.object({ status: enumOf(L.DELIVERY_STATUS), note: text(500) });
export const deliveryOccurrenceSchema = z.object({ note: requiredText(500, 3) });

export const shiftSchema = z.object({
  employee_id: id,
  date,
  kind: enumOf(L.SHIFT_KIND).default('turno'),
  start_time: optionalTime,
  end_time: optionalTime,
  notes: text(300),
}).superRefine((v, ctx) => {
  if (v.kind === 'turno') {
    if (!v.start_time) ctx.addIssue({ code: 'custom', path: ['start_time'], message: 'Informe o início' });
    if (!v.end_time) ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'Informe o término' });
    if (v.start_time && v.end_time && v.end_time <= v.start_time) ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'O término deve ser depois do início' });
  }
});
export const swapRequestSchema = z.object({
  shift_id: id,
  requester_id: id,
  target_employee_id: optionalId,
  reason: requiredText(500, 3),
});
export const swapDecisionSchema = z.object({ status: z.enum(['aprovada', 'recusada']) });

// ---------------------------------------------------------------------------
// Manutenção, desperdícios, avaliações, fidelização, documentos, solicitações
// ---------------------------------------------------------------------------
export const equipmentSchema = z.object({
  name: requiredText(120),
  category: text(80), brand: text(80), model: text(80), serial: text(80), location: text(120),
  purchase_date: optionalDate,
  status: enumOf(L.EQUIPMENT_STATUS).default('operando'),
  preventive_interval_days: intOpt(1, 3650),
  next_preventive_on: optionalDate,
  notes: text(2000),
});
export const maintenanceSchema = z.object({
  equipment_id: id,
  type: enumOf(L.MAINTENANCE_TYPE).default('corretiva'),
  problem: requiredText(1000, 3),
  solution: text(2000),
  scheduled_on: optionalDate,
  completed_on: optionalDate,
  responsible: text(120),
  supplier_id: optionalId,
  status: enumOf(L.MAINTENANCE_STATUS).default('aberta'),
  cost: money.default(0),
  register_expense: bool.default(false),
  notes: text(2000),
});

export const wasteSchema = z.object({
  product_id: optionalId,
  description: requiredText(200, 2),
  quantity: positiveQty,
  unit: z.preprocess(emptyToUndef, z.string().trim().max(10).default('un')),
  unit_cost: money.default(0),
  reason: enumOf(L.WASTE_REASON),
  occurred_on: date,
  deduct_stock: bool.default(true),
  notes: text(1000),
});

export const feedbackSchema = z.object({
  customer_id: optionalId,
  type: enumOf(L.FEEDBACK_TYPE),
  rating,
  channel: text(60),
  title: requiredText(160),
  description: text(3000),
  responsible_id: optionalId,
  status: enumOf(L.FEEDBACK_STATUS).default('aberta'),
  due_date: optionalDate,
  received_on: date,
});
export const feedbackActionSchema = z.object({ description: requiredText(1000, 3) });

export const campaignSchema = z.object({
  name: requiredText(120),
  goal: text(500),
  audience: enumOf(L.CAMPAIGN_AUDIENCE).default('todos'),
  channel: text(60),
  offer: text(500),
  start_date: date,
  end_date: optionalDate,
  status: enumOf(L.CAMPAIGN_STATUS).default('planejada'),
}).refine((v) => !v.end_date || v.end_date >= v.start_date, { path: ['end_date'], message: 'O término deve ser igual ou posterior ao início' });
export const customerContactSchema = z.object({
  customer_id: id,
  campaign_id: optionalId,
  contacted_on: date,
  channel: enumOf(L.CONTACT_CHANNEL),
  outcome: enumOf(L.CONTACT_OUTCOME).default('sem_resposta'),
  returned_on: optionalDate,
  notes: text(1000),
});

export const documentSchema = z.object({
  title: requiredText(160),
  category: enumOf(L.DOCUMENT_CATEGORY).default('outros'),
  description: text(2000),
  issued_on: optionalDate,
  expires_on: optionalDate,
  responsible: text(120),
  restricted: bool.default(true),
});

export const issueSchema = z.object({
  title: requiredText(160),
  category: enumOf(L.ISSUE_CATEGORY),
  description: text(3000),
  priority: enumOf(L.PRIORITY).default('media'),
  responsible_id: optionalId,
  status: enumOf(L.ISSUE_STATUS).default('aberta'),
  due_date: optionalDate,
  equipment_id: optionalId,
});
export const issueUpdateSchema = z.object({ body: requiredText(2000, 2), status: z.preprocess(emptyToNull, enumOf(L.ISSUE_STATUS).nullable().optional()) });

export const tipActionSchema = z.object({
  key: z.string().max(80),
  fingerprint: z.string().max(200),
  title: z.string().max(300),
  status: z.enum(['concluida', 'dispensada']),
});

export type Infer<T extends z.ZodTypeAny> = z.infer<T>;
