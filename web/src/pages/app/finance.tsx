import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, HandCoins, MessageSquare, Plus, Trash2, Undo2 } from 'lucide-react';
import { COLLECTION_CHANNEL, COLLECTION_OUTCOME, PAYMENT_METHODS, TX_KIND, TX_STATUS, collectionContactSchema, formatBRL, formatDate, formatDateTime, paymentSchema, todayIn, transactionSchema } from '@nexo/shared';
import { api, qs, type Page } from '@/lib/api';
import { useCan, useTimezone } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useListParams } from '@/components/resource-page';
import { Badge, Button, Card, CardHeader, DataTable, Dialog, EmptyState, ErrorState, Input, Menu, PageHeader, Pagination, SearchInput, Select, StatusBadge, useConfirm } from '@/components/ui';
import { FormSheet, type FieldDef } from '@/components/form/form';
import { RevenueExpensesChart, DonutChart } from '@/components/charts/charts';

const TX_FIELDS = (scope: string): FieldDef[] => [
  ...(scope === 'cobrancas' ? [] : [{ name: 'kind', label: 'Tipo', type: 'select', options: TX_KIND, required: true } as FieldDef]),
  { name: 'description', label: 'Descrição', required: true, span: scope === 'cobrancas' ? 2 : 1 },
  { name: 'amount', label: 'Valor total', type: 'money', required: true },
  { name: 'category_id', label: 'Categoria', type: 'entity', endpoint: '/finance-categories/options', extraParams: (v) => `kind=${v.kind}` },
  { name: 'competence_date', label: 'Data de competência', type: 'date', required: true, hint: 'Quando a receita/despesa aconteceu' },
  { name: 'due_date', label: 'Vencimento', type: 'date', required: true },
  { name: 'customer_id', label: 'Cliente', type: 'entity', endpoint: '/customers/options', showIf: (v) => v.kind === 'receita' },
  { name: 'supplier_id', label: 'Fornecedor', type: 'entity', endpoint: '/suppliers/options', showIf: (v) => v.kind === 'despesa' },
  { name: 'payment_method', label: 'Forma de pagamento', type: 'select', options: PAYMENT_METHODS },
  { name: 'installments', label: 'Parcelas', type: 'number', hint: 'Divide em parcelas mensais' },
  { name: 'paid_on', label: 'Já pago em', type: 'date', hint: 'Deixe vazio se ainda está pendente' },
  { name: 'notes', label: 'Observações', type: 'textarea' },
];

