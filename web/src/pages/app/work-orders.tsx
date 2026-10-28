import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Receipt, Trash2, Wrench } from 'lucide-react';
import { PAYMENT_METHODS, WORK_ORDER_STATUS, formatBRL, formatDate, todayIn } from '@nexo/shared';
import { api, ApiError, qs, type Page } from '@/lib/api';
import { useCan, useTimezone } from '@/lib/auth';
import { useListParams } from '@/components/resource-page';
import { Badge, Button, Card, DataTable, Dialog, EmptyState, EntitySelect, ErrorState, Field, Input, NumberInput, PageHeader, PageLoader, Pagination, SearchInput, Select, StatusBadge, Textarea, useConfirm } from '@/components/ui';
import { ItemsEditor, itemsTotals, type LineItem } from '@/components/items-editor';

export function WorkOrders() {
  const navigate = useNavigate();
  const can = useCan();
  const lp = useListParams({ key: 'number', dir: 'desc' }, ['status', 'late']);
  const url = `/work-orders${qs({ ...lp.params, page: lp.page, sort: lp.sort.key, dir: lp.sort.dir })}`;
  const { data, isFetching, error, refetch } = useQuery({ queryKey: ['/work-orders', url], queryFn: () => api.get<Page<any>>(url), placeholderData: keepPreviousData });
  return (
    <div>
      <PageHeader title="Ordens de serviço" description="Serviços em andamento, prazos, peças e faturamento."
        help={<p>Ao <b>faturar</b> uma OS, o sistema gera a venda: baixa as peças do estoque e lança a receita.</p>}
        actions={can('ordens_servico', 'write') && <Link to="/app/ordens-servico/nova"><Button variant="primary" icon={<Plus className="size-4" />}>Abrir OS</Button></Link>} />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-ink-100 p-3 sm:flex-row">
          <SearchInput value={lp.get('q')} onChange={(v) => lp.set({ q: v })} placeholder="Nº, título, cliente ou placa…" className="sm:w-72" />
          <Select value={lp.get('status')} onChange={(e) => lp.set({ status: e.target.value })} className="sm:w-48" aria-label="Situação"><option value="">Todas</option><option value="abertas">Em aberto</option>{Object.entries(WORK_ORDER_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Select value={lp.get('late')} onChange={(e) => lp.set({ late: e.target.value })} className="sm:w-40" aria-label="Prazo"><option value="">Todos os prazos</option><option value="1">Atrasadas</option></Select>
        </div>
        {error ? <ErrorState error={error} onRetry={() => refetch()} /> : (
          <DataTable<any> rows={data?.data ?? []} loading={isFetching} sort={lp.sort} onSort={(k) => lp.set({ sort: k, dir: lp.sort.key === k && lp.sort.dir === 'desc' ? 'asc' : 'desc' })}
            onRowClick={(r) => navigate(`/app/ordens-servico/${r.id}`)}
            empty={<EmptyState icon={<Wrench className="size-6" />} title="Nenhuma ordem de serviço" action={can('ordens_servico', 'write') ? <Link to="/app/ordens-servico/nova"><Button variant="primary">Abrir OS</Button></Link> : undefined} />}
            columns={[
              { key: 'number', header: 'Nº', sortKey: 'number', primary: true, render: (r) => <span className="font-semibold">#{r.number}</span> },
              { key: 'title', header: 'Serviço', render: (r) => <div><p className="font-medium text-ink-900">{r.title}</p><p className="text-xs text-ink-500">{r.vehicle_plate ? `${r.vehicle_plate} · ${r.vehicle_model}` : ''}</p></div> },
              { key: 'customer_name', header: 'Cliente' },
              { key: 'due_date', header: 'Prazo', sortKey: 'due_date', render: (r) => <span className={r.is_late ? 'font-semibold text-red-600' : ''}>{formatDate(r.due_date)}</span> },
              { key: 'total', header: 'Total', sortKey: 'total', align: 'right', render: (r) => <span className="tabular">{formatBRL(r.total)}</span> },
              { key: 'status', header: 'Situação', render: (r) => <div className="flex gap-1"><StatusBadge status={r.status} labels={WORK_ORDER_STATUS} />{r.is_late && <Badge tone="danger">Atrasada</Badge>}</div> },
            ]} />
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(p) => lp.set({ page: p }, false)} />}
      </Card>
    </div>
  );
}

export function WorkOrderEditor() {
  const { id } = useParams();
  const tz = useTimezone();
  const can = useCan();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const showCost = can('financeiro');
  const [v, setV] = useState<any>({ title: '', status: 'aberta', opened_on: todayIn(tz), customer_id: null, vehicle_id: null, employee_id: null, due_date: '', problem: '', diagnosis: '', estimated_hours: '', actual_hours: '', notes: '' });
  const [items, setItems] = useState<LineItem[]>([]);
  const [invoice, setInvoice] = useState(false);
  const [pay, setPay] = useState({ payment_method: 'pix', payment_status: 'pago', due_date: '' });
  const { data: wo, isLoading } = useQuery({ queryKey: ['/work-orders', 'detail', id], queryFn: () => api.get<{ data: any }>(`/work-orders/${id}`).then((r) => r.data), enabled: !!id });
  useEffect(() => { if (wo) { setV({ ...wo, due_date: wo.due_date ?? '', estimated_hours: wo.estimated_hours ?? '', actual_hours: wo.actual_hours ?? '' }); setItems(wo.items.map((i: any) => ({ ...i, unit_cost: i.unit_cost ?? 0 }))); } }, [wo]);
  const set = (p: any) => setV((s: any) => ({ ...s, ...p }));
  const locked = !!wo?.sale_id;
  const save = useMutation({
    mutationFn: () => {
      const body = { customer_id: v.customer_id, vehicle_id: v.vehicle_id, employee_id: v.employee_id, title: v.title, problem: v.problem, diagnosis: v.diagnosis, status: v.status,
        opened_on: v.opened_on, due_date: v.due_date || null, estimated_hours: v.estimated_hours === '' ? null : v.estimated_hours, actual_hours: v.actual_hours === '' ? null : v.actual_hours, notes: v.notes, items };
      return id ? api.put(`/work-orders/${id}`, body) : api.post('/work-orders', body);
    },
    onSuccess: (r: any) => { toast.success('Ordem de serviço salva.'); qc.invalidateQueries({ queryKey: ['/work-orders'] }); if (!id) navigate(`/app/ordens-servico/${r.data.id}`, { replace: true }); },
    onError: (e) => toast.error(e instanceof ApiError && e.fields ? Object.values(e.fields)[0] : (e as Error).message),
  });
  const inv = useMutation({
    mutationFn: () => api.post(`/work-orders/${id}/invoice`, { ...pay, payment_status: pay.payment_method === 'a_prazo' ? 'pendente' : pay.payment_status, due_date: pay.due_date || null }),
    onSuccess: (r: any) => { toast.success(`Faturada: venda #${r.data.number}.`); setInvoice(false); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (id && isLoading) return <PageLoader />;
  const t = itemsTotals(items);
  return (
    <div>
      <PageHeader back={<Link to="/app/ordens-servico" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"><ArrowLeft className="size-4" />Ordens de serviço</Link>}
        title={id ? <span className="flex items-center gap-3">OS #{wo?.number}<StatusBadge status={wo?.status} labels={WORK_ORDER_STATUS} /></span> : 'Abrir ordem de serviço'}
        description={locked ? <>Faturada na <Link className="text-brand-700 underline" to={`/app/vendas/${wo.sale_id}`}>venda #{wo.sale_number}</Link>. Para editar, cancele a venda.</> : undefined}
        actions={id && !locked && can('ordens_servico', 'write') && <>
          <Button variant="ghost" className="text-red-600" icon={<Trash2 className="size-4" />} onClick={async () => { if (await confirm({ title: 'Excluir OS?', confirmLabel: 'Excluir' })) { try { await api.del(`/work-orders/${id}`); qc.invalidateQueries({ queryKey: ['/work-orders'] }); navigate('/app/ordens-servico'); } catch (e: any) { toast.error(e.message); } } }}>Excluir</Button>
          {can('vendas', 'write') && wo?.status !== 'cancelada' && <Button variant="brand" icon={<Receipt className="size-4" />} onClick={() => setInvoice(true)}>Faturar e entregar</Button>}
        </>} />
      <fieldset disabled={locked} className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Título" required className="sm:col-span-2"><Input value={v.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Revisão completa" /></Field>
            <Field label="Cliente"><EntitySelect endpoint="/customers/options" value={v.customer_id} onChange={(c) => set({ customer_id: c, vehicle_id: null })} /></Field>
            {can('veiculos') && <Field label="Veículo"><EntitySelect endpoint="/vehicles/options" extraParams={v.customer_id ? `customer_id=${v.customer_id}` : undefined} value={v.vehicle_id} onChange={(c) => set({ vehicle_id: c })} placeholder="Opcional" /></Field>}
            <Field label="Problema relatado" className="sm:col-span-2"><Textarea value={v.problem ?? ''} onChange={(e) => set({ problem: e.target.value })} rows={2} /></Field>
            <Field label="Diagnóstico" className="sm:col-span-2"><Textarea value={v.diagnosis ?? ''} onChange={(e) => set({ diagnosis: e.target.value })} rows={2} /></Field>
          </Card>
          <Card className="p-5"><h2 className="mb-3 font-display font-bold">Serviços, peças e mão de obra</h2><ItemsEditor items={items} onChange={setItems} showCost={showCost} /></Card>
        </div>
        <Card className="h-fit space-y-4 p-5">
          <Field label="Situação"><Select value={v.status} onChange={(e) => set({ status: e.target.value })}>{Object.entries(WORK_ORDER_STATUS).filter(([k]) => k !== 'entregue' || locked).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Responsável"><EntitySelect endpoint="/staff/options" value={v.employee_id} onChange={(c) => set({ employee_id: c })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Abertura"><Input type="date" value={v.opened_on} onChange={(e) => set({ opened_on: e.target.value })} /></Field>
            <Field label="Prazo"><Input type="date" value={v.due_date} onChange={(e) => set({ due_date: e.target.value })} /></Field>
            <Field label="Horas estimadas"><NumberInput value={v.estimated_hours} onChange={(h) => set({ estimated_hours: h })} step={0.5} /></Field>
            <Field label="Horas reais"><NumberInput value={v.actual_hours} onChange={(h) => set({ actual_hours: h })} step={0.5} /></Field>
          </div>
          <div className="rounded-xl bg-ink-50 p-4 text-sm"><div className="flex justify-between font-semibold"><span>Total</span><span className="font-display text-xl tabular">{formatBRL(t.total)}</span></div>{showCost && <p className="mt-1 text-xs text-ink-500">Custo estimado {formatBRL(t.cost)}</p>}</div>
          {!locked && <Button variant="primary" className="w-full" loading={save.isPending} onClick={() => save.mutate()}>Salvar OS</Button>}
          {wo?.history?.length > 0 && <div className="border-t border-ink-100 pt-3"><p className="mb-2 text-xs font-bold uppercase text-ink-500">Histórico</p>{wo.history.map((h: any, i: number) => <p key={i} className="text-xs text-ink-600">{formatDate(h.created_at.slice(0, 10))} · {h.summary}</p>)}</div>}
        </Card>
      </fieldset>
      <Dialog open={invoice} onOpenChange={setInvoice} title="Faturar e entregar" size="sm" description="Gera a venda: baixa as peças do estoque e lança a receita."
        footer={<><Button onClick={() => setInvoice(false)}>Cancelar</Button><Button variant="primary" loading={inv.isPending} onClick={() => inv.mutate()}>Faturar {formatBRL(wo?.total ?? 0)}</Button></>}>
        <div className="space-y-4">
          <Field label="Forma de pagamento"><Select value={pay.payment_method} onChange={(e) => setPay({ ...pay, payment_method: e.target.value })}>{Object.entries(PAYMENT_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Situação"><Select value={pay.payment_method === 'a_prazo' ? 'pendente' : pay.payment_status} disabled={pay.payment_method === 'a_prazo'} onChange={(e) => setPay({ ...pay, payment_status: e.target.value })}><option value="pago">Recebido</option><option value="pendente">A receber</option></Select></Field>
          {(pay.payment_status === 'pendente' || pay.payment_method === 'a_prazo') && <Field label="Vencimento"><Input type="date" value={pay.due_date} onChange={(e) => setPay({ ...pay, due_date: e.target.value })} /></Field>}
        </div>
      </Dialog>
    </div>
  );
}
