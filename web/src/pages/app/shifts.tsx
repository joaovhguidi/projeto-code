import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeftRight, ChevronLeft, ChevronRight, Copy, Plus } from 'lucide-react';
import { SHIFT_KIND, SWAP_STATUS, addDays, shiftSchema, swapRequestSchema, todayIn } from '@nexo/shared';
import { api, qs } from '@/lib/api';
import { useCan, useTimezone } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Avatar, Button, Card, CardHeader, EmptyState, PageHeader, StatusBadge, Menu, useConfirm } from '@/components/ui';
import { FormSheet } from '@/components/form/form';

const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export default function Shifts() {
  const tz = useTimezone();
  const can = useCan();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const today = todayIn(tz);
  const [start, setStart] = useState(addDays(today, -new Date(today + 'T12:00:00Z').getUTCDay()));
  const [form, setForm] = useState<any>(null);
  const [swap, setSwap] = useState<any>(null);
  const end = addDays(start, 6);
  const { data } = useQuery({ queryKey: ['/shifts', start], queryFn: () => api.get<{ data: any }>(`/shifts${qs({ from: start, to: end })}`).then((r) => r.data) });
  const { data: staff } = useQuery({ queryKey: ['options', '/staff/options'], queryFn: () => api.get<{ data: any[] }>('/staff/options').then((r) => r.data) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['/shifts'] });
  const w = can('escalas', 'write');
  const save = async (v: any) => { if (form?.id) await api.put(`/shifts/${form.id}`, v); else await api.post('/shifts', v); toast.success('Escala salva.'); setForm(null); refresh(); };
  return (
    <div>
      <PageHeader title="Escalas" description="Turnos, folgas e trocas da semana. O sistema impede turnos sobrepostos para a mesma pessoa."
        actions={w && <><Button icon={<Copy className="size-4" />} onClick={async () => { try { const r = await api.post('/shifts/copy-week', { from: start }); toast.success(`${r.data.created} lançamentos copiados para a próxima semana${r.data.skipped ? ` (${r.data.skipped} ignorados por já existirem)` : ''}.`); setStart(addDays(start, 7)); } catch (e: any) { toast.error(e.message); } }}>Copiar para próxima semana</Button>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setForm({ date: today, kind: 'turno', start_time: '08:00', end_time: '17:00' })}>Lançar turno/folga</Button></>} />
      <Card className="mb-4 flex items-center gap-2 p-3">
        <Button size="icon" variant="ghost" onClick={() => setStart(addDays(start, -7))} aria-label="Semana anterior"><ChevronLeft className="size-4" /></Button>
        <span className="font-display font-bold">{start.split('-').reverse().join('/')} a {end.split('-').reverse().join('/')}</span>
        <Button size="icon" variant="ghost" onClick={() => setStart(addDays(start, 7))} aria-label="Próxima semana"><ChevronRight className="size-4" /></Button>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-ink-100 bg-ink-50"><th className="p-2 text-left text-xs uppercase text-ink-500">Colaborador</th>{WEEK.map((d, i) => <th key={d} className={cn('p-2 text-xs uppercase text-ink-500', addDays(start, i) === today && 'text-brand-700')}>{d} {addDays(start, i).slice(8)}</th>)}</tr></thead>
          <tbody className="divide-y divide-ink-100">
            {(staff ?? []).map((e: any) => (
              <tr key={e.id}>
                <td className="p-2"><span className="flex items-center gap-2"><Avatar name={e.label} color={e.color} size={24} />{e.label}</span></td>
                {Array.from({ length: 7 }).map((_, i) => {
                  const d = addDays(start, i);
                  const list = (data?.shifts ?? []).filter((s: any) => s.employee_id === e.id && s.date === d);
                  return (
                    <td key={d} className="p-1 align-top">
                      {list.map((s: any) => (
                        <div key={s.id} className={cn('mb-1 flex items-center justify-between rounded-md px-1.5 py-1 text-xs', s.kind === 'turno' ? 'bg-brand-50 text-brand-900' : 'bg-ink-100 text-ink-600')}>
                          <span>{s.kind === 'turno' ? `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}` : SHIFT_KIND[s.kind as keyof typeof SHIFT_KIND]}</span>
                          {w && <Menu items={[{ label: 'Editar', onSelect: () => setForm({ ...s, start_time: s.start_time?.slice(0, 5), end_time: s.end_time?.slice(0, 5) }) },
                            s.kind === 'turno' && { label: 'Solicitar troca', icon: <ArrowLeftRight className="size-4" />, onSelect: () => setSwap({ shift_id: s.id, requester_id: s.employee_id }) },
                            { label: 'Excluir', danger: true, onSelect: async () => { if (await confirm({ title: 'Remover lançamento?', confirmLabel: 'Remover' })) { await api.del(`/shifts/${s.id}`); refresh(); } } }]}
                            trigger={<button type="button" className="rounded px-1 text-ink-400 hover:text-ink-800" aria-label="Ações">⋯</button>} />}
                        </div>))}
                      {w && !list.length && <button type="button" onClick={() => setForm({ employee_id: e.id, date: d, kind: 'turno', start_time: '08:00', end_time: '17:00' })} className="w-full rounded-md py-1 text-xs text-ink-300 hover:bg-ink-50 hover:text-brand-700">+</button>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!staff?.length && <EmptyState compact title="Cadastre a equipe para montar escalas" />}
      </Card>
      <Card className="mt-4"><CardHeader title="Solicitações de troca de turno" />
        {data?.swaps?.length ? <ul className="divide-y divide-ink-100 border-t border-ink-100">{data.swaps.map((s: any) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
            <span><b>{s.requester_name}</b> → {s.target_name ?? 'qualquer colega'} · {String(s.date).split('-').reverse().join('/')} {s.start_time?.slice(0, 5)}<span className="block text-xs text-ink-500">{s.reason}</span></span>
            <span className="flex items-center gap-2"><StatusBadge status={s.status} labels={SWAP_STATUS} />
              {s.status === 'pendente' && can('equipe', 'write') && <><Button size="xs" variant="brand" onClick={async () => { try { await api.patch(`/shift-swaps/${s.id}`, { status: 'aprovada' }); toast.success('Troca aprovada.'); refresh(); } catch (e: any) { toast.error(e.message); } }}>Aprovar</Button>
                <Button size="xs" onClick={async () => { await api.patch(`/shift-swaps/${s.id}`, { status: 'recusada' }); refresh(); }}>Recusar</Button></>}</span>
          </li>))}</ul> : <EmptyState compact title="Nenhuma solicitação" />}
      </Card>
      <FormSheet open={!!form} onOpenChange={(o) => !o && setForm(null)} title={form?.id ? 'Editar escala' : 'Lançar turno ou folga'} schema={shiftSchema} tz={tz} initial={form ?? {}}
        fields={[{ name: 'employee_id', label: 'Colaborador', type: 'entity', endpoint: '/staff/options', required: true, span: 2 }, { name: 'date', label: 'Data', type: 'date', required: true },
          { name: 'kind', label: 'Tipo', type: 'select', options: SHIFT_KIND, required: true }, { name: 'start_time', label: 'Início', type: 'time', showIf: (v) => v.kind === 'turno' },
          { name: 'end_time', label: 'Término', type: 'time', showIf: (v) => v.kind === 'turno' }, { name: 'notes', label: 'Observações', span: 2 }]} onSubmit={save} />
      <FormSheet open={!!swap} onOpenChange={(o) => !o && setSwap(null)} title="Solicitar troca de turno" schema={swapRequestSchema} tz={tz} initial={swap ?? {}}
        fields={[{ name: 'target_employee_id', label: 'Substituto', type: 'entity', endpoint: '/staff/options', span: 2 }, { name: 'reason', label: 'Motivo', type: 'textarea', required: true }]}
        onSubmit={async (v) => { await api.post('/shift-swaps', { ...swap, ...v }); toast.success('Solicitação registrada.'); setSwap(null); refresh(); }} />
    </div>
  );
}