function TransactionsPanel({ scope }: { scope: 'financeiro' | 'cobrancas' }) {
  const tz = useTimezone();
  const can = useCan();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [sp, setSp] = useSearchParams();
  const lp = useListParams({ key: 'due_date', dir: 'asc' }, ['kind', 'status', 'from', 'to', 'customer_id', 'dateField']);
  const [form, setForm] = useState<any>(null);
  const [payFor, setPayFor] = useState<any>(null);
  const [contactFor, setContactFor] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const writable = can(scope, 'write');
  useEffect(() => { const n = sp.get('novo'); if (n && writable) { setForm({ kind: n === 'despesa' ? 'despesa' : 'receita' }); sp.delete('novo'); setSp(sp, { replace: true }); } }, [sp]); // eslint-disable-line
  const url = `/transactions${qs({ ...lp.params, scope: scope === 'cobrancas' ? 'cobrancas' : undefined, status: lp.params.status ?? (scope === 'cobrancas' ? 'aberto' : undefined), page: lp.page, sort: lp.sort.key, dir: lp.sort.dir })}`;
  const { data, isFetching, error, refetch } = useQuery({ queryKey: ['/transactions', url], queryFn: () => api.get<Page<any>>(url), placeholderData: keepPreviousData });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['/transactions'] }); qc.invalidateQueries({ queryKey: ['finance'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  const det = useQuery({ queryKey: ['/transactions', 'detail', detail?.id], queryFn: () => api.get<{ data: any }>(`/transactions/${detail.id}`).then((r) => r.data), enabled: !!detail });
  const act = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast.success(msg); refresh(); } catch (e: any) { toast.error(e.message); } };
  const today = todayIn(tz);
  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-ink-100 p-3 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput value={lp.get('q')} onChange={(v) => lp.set({ q: v })} placeholder="Descrição, cliente, fornecedor…" className="lg:w-64" />
          {scope === 'financeiro' && <Select value={lp.get('kind')} onChange={(e) => lp.set({ kind: e.target.value })} className="lg:w-36" aria-label="Tipo"><option value="">Receitas e despesas</option><option value="receita">Receitas</option><option value="despesa">Despesas</option></Select>}
          <Select value={lp.get('status')} onChange={(e) => lp.set({ status: e.target.value })} className="lg:w-40" aria-label="Situação">
            {scope === 'cobrancas' ? <option value="">Em aberto</option> : <option value="">Todas (exceto canceladas)</option>}
            <option value="atrasado">Atrasados</option>{scope === 'financeiro' && <option value="aberto">Em aberto</option>}{Object.entries(TX_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select value={lp.get('dateField')} onChange={(e) => lp.set({ dateField: e.target.value })} className="lg:w-36" aria-label="Filtrar data por"><option value="">Competência</option><option value="due">Vencimento</option></Select>
          <div className="flex items-center gap-2"><Input type="date" value={lp.get('from')} onChange={(e) => lp.set({ from: e.target.value })} className="lg:w-38" aria-label="De" /><Input type="date" value={lp.get('to')} onChange={(e) => lp.set({ to: e.target.value })} className="lg:w-38" aria-label="Até" /></div>
          {writable && <Button variant="primary" className="lg:ml-auto" icon={<Plus className="size-4" />} onClick={() => setForm({ kind: 'receita' })}>{scope === 'cobrancas' ? 'Novo valor a receber' : 'Novo lançamento'}</Button>}
        </div>
        {data?.sums && <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-ink-100 bg-ink-50/60 px-4 py-2 text-sm"><span>Total: <b className="tabular">{formatBRL(data.sums.amount)}</b></span><span>Pago: <b className="tabular">{formatBRL(data.sums.paid)}</b></span><span>Em aberto: <b className="tabular">{formatBRL(data.sums.balance)}</b></span></div>}
        {error ? <ErrorState error={error} onRetry={() => refetch()} /> : (
          <DataTable<any> rows={data?.data ?? []} loading={isFetching} sort={lp.sort} onSort={(k) => lp.set({ sort: k, dir: lp.sort.key === k && lp.sort.dir === 'asc' ? 'desc' : 'asc' })}
            onRowClick={(r) => setDetail(r)}
            empty={<EmptyState icon={<HandCoins className="size-6" />} title={scope === 'cobrancas' ? 'Nada a receber' : 'Nenhum lançamento'} description="Lançamentos de vendas aparecem automaticamente." />}
            columns={[
              { key: 'description', header: 'Descrição', sortKey: 'description', primary: true, render: (r) => <div><p className="font-medium text-ink-900">{r.description}{r.installment ? ` (${r.installment})` : ''}</p><p className="text-xs text-ink-500">{[r.category_name, r.customer_name ?? r.supplier_name].filter(Boolean).join(' · ')}</p></div> },
              ...(scope === 'financeiro' ? [{ key: 'kind', header: 'Tipo', render: (r: any) => <Badge tone={r.kind === 'receita' ? 'success' : 'warning'}>{TX_KIND[r.kind as keyof typeof TX_KIND]}</Badge> }] : []),
              { key: 'due_date', header: 'Vencimento', sortKey: 'due_date', render: (r) => <span className={cn(r.is_overdue && 'font-semibold text-red-600')}>{formatDate(r.due_date)}{r.is_overdue ? ` · ${r.days_overdue}d` : ''}</span> },
              { key: 'amount', header: 'Valor', sortKey: 'amount', align: 'right', render: (r) => <span className={cn('font-semibold tabular', r.kind === 'despesa' && 'text-ink-700')}>{r.kind === 'despesa' ? '− ' : ''}{formatBRL(r.amount)}</span> },
              { key: 'balance', header: 'Em aberto', align: 'right', hideOnMobile: true, render: (r) => (r.status === 'cancelado' ? '—' : <span className="tabular">{formatBRL(r.balance)}</span>) },
              { key: 'status', header: 'Situação', render: (r) => <StatusBadge status={r.is_overdue ? 'atrasado' : r.status} labels={{ ...TX_STATUS, atrasado: 'Atrasado' }} /> },
            ]}
            actions={(r) => writable && <Menu items={[
              ['pendente', 'parcial'].includes(r.status) && { label: r.kind === 'receita' ? 'Registrar recebimento' : 'Registrar pagamento', icon: <HandCoins className="size-4" />, onSelect: () => setPayFor(r) },
              r.kind === 'receita' && ['pendente', 'parcial'].includes(r.status) && can('cobrancas', 'write') && { label: 'Registrar contato de cobrança', icon: <MessageSquare className="size-4" />, onSelect: () => setContactFor(r) },
              r.source === 'manual' && r.status !== 'cancelado' && { label: 'Editar', onSelect: () => setForm(r) },
              r.status !== 'cancelado' && r.source !== 'venda' && { label: 'Cancelar lançamento', icon: <Ban className="size-4" />, onSelect: async () => { if (await confirm({ title: 'Cancelar lançamento?', description: 'Pagamentos registrados serão estornados. O histórico é mantido.', confirmLabel: 'Cancelar lançamento' })) act(() => api.post(`/transactions/${r.id}/cancel`), 'Lançamento cancelado.'); } },
              r.source === 'manual' && r.amount_paid === 0 && { label: 'Excluir', icon: <Trash2 className="size-4" />, danger: true, onSelect: async () => { if (await confirm({ title: 'Excluir lançamento?', confirmLabel: 'Excluir' })) act(() => api.del(`/transactions/${r.id}`), 'Lançamento excluído.'); } },
            ]} />} />
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(p) => lp.set({ page: p }, false)} />}
      </Card>
      <FormSheet open={!!form} onOpenChange={(o) => !o && setForm(null)} title={form?.id ? 'Editar lançamento' : scope === 'cobrancas' ? 'Novo valor a receber' : 'Novo lançamento'} tz={tz}
        fields={TX_FIELDS(scope).filter((f) => !form?.id || !['installments', 'paid_on'].includes(f.name))} schema={transactionSchema}
        initial={form?.id ? form : { kind: form?.kind ?? 'receita', competence_date: today, due_date: today, amount: 0, installments: 1, ...form }}
        onSubmit={async (v) => { const body = { ...v, kind: scope === 'cobrancas' ? 'receita' : v.kind, scope }; if (form?.id) await api.put(`/transactions/${form.id}`, body); else await api.post('/transactions', body); toast.success('Lançamento salvo.'); setForm(null); refresh(); }} />
      <FormSheet open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} title={payFor?.kind === 'despesa' ? 'Registrar pagamento' : 'Registrar recebimento'} tz={tz}
        description={payFor ? `${payFor.description} · em aberto ${formatBRL(payFor.balance)}. Pagamentos parciais são permitidos.` : undefined}
        fields={[{ name: 'amount', label: 'Valor', type: 'money', required: true }, { name: 'paid_on', label: 'Data do pagamento', type: 'date', required: true }, { name: 'method', label: 'Forma', type: 'select', options: PAYMENT_METHODS }, { name: 'notes', label: 'Observação', span: 2 }]}
        schema={paymentSchema} initial={{ amount: payFor?.balance ?? 0, paid_on: today, method: payFor?.payment_method ?? '' }}
        onSubmit={async (v) => { await api.post(`/transactions/${payFor.id}/payments`, { ...v, scope }); toast.success('Pagamento registrado.'); setPayFor(null); refresh(); }} />
      <FormSheet open={!!contactFor} onOpenChange={(o) => !o && setContactFor(null)} title="Contato de cobrança" description={contactFor?.description} tz={tz}
        fields={[{ name: 'channel', label: 'Canal', type: 'select', options: COLLECTION_CHANNEL, required: true }, { name: 'outcome', label: 'Resultado', type: 'select', options: COLLECTION_OUTCOME, required: true },
          { name: 'promised_date', label: 'Data prometida', type: 'date' }, { name: 'notes', label: 'Observações', type: 'textarea' }]}
        schema={collectionContactSchema} initial={{ channel: 'whatsapp', outcome: 'sem_resposta' }}
        onSubmit={async (v) => { await api.post(`/transactions/${contactFor.id}/contacts`, v); toast.success('Contato registrado. Isso não confirma pagamento — registre o recebimento quando ocorrer.'); setContactFor(null); refresh(); }} />
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)} title={detail?.description ?? ''} size="lg">
        {det.data && <div className="space-y-5 text-sm">
          <div className="grid gap-3 sm:grid-cols-4">
            <div><p className="text-xs text-ink-500">Valor</p><p className="font-bold tabular">{formatBRL(det.data.amount)}</p></div>
            <div><p className="text-xs text-ink-500">Pago</p><p className="font-bold tabular">{formatBRL(det.data.amount_paid)}</p></div>
            <div><p className="text-xs text-ink-500">Vencimento</p><p className="font-bold">{formatDate(det.data.due_date)}</p></div>
            <div><p className="text-xs text-ink-500">Situação</p><StatusBadge status={det.data.status} labels={TX_STATUS} /></div>
          </div>
          <div><p className="mb-1 font-semibold">Pagamentos</p>{det.data.payments.length ? det.data.payments.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between border-b border-ink-100 py-1.5">
              <span className={cn(p.reversed_at && 'text-ink-400 line-through')}>{formatDate(p.paid_on)} · {formatBRL(p.amount)} · {PAYMENT_METHODS[p.method as keyof typeof PAYMENT_METHODS] ?? ''}</span>
              {!p.reversed_at && writable && det.data.status !== 'cancelado' && <Button size="xs" variant="ghost" icon={<Undo2 className="size-3" />} onClick={async () => { if (await confirm({ title: 'Estornar pagamento?', confirmLabel: 'Estornar' })) { await act(() => api.post(`/transactions/${det.data.id}/payments/${p.id}/reverse`, { scope }), 'Pagamento estornado.'); det.refetch(); } }}>Estornar</Button>}
            </div>)) : <p className="text-ink-500">Nenhum pagamento registrado.</p>}</div>
          {det.data.kind === 'receita' && <div><p className="mb-1 font-semibold">Contatos de cobrança</p>{det.data.contacts.length ? det.data.contacts.map((c: any) => (
            <p key={c.id} className="border-b border-ink-100 py-1.5">{formatDateTime(c.contacted_at, tz)} · {COLLECTION_CHANNEL[c.channel as keyof typeof COLLECTION_CHANNEL]} · {COLLECTION_OUTCOME[c.outcome as keyof typeof COLLECTION_OUTCOME]}{c.promised_date ? ` (prometido p/ ${formatDate(c.promised_date)})` : ''}{c.notes ? ` — ${c.notes}` : ''}</p>)) : <p className="text-ink-500">Nenhum contato registrado.</p>}</div>}
        </div>}
      </Dialog>
    </>
  );
}

