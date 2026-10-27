import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, CalendarPlus, Check, CheckCheck, ChevronLeft, ChevronRight, Clock, Pencil, Receipt, Trash2, UserX } from 'lucide-react';
import { APPOINTMENT_STATUS, PAYMENT_METHODS, addDays, formatBRL, formatTime, todayIn, utcToZonedParts, zonedToUtcISO } from '@nexo/shared';
import { api, ApiError, qs } from '@/lib/api';
import { useCan, useTimezone } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, Dialog, EmptyState, EntitySelect, Field, Input, Menu, MoneyInput, NumberInput, PageHeader, Select, Sheet, StatusBadge, Textarea, useConfirm } from '@/components/ui';

type View = 'dia' | 'semana' | 'mes';
const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const weekday = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
const startOfWeek = (d: string) => addDays(d, -weekday(d));
const startOfMonth = (d: string) => d.slice(0, 8) + '01';
const endOfMonth = (d: string) => { const [y, m] = d.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const statusColor: Record<string, string> = { agendado: 'border-l-sky-500 bg-sky-50', confirmado: 'border-l-brand-600 bg-brand-50', concluido: 'border-l-emerald-600 bg-emerald-50/70', cancelado: 'border-l-ink-300 bg-ink-50 opacity-60', falta: 'border-l-red-500 bg-red-50' };

function AppointmentForm({ open, onOpenChange, initial, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; initial: any; onSaved: () => void }) {
  const tz = useTimezone();
  const can = useCan();
  const [v, setV] = useState<any>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    if (initial?.id) {
      const s = utcToZonedParts(initial.starts_at, tz);
      setV({ ...initial, date: s.date, time: s.time, duration: Math.round((Date.parse(initial.ends_at) - Date.parse(initial.starts_at)) / 60000) });
    } else setV({ date: initial?.date ?? todayIn(tz), time: initial?.time ?? '09:00', duration: 30, price: 0, status: 'agendado', customer_id: initial?.customer_id ?? null, employee_id: initial?.employee_id ?? null });
    setErrors({});
  }, [open, initial, tz]);
  const set = (patch: any) => setV((s: any) => ({ ...s, ...patch }));
  const { data: avail } = useQuery({
    queryKey: ['availability', v.date, v.employee_id, v.duration],
    queryFn: () => api.get<{ data: any }>(`/appointments/availability${qs({ date: v.date, employee_id: v.employee_id, duration: v.duration })}`).then((r) => r.data),
    enabled: open && !!v.date && !!v.employee_id && !initial?.id,
  });
  const slots: string[] = avail?.employees?.[0]?.slots ?? [];
  const save = useMutation({
    mutationFn: () => {
      const starts = zonedToUtcISO(v.date, v.time, tz);
      const ends = new Date(Date.parse(starts) + Number(v.duration) * 60000).toISOString();
      const body = { customer_id: v.customer_id || null, employee_id: v.employee_id || null, service_id: v.service_id || null, pet_id: v.pet_id || null, title: v.title || null,
        starts_at: starts, ends_at: ends, status: v.status, price: v.price ?? 0, notes: v.notes || null, canceled_reason: v.canceled_reason || null };
      return initial?.id ? api.put(`/appointments/${initial.id}`, body) : api.post('/appointments', body);
    },
    onSuccess: () => { toast.success(initial?.id ? 'Agendamento atualizado.' : 'Atendimento agendado.'); onSaved(); onOpenChange(false); },
    onError: (e) => { if (e instanceof ApiError && e.fields) setErrors(e.fields); toast.error(e.message); },
  });
  const submit = () => {
    const errs: Record<string, string> = {};
    if (!v.customer_id && !v.title) errs.customer_id = 'Selecione um cliente ou informe um título';
    if (!v.date) errs.date = 'Informe a data';
    if (!/^\d{2}:\d{2}$/.test(v.time ?? '')) errs.time = 'Informe o horário';
    if (!(Number(v.duration) >= 5)) errs.duration = 'Mínimo 5 minutos';
    setErrors(errs);
    if (!Object.keys(errs).length) save.mutate();
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={initial?.id ? 'Editar agendamento' : 'Novo agendamento'} description="O sistema impede dois atendimentos no mesmo horário para o mesmo profissional."
      footer={<><Button onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={save.isPending} onClick={submit}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cliente" className="sm:col-span-2" error={errors.customer_id}><EntitySelect endpoint="/customers/options" value={v.customer_id} onChange={(id) => set({ customer_id: id, pet_id: null })} invalid={!!errors.customer_id} /></Field>
        {can('animais') && v.customer_id && <Field label="Animal" className="sm:col-span-2"><EntitySelect endpoint={`/customers-lookup/${v.customer_id}/pets`} value={v.pet_id} onChange={(id) => set({ pet_id: id })} placeholder="Opcional" /></Field>}
        <Field label="Serviço" className="sm:col-span-2"><EntitySelect endpoint="/services/options" extraParams="active=1" value={v.service_id}
          onChange={(id, o) => set({ service_id: id, ...(o ? { duration: o.duration_minutes, price: o.price } : {}) })} placeholder="Selecione o serviço" /></Field>
        <Field label="Título (sem cliente)" className="sm:col-span-2" hint="Use para compromissos internos, ex.: reunião com fornecedor"><Input value={v.title ?? ''} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Profissional" className="sm:col-span-2"><EntitySelect endpoint="/staff/options" value={v.employee_id} onChange={(id) => set({ employee_id: id })} placeholder="Selecione o profissional" /></Field>
        <Field label="Data" required error={errors.date}><Input type="date" value={v.date ?? ''} onChange={(e) => set({ date: e.target.value })} /></Field>
        <Field label="Horário" required error={errors.time}><Input type="time" value={v.time ?? ''} onChange={(e) => set({ time: e.target.value })} step={300} /></Field>
        {!initial?.id && v.employee_id && (
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-medium text-ink-600">Horários livres{avail?.configured === false ? ' (expediente padrão 8h–18h — configure em Configurações)' : ''}</p>
            {avail?.closed ? <p className="text-xs text-ink-500">Fechado neste dia.</p> : slots.length ? (
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {slots.map((s) => { const t = formatTime(s, tz); return <button key={s} type="button" onClick={() => set({ time: t })} className={cn('rounded-md border px-2 py-1 text-xs tabular', v.time === t ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 hover:border-brand-400')}>{t}</button>; })}
              </div>) : <p className="text-xs text-ink-500">Nenhum horário livre para esta duração.</p>}
          </div>
        )}
        <Field label="Duração (min)" required error={errors.duration}><NumberInput value={v.duration} onChange={(d) => set({ duration: d })} step={5} /></Field>
        <Field label="Valor"><MoneyInput value={v.price} onChange={(p) => set({ price: p })} /></Field>
        <Field label="Situação"><Select value={v.status} onChange={(e) => set({ status: e.target.value })}>{Object.entries(APPOINTMENT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        {v.status === 'cancelado' && <Field label="Motivo do cancelamento"><Input value={v.canceled_reason ?? ''} onChange={(e) => set({ canceled_reason: e.target.value })} /></Field>}
        <Field label="Observações" className="sm:col-span-2"><Textarea value={v.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} rows={2} /></Field>
      </div>
    </Sheet>
  );
}

function CheckoutDialog({ appt, onClose }: { appt: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState('pix');
  const [status, setStatus] = useState('pago');
  const [price, setPrice] = useState<number>(appt?.price ?? 0);
  useEffect(() => setPrice(appt?.price ?? 0), [appt]);
  const go = useMutation({
    mutationFn: () => api.post(`/appointments/${appt.id}/checkout`, {
      payment_method: method, payment_status: method === 'a_prazo' ? 'pendente' : status,
      items: [{ service_id: appt.service_id, description: appt.service_name ?? appt.title ?? 'Atendimento', quantity: 1, unit_price: price }],
    }),
    onSuccess: () => { toast.success('Pagamento registrado e atendimento concluído.'); qc.invalidateQueries(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={!!appt} onOpenChange={(v) => !v && onClose()} title="Registrar pagamento" description="Conclui o atendimento e lança a venda e a receita no financeiro." size="sm"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={go.isPending} onClick={() => go.mutate()}>Confirmar {formatBRL(price)}</Button></>}>
      {appt && <div className="space-y-4">
        <p className="text-sm"><b>{appt.customer_name ?? appt.title}</b> · {appt.service_name ?? 'Atendimento'}</p>
        <Field label="Valor cobrado"><MoneyInput value={price} onChange={setPrice} /></Field>
        <Field label="Forma de pagamento"><Select value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(PAYMENT_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Situação"><Select value={method === 'a_prazo' ? 'pendente' : status} disabled={method === 'a_prazo'} onChange={(e) => setStatus(e.target.value)}><option value="pago">Recebido agora</option><option value="pendente">A receber</option></Select></Field>
      </div>}
    </Dialog>
  );
}

export default function Agenda() {
  const tz = useTimezone();
  const can = useCan();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [sp, setSp] = useSearchParams();
  const today = todayIn(tz);
  const view = (sp.get('view') as View) || 'dia';
  const date = sp.get('data') || today;
  const employee = sp.get('employee_id') || '';
  const statusF = sp.get('status') || '';
  const [form, setForm] = useState<{ open: boolean; initial: any }>({ open: false, initial: null });
  const [checkout, setCheckout] = useState<any>(null);
  const setParam = (patch: Record<string, string | null>) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };

  useEffect(() => { if (sp.get('novo') && can('agenda', 'write')) { setForm({ open: true, initial: { customer_id: sp.get('cliente') } }); setParam({ novo: null, cliente: null }); } }, []); // eslint-disable-line

  const range = view === 'dia' ? [date, date] : view === 'semana' ? [startOfWeek(date), addDays(startOfWeek(date), 6)] : [startOfWeek(startOfMonth(date)), addDays(startOfWeek(endOfMonth(date)), 6)];
  const { data, isFetching } = useQuery({
    queryKey: ['/appointments', range[0], range[1], employee, statusF, sp.get('service_id')],
    queryFn: () => api.get<{ data: any[] }>(`/appointments${qs({ from: range[0], to: range[1], employee_id: employee, status: statusF, service_id: sp.get('service_id') })}`).then((r) => r.data),
  });
  const appts = data ?? [];
  const byDay = useMemo(() => { const m: Record<string, any[]> = {}; for (const a of appts) (m[utcToZonedParts(a.starts_at, tz).date] ??= []).push(a); return m; }, [appts, tz]);
  const { data: staff } = useQuery({ queryKey: ['options', '/staff/options'], queryFn: () => api.get<{ data: any[] }>('/staff/options').then((r) => r.data) });

  const refresh = () => { qc.invalidateQueries({ queryKey: ['/appointments'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  const setStatus = async (a: any, status: string) => {
    if (status === 'cancelado' && !(await confirm({ title: 'Cancelar agendamento?', description: 'O horário será liberado na agenda.', confirmLabel: 'Cancelar agendamento' }))) return;
    try { await api.patch(`/appointments/${a.id}/status`, { status }); toast.success(`Marcado como ${APPOINTMENT_STATUS[status as keyof typeof APPOINTMENT_STATUS].toLowerCase()}.`); refresh(); } catch (e: any) { toast.error(e.message); }
  };
  const remove = async (a: any) => {
    if (!(await confirm({ title: 'Excluir agendamento?', description: 'Prefira "Cancelar" para manter o histórico. A exclusão é definitiva.', confirmLabel: 'Excluir' }))) return;
    try { await api.del(`/appointments/${a.id}`); toast.success('Agendamento excluído.'); refresh(); } catch (e: any) { toast.error(e.message); }
  };
  const move = (dir: number) => setParam({ data: view === 'dia' ? addDays(date, dir) : view === 'semana' ? addDays(date, 7 * dir) : (() => { const [y, m] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 10); })() });
  const title = view === 'dia' ? new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'))
    : view === 'semana' ? `${range[0].split('-').reverse().slice(0, 2).join('/')} a ${range[1].split('-').reverse().slice(0, 2).join('/')}` : `${MONTHS[Number(date.slice(5, 7)) - 1]} de ${date.slice(0, 4)}`;

  const AppointmentCard = ({ a, compact }: { a: any; compact?: boolean }) => (
    <div className={cn('group rounded-lg border border-l-4 border-ink-200 p-2.5 text-left', statusColor[a.status])}>
      <div className="flex items-start justify-between gap-1">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => can('agenda', 'write') && setForm({ open: true, initial: a })}>
          <p className="text-xs font-bold tabular text-ink-700">{formatTime(a.starts_at, tz)}–{formatTime(a.ends_at, tz)}</p>
          <p className="truncate text-sm font-semibold text-ink-900">{a.customer_name ?? a.title ?? 'Sem cliente'}{a.pet_name ? ` · ${a.pet_name}` : ''}</p>
          {!compact && <p className="truncate text-xs text-ink-600">{[a.service_name, a.employee_name].filter(Boolean).join(' · ')}</p>}
        </button>
        {can('agenda', 'write') && <Menu items={[
          a.status === 'agendado' && { label: 'Confirmar', icon: <Check className="size-4" />, onSelect: () => setStatus(a, 'confirmado') },
          !a.sale_id && ['agendado', 'confirmado'].includes(a.status) && can('vendas', 'write') && { label: 'Registrar pagamento', icon: <Receipt className="size-4" />, onSelect: () => setCheckout(a) },
          !a.sale_id && ['agendado', 'confirmado'].includes(a.status) && { label: 'Concluir sem cobrança', icon: <CheckCheck className="size-4" />, onSelect: () => setStatus(a, 'concluido') },
          ['agendado', 'confirmado'].includes(a.status) && { label: 'Marcar falta', icon: <UserX className="size-4" />, onSelect: () => setStatus(a, 'falta') },
          !a.sale_id && ['agendado', 'confirmado'].includes(a.status) && { label: 'Cancelar', icon: <Ban className="size-4" />, onSelect: () => setStatus(a, 'cancelado') },
          ['cancelado', 'falta'].includes(a.status) && { label: 'Reativar', icon: <Clock className="size-4" />, onSelect: () => setStatus(a, 'agendado') },
          { label: 'Editar', icon: <Pencil className="size-4" />, onSelect: () => setForm({ open: true, initial: a }) },
          !a.sale_id && { label: 'Excluir', icon: <Trash2 className="size-4" />, danger: true, onSelect: () => remove(a) },
        ]} />}
      </div>
      {!compact && <div className="mt-1.5 flex flex-wrap items-center gap-1"><StatusBadge status={a.status} labels={APPOINTMENT_STATUS} />{a.sale_number && <Badge tone="success">Pago · venda #{a.sale_number}</Badge>}{a.price > 0 && !a.sale_number && <span className="text-xs text-ink-500">{formatBRL(a.price)}</span>}</div>}
    </div>
  );

  return (
    <div>
      <PageHeader title="Agenda" description="Atendimentos por dia, semana e mês, com controle de conflitos."
        help={<><p>Use <b>Confirmar</b> após falar com o cliente; atendimentos ainda “agendados” nas próximas 48h geram alerta.</p><p><b>Registrar pagamento</b> conclui o atendimento e lança a venda e a receita automaticamente.</p><p>Configure o horário de funcionamento em Configurações para calcular horários livres.</p></>}
        actions={can('agenda', 'write') && <Button variant="primary" icon={<CalendarPlus className="size-4" />} onClick={() => setForm({ open: true, initial: { date } })}>Agendar</Button>} />
      <Card className="mb-4 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => move(-1)} aria-label="Anterior"><ChevronLeft className="size-4" /></Button>
          <Button size="sm" onClick={() => setParam({ data: today })}>Hoje</Button>
          <Button size="icon" variant="ghost" onClick={() => move(1)} aria-label="Próximo"><ChevronRight className="size-4" /></Button>
          <h2 className="ml-2 font-display text-lg font-bold capitalize">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <Select value={employee} onChange={(e) => setParam({ employee_id: e.target.value })} className="w-44" aria-label="Profissional"><option value="">Todos os profissionais</option>{staff?.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
          <Select value={statusF} onChange={(e) => setParam({ status: e.target.value })} className="w-40" aria-label="Situação"><option value="">Todas as situações</option>{Object.entries(APPOINTMENT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}<option value="cancelado,falta">Cancelados e faltas</option></Select>
          <div className="flex rounded-lg bg-ink-100 p-1" role="tablist" aria-label="Visualização">
            {(['dia', 'semana', 'mes'] as View[]).map((vv) => <button key={vv} role="tab" aria-selected={view === vv} onClick={() => setParam({ view: vv })} className={cn('rounded-md px-3 py-1 text-sm font-medium capitalize', view === vv ? 'bg-white shadow-card' : 'text-ink-500')}>{vv === 'mes' ? 'Mês' : vv}</button>)}
          </div>
        </div>
      </Card>

      <div className={cn(isFetching && 'opacity-70 transition-opacity')}>
        {view === 'dia' && (
          <Card className="p-4">
            {(byDay[date] ?? []).length ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{byDay[date].map((a) => <AppointmentCard key={a.id} a={a} />)}</div>
            ) : <EmptyState title="Nenhum atendimento neste dia" description="Agende um horário para começar." action={can('agenda', 'write') ? <Button variant="primary" onClick={() => setForm({ open: true, initial: { date } })}>Agendar</Button> : undefined} />}
          </Card>
        )}
        {view === 'semana' && (
          <div className="grid gap-2 md:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => {
              const d = addDays(range[0], i);
              return (
                <Card key={d} className={cn('min-h-40 p-2', d === today && 'ring-2 ring-brand-500/40')}>
                  <button type="button" onClick={() => setParam({ view: 'dia', data: d })} className="mb-2 flex w-full items-baseline justify-between px-1">
                    <span className="text-xs font-semibold uppercase text-ink-500">{WEEK[i]}</span><span className={cn('font-display text-lg font-bold', d === today && 'text-brand-700')}>{d.slice(8)}</span>
                  </button>
                  <div className="space-y-1.5">{(byDay[d] ?? []).map((a) => <AppointmentCard key={a.id} a={a} compact />)}</div>
                  {can('agenda', 'write') && <button type="button" onClick={() => setForm({ open: true, initial: { date: d } })} className="mt-1.5 w-full rounded-md py-1 text-xs text-ink-400 hover:bg-ink-50 hover:text-brand-700">+ agendar</button>}
                </Card>
              );
            })}
          </div>
        )}
        {view === 'mes' && (
          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-ink-100 bg-ink-50 text-center text-xs font-semibold uppercase text-ink-500">{WEEK.map((w) => <div key={w} className="py-2">{w}</div>)}</div>
            <div className="grid grid-cols-7">
              {Array.from({ length: Math.round((Date.parse(range[1]) - Date.parse(range[0])) / 86400000) + 1 }).map((_, i) => {
                const d = addDays(range[0], i);
                const list = byDay[d] ?? [];
                const inMonth = d.slice(0, 7) === date.slice(0, 7);
                return (
                  <button key={d} type="button" onClick={() => setParam({ view: 'dia', data: d })} className={cn('min-h-20 border-b border-r border-ink-100 p-1.5 text-left hover:bg-brand-50/40 sm:min-h-24', !inMonth && 'bg-ink-50/60 text-ink-400')}>
                    <span className={cn('inline-grid size-6 place-items-center rounded-full text-xs font-semibold', d === today && 'bg-brand-700 text-white')}>{Number(d.slice(8))}</span>
                    {list.length > 0 && <div className="mt-1 space-y-0.5">
                      {list.slice(0, 2).map((a) => <p key={a.id} className="hidden truncate rounded bg-brand-50 px-1 text-[11px] text-brand-900 sm:block">{formatTime(a.starts_at, tz)} {a.customer_name ?? a.title}</p>)}
                      <p className="text-[11px] font-medium text-brand-700">{list.length} {list.length === 1 ? 'atend.' : 'atends.'}</p>
                    </div>}
                  </button>
                );
              })}
            </div>
          </Card>
        )}
      </div>
      <AppointmentForm open={form.open} onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))} initial={form.initial} onSaved={refresh} />
      <CheckoutDialog appt={checkout} onClose={() => setCheckout(null)} />
    </div>
  );
}
