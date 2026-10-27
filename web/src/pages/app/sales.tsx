import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Ban, Minus, Package, Plus, Printer, Receipt, Scissors, ShoppingCart, Trash2 } from 'lucide-react';
import { PAYMENT_METHODS, SALE_STATUS, TX_STATUS, addDays, formatBRL, formatDateTime, formatNumber, lineTotal, toCents, todayIn } from '@nexo/shared';
import { api, ApiError, qs, type Page } from '@/lib/api';
import { useCan, useTerm, useTimezone } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useListParams } from '@/components/resource-page';
import { Badge, Button, Card, CardHeader, DataTable, Dialog, EmptyState, EntitySelect, ErrorState, Field, Input, KeyValue, MoneyInput, NumberInput, PageHeader, PageLoader, Pagination, SearchInput, Select, StatusBadge, Tabs, Textarea, useConfirm } from '@/components/ui';

export function Sales() {
  const tz = useTimezone();
  const can = useCan();
  const navigate = useNavigate();
  const plural = useTerm('sales', 'Vendas');
  const lp = useListParams({ key: 'sold_at', dir: 'desc' }, ['status', 'payment_method', 'from', 'to']);
  const url = `/sales${qs({ ...lp.params, page: lp.page, sort: lp.sort.key, dir: lp.sort.dir })}`;
  const { data, isFetching, error, refetch } = useQuery({ queryKey: ['/sales', url], queryFn: () => api.get<Page<any>>(url), placeholderData: keepPreviousData });
  return (
    <div>
      <PageHeader title={plural} description="Histórico de transações, com baixa automática de estoque e lançamento financeiro."
        help={<><p>Cada venda registrada <b>baixa o estoque</b> dos produtos e cria <b>uma única receita</b> no financeiro (paga ou a receber).</p><p>Vendas não são editadas: se algo estiver errado, <b>cancele</b> — o estoque e o financeiro são estornados e o histórico é preservado.</p></>}
        actions={can('vendas', 'write') && <Link to="/app/vendas/nova"><Button variant="primary" icon={<Plus className="size-4" />}>Registrar {useTerm('sale', 'venda').toLowerCase()}</Button></Link>} />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-ink-100 p-3 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput value={lp.get('q')} onChange={(v) => lp.set({ q: v })} placeholder="Nº, cliente ou item…" className="lg:w-64" />
          <Select value={lp.get('status')} onChange={(e) => lp.set({ status: e.target.value })} className="lg:w-40" aria-label="Situação"><option value="">Todas</option>{Object.entries(SALE_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Select value={lp.get('payment_method')} onChange={(e) => lp.set({ payment_method: e.target.value })} className="lg:w-48" aria-label="Pagamento"><option value="">Todas as formas</option>{Object.entries(PAYMENT_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <div className="flex items-center gap-2"><Input type="date" value={lp.get('from')} onChange={(e) => lp.set({ from: e.target.value })} aria-label="De" className="lg:w-40" /><span className="text-ink-400">até</span><Input type="date" value={lp.get('to')} onChange={(e) => lp.set({ to: e.target.value })} aria-label="Até" className="lg:w-40" /></div>
          {data?.sums && <p className="text-sm text-ink-600 lg:ml-auto">Total no filtro: <b className="tabular text-ink-900">{formatBRL(data.sums.total)}</b></p>}
        </div>
        {error ? <ErrorState error={error} onRetry={() => refetch()} /> : (
          <DataTable<any> rows={data?.data ?? []} loading={isFetching} sort={lp.sort}
            onSort={(k) => lp.set({ sort: k, dir: lp.sort.key === k && lp.sort.dir === 'desc' ? 'asc' : 'desc' })}
            onRowClick={(r) => navigate(`/app/vendas/${r.id}`)}
            empty={<EmptyState icon={<ShoppingCart className="size-6" />} title="Nenhuma venda encontrada" description="Registre vendas para acompanhar faturamento, estoque e produtos mais vendidos."
              action={can('vendas', 'write') ? <Link to="/app/vendas/nova"><Button variant="primary">Registrar venda</Button></Link> : undefined} />}
            columns={[
              { key: 'number', header: 'Nº', sortKey: 'number', primary: true, render: (r) => <span className="font-semibold text-ink-900">#{r.number}</span> },
              { key: 'sold_at', header: 'Data', sortKey: 'sold_at', render: (r) => formatDateTime(r.sold_at, tz) },
              { key: 'customer', header: 'Cliente', sortKey: 'customer', render: (r) => r.customer_name ?? <span className="text-ink-400">Não identificado</span> },
              { key: 'items', header: 'Itens', hideOnMobile: true, render: (r) => <span className="line-clamp-1 max-w-xs text-ink-600">{r.items_summary}</span> },
              { key: 'payment', header: 'Pagamento', render: (r) => <div className="flex flex-col"><span>{PAYMENT_METHODS[r.payment_method as keyof typeof PAYMENT_METHODS]}</span>{r.payment_status === 'pendente' && r.status !== 'cancelada' && <span className="text-xs font-medium text-amber-600">A receber</span>}</div> },
              { key: 'total', header: 'Total', sortKey: 'total', align: 'right', render: (r) => <span className={cn('font-semibold tabular', r.status === 'cancelada' && 'text-ink-400 line-through')}>{formatBRL(r.total)}</span> },
              { key: 'status', header: 'Situação', render: (r) => <StatusBadge status={r.status} labels={SALE_STATUS} /> },
            ]} />
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(p) => lp.set({ page: p }, false)} />}
      </Card>
    </div>
  );
}

interface CartItem { key: string; product_id?: string | null; service_id?: string | null; description: string; quantity: number; unit_price: number; discount: number; stock?: number; unit?: string }

function Catalog({ onAdd }: { onAdd: (it: CartItem) => void }) {
  const [tab, setTab] = useState<'produtos' | 'servicos'>('produtos');
  const [q, setQ] = useState('');
  const can = useCan();
  const endpoint = tab === 'produtos' ? '/products' : '/services';
  const { data, isFetching } = useQuery({
    queryKey: ['catalog', endpoint, q],
    queryFn: () => api.get<Page<any>>(`${endpoint}${qs({ q, pageSize: 24, ...(tab === 'servicos' ? { active: '1' } : {}) })}`),
    enabled: tab === 'produtos' ? can('estoque') : can('servicos'),
    placeholderData: keepPreviousData,
  });
  const items = (data?.data ?? []).filter((x: any) => x.active !== false);
  return (
    <Card className="flex flex-col">
      <div className="space-y-3 border-b border-ink-100 p-4">
        <div className="flex gap-1 rounded-lg bg-ink-100 p-1">
          {(['produtos', 'servicos'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium', tab === t ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500')}>
              {t === 'produtos' ? <Package className="size-4" /> : <Scissors className="size-4" />}{t === 'produtos' ? 'Produtos' : 'Serviços'}
            </button>
          ))}
        </div>
        <SearchInput value={q} onChange={setQ} placeholder={`Buscar ${tab}…`} />
      </div>
      <div className="grid max-h-[460px] grid-cols-1 gap-2 overflow-y-auto p-3 sm:grid-cols-2 scrollbar-thin">
        {items.map((p: any) => (
          <button key={p.id} type="button" onClick={() => onAdd({
            key: `${tab}-${p.id}`, [tab === 'produtos' ? 'product_id' : 'service_id']: p.id, description: p.name, quantity: 1,
            unit_price: tab === 'produtos' ? p.sale_price : p.price, discount: 0, stock: tab === 'produtos' ? p.stock_qty : undefined, unit: p.unit,
          })}
            className="group flex flex-col items-start rounded-xl border border-ink-200 bg-white p-3 text-left transition-all hover:border-brand-400 hover:shadow-card active:scale-[0.99]">
            <span className="line-clamp-2 text-sm font-semibold text-ink-900">{p.name}</span>
            <span className="mt-1 flex w-full items-center justify-between">
              <span className="font-display font-bold tabular text-brand-700">{formatBRL(tab === 'produtos' ? p.sale_price : p.price)}</span>
              {tab === 'produtos' ? <span className={cn('text-xs', p.stock_qty <= 0 ? 'text-red-600' : 'text-ink-500')}>{formatNumber(p.stock_qty)} {p.unit}</span> : <span className="text-xs text-ink-500">{p.duration_minutes} min</span>}
            </span>
          </button>
        ))}
        {!items.length && !isFetching && <p className="col-span-full py-8 text-center text-sm text-ink-500">Nada encontrado. {tab === 'produtos' ? <Link className="text-brand-700 underline" to="/app/estoque?novo=1">Cadastrar produto</Link> : <Link className="text-brand-700 underline" to="/app/servicos?novo=1">Cadastrar serviço</Link>}</p>}
      </div>
      <div className="border-t border-ink-100 p-3">
        <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => onAdd({ key: `livre-${Date.now()}`, description: 'Item avulso', quantity: 1, unit_price: 0, discount: 0 })}>Adicionar item avulso</Button>
      </div>
    </Card>
  );
}

export function NewSale() {
  const tz = useTimezone();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sp] = useSearchParams();
  const term = useTerm('sale', 'Venda');
  const [items, setItems] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(sp.get('cliente'));
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState<'pago' | 'pendente'>('pago');
  const [dueDate, setDueDate] = useState(addDays(todayIn(tz), 30));
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stockIssue, setStockIssue] = useState<string | null>(null);

  const add = (it: CartItem) => setItems((cur) => {
    const ex = cur.find((c) => c.key === it.key && !it.key.startsWith('livre'));
    return ex ? cur.map((c) => (c === ex ? { ...c, quantity: c.quantity + 1 } : c)) : [...cur, it];
  });
  const update = (key: string, patch: Partial<CartItem>) => setItems((cur) => cur.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const subtotal = useMemo(() => items.reduce((s, i) => s + toCents(lineTotal(i.quantity || 0, i.unit_price, i.discount)), 0) / 100, [items]);
  const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);

  const submit = useMutation({
    mutationFn: (allowNegative: boolean) => api.post('/sales', {
      customer_id: customerId, employee_id: employeeId, discount, payment_method: method, payment_status: method === 'a_prazo' ? 'pendente' : status,
      due_date: (method === 'a_prazo' || status === 'pendente') ? dueDate : null, notes, allow_negative_stock: allowNegative,
      items: items.map((i) => ({ product_id: i.product_id ?? null, service_id: i.service_id ?? null, description: i.description, quantity: i.quantity, unit_price: i.unit_price, discount: i.discount })),
    }),
    onSuccess: (r: any) => {
      toast.success(`${term} #${r.data.number} registrada: ${formatBRL(r.data.total)}`);
      qc.invalidateQueries();
      navigate(`/app/vendas/${r.data.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409 && e.message.startsWith('Estoque insuficiente')) { setStockIssue(e.message); return; }
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      toast.error(e.message);
    },
  });
  const finish = () => {
    const errs: Record<string, string> = {};
    if (!items.length) errs.items = 'Adicione ao menos um item';
    if (!method) errs.payment_method = 'Selecione a forma de pagamento';
    if (items.some((i) => !i.description.trim() || !(i.quantity > 0))) errs.items = 'Revise descrição e quantidade dos itens';
    if (discount > subtotal) errs.discount = 'O desconto não pode ser maior que o subtotal';
    setErrors(errs);
    if (Object.keys(errs).length) { toast.error('Verifique os dados da venda.'); return; }
    submit.mutate(false);
  };

  return (
    <div>
      <PageHeader back={<Link to="/app/vendas" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"><ArrowLeft className="size-4" />Vendas</Link>}
        title={`Registrar ${term.toLowerCase()}`} description="Selecione produtos e serviços. O estoque e o financeiro são atualizados automaticamente." />
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Catalog onAdd={add} />
        <div className="space-y-4">
          <Card>
            <CardHeader title="Itens" description={`${items.length} item(ns)`} icon={<ShoppingCart className="size-4" />} />
            {items.length ? (
              <ul className="divide-y divide-ink-100 border-t border-ink-100">
                {items.map((i) => (
                  <li key={i.key} className="space-y-2 px-5 py-3">
                    <div className="flex items-start gap-2">
                      <Input value={i.description} onChange={(e) => update(i.key, { description: e.target.value })} className="h-8 flex-1 text-sm font-medium" aria-label="Descrição" disabled={!!(i.product_id || i.service_id)} />
                      <Button size="icon" variant="ghost" className="size-8 text-ink-400 hover:text-red-600" onClick={() => setItems((c) => c.filter((x) => x.key !== i.key))} aria-label="Remover item"><Trash2 className="size-4" /></Button>
                    </div>
                    <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-2">
                      <div className="flex items-center rounded-lg border border-ink-200">
                        <button type="button" className="grid size-8 place-items-center text-ink-500 hover:text-ink-900" onClick={() => update(i.key, { quantity: Math.max(0.001, +(i.quantity - 1).toFixed(3)) })} aria-label="Diminuir"><Minus className="size-3.5" /></button>
                        <NumberInput value={i.quantity} onChange={(v) => update(i.key, { quantity: v === '' ? 0 : v })} step={0.001} className="h-8 w-16 border-0 px-1 text-center focus:ring-0" />
                        <button type="button" className="grid size-8 place-items-center text-ink-500 hover:text-ink-900" onClick={() => update(i.key, { quantity: +(i.quantity + 1).toFixed(3) })} aria-label="Aumentar"><Plus className="size-3.5" /></button>
                      </div>
                      <Field label={<span className="text-xs">Preço un.</span>}><MoneyInput value={i.unit_price} onChange={(v) => update(i.key, { unit_price: v })} /></Field>
                      <Field label={<span className="text-xs">Desconto</span>}><MoneyInput value={i.discount} onChange={(v) => update(i.key, { discount: v })} /></Field>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className={cn(i.stock !== undefined && i.stock < i.quantity ? 'font-medium text-red-600' : 'text-ink-500')}>{i.stock !== undefined ? `Em estoque: ${formatNumber(i.stock)} ${i.unit ?? ''}` : i.service_id ? 'Serviço' : 'Item avulso (sem estoque)'}</span>
                      <span className="font-semibold tabular text-ink-900">{formatBRL(lineTotal(i.quantity || 0, i.unit_price, i.discount))}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <EmptyState compact title="Nenhum item adicionado" description="Clique em um produto ou serviço ao lado." />}
            {errors.items && <p className="px-5 pb-3 text-xs font-medium text-red-600">{errors.items}</p>}
          </Card>
          <Card className="space-y-4 p-5">
            <Field label="Cliente" hint="Opcional — identifique para manter o histórico"><EntitySelect endpoint="/customers/options" value={customerId} onChange={(v) => setCustomerId(v)} placeholder="Consumidor não identificado" /></Field>
            <Field label="Vendedor / profissional"><EntitySelect endpoint="/staff/options" value={employeeId} onChange={setEmployeeId} placeholder="Opcional" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Forma de pagamento" required error={errors.payment_method}>
                <Select value={method} onChange={(e) => { setMethod(e.target.value); if (e.target.value === 'a_prazo') setStatus('pendente'); }} invalid={!!errors.payment_method}>
                  <option value="">Selecione…</option>{Object.entries(PAYMENT_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Situação do pagamento">
                <Select value={method === 'a_prazo' ? 'pendente' : status} disabled={method === 'a_prazo'} onChange={(e) => setStatus(e.target.value as any)}>
                  <option value="pago">Recebido agora</option><option value="pendente">A receber</option>
                </Select>
              </Field>
            </div>
            {(status === 'pendente' || method === 'a_prazo') && <Field label="Vencimento" hint="Aparecerá em Contas a receber"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>}
            <Field label="Desconto na venda" error={errors.discount}><MoneyInput value={discount} onChange={setDiscount} invalid={!!errors.discount} /></Field>
            <Field label="Observações"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
            <div className="space-y-1.5 rounded-xl bg-ink-50 p-4 text-sm">
              <div className="flex justify-between text-ink-600"><span>Subtotal</span><span className="tabular">{formatBRL(subtotal)}</span></div>
              {discount > 0 && <div className="flex justify-between text-ink-600"><span>Desconto</span><span className="tabular">− {formatBRL(discount)}</span></div>}
              <div className="flex items-baseline justify-between border-t border-ink-200 pt-2"><span className="font-semibold">Total</span><span className="font-display text-2xl font-extrabold tabular text-ink-950">{formatBRL(total)}</span></div>
            </div>
            <Button variant="primary" size="lg" className="w-full" loading={submit.isPending} onClick={finish} icon={<Receipt className="size-4" />}>Finalizar {term.toLowerCase()}</Button>
          </Card>
        </div>
      </div>
      <Dialog open={!!stockIssue} onOpenChange={(v) => !v && setStockIssue(null)} title="Estoque insuficiente" size="sm"
        footer={<><Button onClick={() => setStockIssue(null)}>Revisar itens</Button><Button variant="danger" onClick={() => { setStockIssue(null); submit.mutate(true); }}>Registrar mesmo assim</Button></>}>
        <p className="text-sm text-ink-700">{stockIssue}</p>
        <p className="mt-2 text-sm text-ink-500">Se o produto existe fisicamente, o cadastro pode estar desatualizado. Registrar mesmo assim deixará o saldo negativo até você ajustar o estoque.</p>
      </Dialog>
    </div>
  );
}

export function SaleDetail() {
  const { id } = useParams();
  const tz = useTimezone();
  const can = useCan();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [reason, setReason] = useState('');
  const [canceling, setCanceling] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['/sales', 'detail', id], queryFn: () => api.get<{ data: any }>(`/sales/${id}`).then((r) => r.data) });
  const cancel = useMutation({
    mutationFn: () => api.post(`/sales/${id}/cancel`, { reason }),
    onSuccess: () => { toast.success('Venda cancelada. Estoque e financeiro foram estornados.'); setCanceling(false); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  return (
    <div>
      <PageHeader back={<Link to="/app/vendas" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800 no-print"><ArrowLeft className="size-4" />Vendas</Link>}
        title={<span className="flex items-center gap-3">Venda #{data.number}<StatusBadge status={data.status} labels={SALE_STATUS} /></span>}
        description={`${formatDateTime(data.sold_at, tz)} · registrada por ${data.created_by_name ?? '—'}`}
        actions={<div className="no-print flex gap-2">
          <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir comprovante</Button>
          {can('vendas', 'write') && data.status === 'concluida' && <Button variant="danger" icon={<Ban className="size-4" />} onClick={() => setCanceling(true)}>Cancelar venda</Button>}
        </div>} />
      {data.status === 'cancelada' && <div className="mb-4 rounded-xl border border-ink-200 bg-ink-100 p-4 text-sm text-ink-700">Cancelada em {formatDateTime(data.canceled_at, tz)}. Motivo: {data.cancel_reason}</div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="print-page">
          <CardHeader title="Itens" />
          <DataTable<any> rows={data.items} columns={[
            { key: 'description', header: 'Descrição', primary: true, render: (i) => <span className="font-medium">{i.description}</span> },
            { key: 'kind', header: 'Tipo', render: (i) => <Badge tone={i.product_id ? 'brand' : i.service_id ? 'info' : 'neutral'}>{i.product_id ? 'Produto' : i.service_id ? 'Serviço' : 'Avulso'}</Badge> },
            { key: 'quantity', header: 'Qtd.', align: 'right', render: (i) => formatNumber(i.quantity) },
            { key: 'unit_price', header: 'Preço un.', align: 'right', render: (i) => formatBRL(i.unit_price) },
            { key: 'discount', header: 'Desconto', align: 'right', render: (i) => (i.discount > 0 ? formatBRL(i.discount) : '—') },
            { key: 'total', header: 'Total', align: 'right', render: (i) => <span className="font-semibold tabular">{formatBRL(i.total)}</span> },
          ]} />
          <div className="ml-auto max-w-xs space-y-1.5 border-t border-ink-100 p-5 text-sm">
            <div className="flex justify-between text-ink-600"><span>Subtotal</span><span className="tabular">{formatBRL(data.subtotal)}</span></div>
            <div className="flex justify-between text-ink-600"><span>Desconto</span><span className="tabular">− {formatBRL(data.discount)}</span></div>
            <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-bold"><span>Total</span><span className="tabular">{formatBRL(data.total)}</span></div>
          </div>
        </Card>
        <Card className="p-5">
          <KeyValue className="!grid-cols-1" items={[
            { label: 'Cliente', value: data.customer_id ? <Link className="text-brand-700 hover:underline" to={`/app/clientes/${data.customer_id}`}>{data.customer_name}</Link> : 'Não identificado' },
            { label: 'Vendedor', value: data.employee_name },
            { label: 'Forma de pagamento', value: PAYMENT_METHODS[data.payment_method as keyof typeof PAYMENT_METHODS] },
            { label: 'Situação no financeiro', value: data.transaction ? <span className="flex items-center gap-2"><StatusBadge status={data.transaction.status} labels={TX_STATUS} />{data.transaction.status !== 'pago' && data.transaction.status !== 'cancelado' && <Link to="/app/cobrancas" className="text-xs text-brand-700 underline">Registrar recebimento</Link>}</span> : 'Sem lançamento (valor zero)' },
            ...(data.cost_total != null ? [{ label: 'Custo estimado dos itens', value: formatBRL(data.cost_total) }, { label: 'Margem bruta estimada', value: data.total > 0 ? `${formatBRL(data.total - data.cost_total)} (${Math.round(((data.total - data.cost_total) / data.total) * 100)}%)` : '—' }] : []),
            { label: 'Observações', value: data.notes },
          ]} />
        </Card>
      </div>
      <Dialog open={canceling} onOpenChange={setCanceling} title={`Cancelar venda #${data.number}?`} size="sm"
        description="Os produtos voltam ao estoque e a receita é cancelada (pagamentos são estornados). O registro permanece no histórico."
        footer={<><Button onClick={() => setCanceling(false)}>Voltar</Button><Button variant="danger" disabled={reason.trim().length < 3} loading={cancel.isPending} onClick={async () => { if (await confirm({ title: 'Confirmar cancelamento', description: 'Esta ação não pode ser desfeita.', confirmLabel: 'Cancelar venda' })) cancel.mutate(); }}>Cancelar venda</Button></>}>
        <Field label="Motivo do cancelamento" required><Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: cliente desistiu, item lançado errado…" /></Field>
      </Dialog>
    </div>
  );
}
export { Tabs };