export function Finance() {
  const tz = useTimezone();
  const today = todayIn(tz);
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const { data } = useQuery({ queryKey: ['finance', 'summary', from, to], queryFn: () => api.get<{ data: any }>(`/finance/summary${qs({ from, to })}`).then((r) => r.data) });
  const Stat = ({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: string }) => (
    <Card className="p-4"><p className="text-xs font-semibold text-ink-500">{label}</p><p className={cn('mt-1 font-display text-2xl font-extrabold tabular', tone)}>{formatBRL(value)}</p><p className="mt-1 text-xs text-ink-500">{hint}</p></Card>
  );
  return (
    <div>
      <PageHeader title="Financeiro" description="Receitas, despesas, contas a pagar e receber e fluxo de caixa."
        help={<><p><b>Faturamento</b>: receitas do período (data de competência).</p><p><b>Resultado estimado</b>: receitas − despesas lançadas. Não é lucro contábil.</p><p><b>Saldo de caixa</b>: tudo o que foi efetivamente recebido − pago.</p></>}
        actions={<div className="flex items-center gap-2"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" /><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Até" /></div>} />
      {data && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Faturamento no período" value={data.revenue} hint="Receitas por competência" />
          <Stat label="Despesas no período" value={data.expenses} hint="Despesas por competência" />
          <Stat label="Resultado estimado" value={data.result} hint="Receitas − despesas. Não é lucro contábil." tone={data.result >= 0 ? 'text-brand-700' : 'text-red-600'} />
          <Stat label="Saldo de caixa" value={data.cash.balance} hint={`No período: +${formatBRL(data.cash.inflow)} / −${formatBRL(data.cash.outflow)}`} />
          <Stat label="A receber" value={data.open.receivable} hint={`${formatBRL(data.open.receivable_overdue)} vencidos`} tone={data.open.receivable_overdue > 0 ? 'text-amber-600' : undefined} />
          <Stat label="A pagar" value={data.open.payable} hint={`${formatBRL(data.open.payable_overdue)} vencidos`} tone={data.open.payable_overdue > 0 ? 'text-red-600' : undefined} />
          {data.grossMargin !== null && <Card className="p-4"><p className="text-xs font-semibold text-ink-500">Margem bruta das vendas</p><p className="mt-1 font-display text-2xl font-extrabold">{Math.round(data.grossMargin * 100)}%</p><p className="mt-1 text-xs text-ink-500">Custo dos itens vendidos: {formatBRL(data.salesCost)}</p></Card>}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card><CardHeader title="Receitas x despesas (12 meses)" />{data.hasData ? <div className="px-3 pb-4"><RevenueExpensesChart data={data.monthly} /></div> : <EmptyState compact title="Sem lançamentos ainda" description="Registre receitas e despesas para ver a evolução." />}</Card>
          <Card><CardHeader title="Despesas por categoria" description="No período" />{data.byCategory.filter((c: any) => c.kind === 'despesa').length ? <div className="px-3 pb-4"><DonutChart data={data.byCategory.filter((c: any) => c.kind === 'despesa')} valueKey="total" money /></div> : <EmptyState compact title="Sem despesas no período" />}</Card>
        </div>
      </>}
      <h2 className="mb-3 mt-6 font-display text-lg font-bold">Lançamentos</h2>
      <TransactionsPanel scope="financeiro" />
    </div>
  );
}

export function Receivables() {
  return (
    <div>
      <PageHeader title="Contas a receber" description="Valores pendentes, pagamentos parciais, atrasos e contatos de cobrança."
        help={<><p>Registrar um <b>contato de cobrança</b> não marca o valor como pago. O pagamento só é considerado após você registrar o recebimento.</p><p>Cobranças automáticas e integração bancária não estão configuradas nesta instalação.</p></>} />
      <div className="mb-4 rounded-xl border border-ink-200 bg-white p-3 text-sm text-ink-600">Integração bancária / cobrança automática: <b>não configurada</b>. Recebimentos são registrados manualmente.</div>
      <TransactionsPanel scope="cobrancas" />
    </div>
  );
}
