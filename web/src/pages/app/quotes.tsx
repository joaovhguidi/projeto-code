import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Copy, FileText, Pencil, Plus, Printer, Send, ShoppingCart, ThumbsDown, ThumbsUp, Trash2, Wrench } from 'lucide-react';
import { ITEM_KIND, PAYMENT_METHODS, QUOTE_STATUS, addDays, formatBRL, formatDate, formatDocument, formatNumber, formatPhone, todayIn } from '@nexo/shared';
import { api, ApiError, qs, type Page } from '@/lib/api';
import { useCan, useMe, useTimezone } from '@/lib/auth';
import { useListParams } from '@/components/resource-page';
import { Button, Card, DataTable, Dialog, EmptyState, EntitySelect, ErrorState, Field, Input, MoneyInput, NumberInput, PageHeader, PageLoader, Pagination, SearchInput, Select, StatusBadge, Textarea, useConfirm } from '@/components/ui';
import { ItemsEditor, emptyItem, itemsTotals, type LineItem } from '@/components/items-editor';
import { Logo } from '@/components/layout/logo';

export function Quotes() {
  const navigate = useNavigate();
  const can = useCan();
  const lp = useListParams({ key: 'number', dir: 'desc' }, ['status']);
  const url = `/quotes${qs({ ...lp.params, page: lp.page, sort: lp.sort.key, dir: lp.sort.dir })}`;
  const { data, isFetching, error, refetch } = useQuery({ queryKey: ['/quotes', url], queryFn: () => api.get<Page<any>>(url), placeholderData: keepPreviousData });
  return (
    <div>
      <PageHeader title="Orçamentos" description="Propostas com materiais, mão de obra e serviços, validade e conversão."
        help={<><p>Fluxo: <b>rascunho → enviado → aprovado/recusado</b>. Orçamentos vencidos ficam <b>expirados</b> automaticamente.</p><p>Um orçamento aprovado pode ser convertido em <b>venda</b> (baixa estoque e lança receita) ou em <b>ordem de serviço</b>.</p></>}
        actions={can('orcamentos', 'write') && <Link to="/app/orcamentos/novo"><Button variant="primary" icon={<Plus className="size-4" />}>Criar orçamento</Button></Link>} />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-ink-100 p-3 sm:flex-row">
          <SearchInput value={lp.get('q')} onChange={(v) => lp.set({ q: v })} placeholder="Nº, título ou cliente…" className="sm:w-72" />
          <Select value={lp.get('status')} onChange={(e) => lp.set({ status: e.target.value })} className="sm:w-48" aria-label="Situação"><option value="">Todas as situações</option>{Object.entries(QUOTE_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        </div>
        {error ? <ErrorState error={error} onRetry={() => refetch()} /> : (
          <DataTable<any> rows={data?.data ?? []} loading={isFetching} sort={lp.sort} onSort={(k) => lp.set({ sort: k, dir: lp.sort.key === k && lp.sort.dir === 'desc' ? 'asc' : 'desc' })}
            onRowClick={(r) => navigate(`/app/orcamentos/${r.id}`)}
            empty={<EmptyState icon={<FileText className="size-6" />} title="Nenhum orçamento" description="Crie propostas detalhadas e acompanhe quais foram aprovadas."
              action={can('orcamentos', 'write') ? <Link to="/app/orcamentos/novo"><Button variant="primary">Criar orçamento</Button></Link> : undefined} />}
            columns={[
              { key: 'number', header: 'Nº', sortKey: 'number', primary: true, render: (r) => <span className="font-semibold">#{r.number}</span> },
              { key: 'title', header: 'Título', render: (r) => <span className="font-medium text-ink-900">{r.title}</span> },
              { key: 'customer', header: 'Cliente', sortKey: 'customer', render: (r) => r.customer_name ?? '—' },
              { key: 'issued_on', header: 'Emissão', sortKey: 'issued_on', hideOnMobile: true, render: (r) => formatDate(r.issued_on) },
              { key: 'valid_until', header: 'Validade', sortKey: 'valid_until', render: (r) => formatDate(r.valid_until) },
              { key: 'total', header: 'Total', sortKey: 'total', align: 'right', render: (r) => <span className="font-semibold tabular">{formatBRL(r.total)}</span> },
              { key: 'status', header: 'Situação', render: (r) => <StatusBadge status={r.status} labels={QUOTE_STATUS} /> },
            ]} />
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(p) => lp.set({ page: p }, false)} />}
      </Card>
    </div>
  );
}

export function QuoteEditor() {
  const { id } = useParams();
  const tz = useTimezone();
  const can = useCan();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showCost = can('financeiro');
  const today = todayIn(tz);
  const [v, setV] = useState<any>({ customer_id: null, title: '', issued_on: today, valid_until: addDays(today, 15), discount: 0, estimated_hours: '', terms: 'Pagamento: 50% na aprovação e 50% na entrega.\nPrazo de execução a combinar após aprovação.', notes: '' });
  const [items, setItems] = useState<LineItem[]>([emptyItem('servico')]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const existing = useQuery({ queryKey: ['/quotes', 'detail', id], queryFn: () => api.get<{ data: any }>(`/quotes/${id}`).then((r) => r.data), enabled: !!id });
  useEffect(() => {
    const q = existing.data;
    if (!q) return;
    setV({ customer_id: q.customer_id, title: q.title, issued_on: q.issued_on, valid_until: q.valid_until, discount: q.discount, estimated_hours: q.estimated_hours ?? '', terms: q.terms ?? '', notes: q.notes ?? '' });
    setItems(q.items.map((i: any) => ({ ...i, unit_cost: i.unit_cost ?? 0 })));
  }, [existing.data]);
  const t = itemsTotals(items, v.discount);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...v, estimated_hours: v.estimated_hours === '' ? null : v.estimated_hours, items: items.map((i) => ({ ...i, unit_cost: showCost ? i.unit_cost : (i.unit_cost ?? 0) })) };
      return id ? api.put(`/quotes/${id}`, body) : api.post('/quotes', body);
    },
    onSuccess: (r: any) => { toast.success('Orçamento salvo.'); qc.invalidateQueries({ queryKey: ['/quotes'] }); navigate(`/app/orcamentos/${id ?? r.data.id}`); },
    onError: (e) => { if (e instanceof ApiError && e.fields) setErrors(e.fields); toast.error(e.message); },
  });
  if (id && existing.isLoading) return <PageLoader />;
  const set = (p: any) => setV((s: any) => ({ ...s, ...p }));
  return (
    <div>
      <PageHeader back={<Link to="/app/orcamentos" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"><ArrowLeft className="size-4" />Orçamentos</Link>}
        title={id ? `Editar orçamento #${existing.data?.number}` : 'Novo orçamento'} description="Inclua serviços, materiais e mão de obra. Os totais são calculados automaticamente." />
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Título" required className="sm:col-span-2" error={errors.title}><Input value={v.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Reforma do banheiro" invalid={!!errors.title} /></Field>
            <Field label="Cliente" className="sm:col-span-2"><EntitySelect endpoint="/customers/options" value={v.customer_id} onChange={(c) => set({ customer_id: c })} /></Field>
            <Field label="Emissão" required error={errors.issued_on}><Input type="date" value={v.issued_on} onChange={(e) => set({ issued_on: e.target.value })} /></Field>
            <Field label="Válido até" required error={errors.valid_until}><Input type="date" value={v.valid_until} onChange={(e) => set({ valid_until: e.target.value })} invalid={!!errors.valid_until} /></Field>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-display font-bold">Itens</h2>
            <ItemsEditor items={items} onChange={setItems} showCost={showCost} error={errors.items ?? Object.entries(errors).find(([k]) => k.startsWith('items.'))?.[1]} />
          </Card>
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Condições e termos" className="sm:col-span-2"><Textarea value={v.terms} onChange={(e) => set({ terms: e.target.value })} rows={3} /></Field>
            <Field label="Observações internas" className="sm:col-span-2" hint="Não aparecem na impressão"><Textarea value={v.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} /></Field>
          </Card>
        </div>
        <div>
          <Card className="sticky top-20 space-y-4 p-5">
            <Field label="Desconto geral" error={errors.discount}><MoneyInput value={v.discount} onChange={(d) => set({ discount: d })} /></Field>
            <Field label="Horas estimadas" hint="Compare depois com as horas reais na OS"><NumberInput value={v.estimated_hours} onChange={(h) => set({ estimated_hours: h })} step={0.5} /></Field>
            <div className="space-y-1.5 rounded-xl bg-ink-50 p-4 text-sm">
              <div className="flex justify-between"><span className="text-ink-600">Subtotal</span><span className="tabular">{formatBRL(t.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-ink-600">Desconto</span><span className="tabular">− {formatBRL(v.discount)}</span></div>
              <div className="flex items-baseline justify-between border-t border-ink-200 pt-2"><span className="font-semibold">Total</span><span className="font-display text-2xl font-extrabold tabular">{formatBRL(t.total)}</span></div>
              {showCost && <div className="flex justify-between pt-1 text-xs text-ink-500"><span>Custo estimado</span><span className="tabular">{formatBRL(t.cost)} · margem {t.total > 0 ? Math.round(((t.total - t.cost) / t.total) * 100) : 0}%</span></div>}
            </div>
            <Button variant="primary" size="lg" className="w-full" loading={save.isPending} onClick={() => { setErrors({}); save.mutate(); }}>Salvar orçamento</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function QuoteView() {
  const { id } = useParams();
  const can = useCan();
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [convert, setConvert] = useState<null | 'venda' | 'ordem_servico'>(null);
  const [pay, setPay] = useState({ payment_method: 'pix', payment_status: 'pendente', due_date: '' });
  const { data: q, isLoading, error, refetch } = useQuery({ queryKey: ['/quotes', 'detail', id], queryFn: () => api.get<{ data: any }>(`/quotes/${id}`).then((r) => r.data) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['/quotes'] });
  const status = useMutation({ mutationFn: (s: string) => api.patch(`/quotes/${id}/status`, { status: s }), onSuccess: () => { toast.success('Situação atualizada.'); refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const conv = useMutation({
    mutationFn: () => api.post(`/quotes/${id}/convert`, { target: convert, ...pay, due_date: pay.due_date || null }),
    onSuccess: (r: any) => { toast.success(r.data.target === 'venda' ? `Venda #${r.data.number} criada.` : `OS #${r.data.number} criada.`); qc.invalidateQueries(); navigate(r.data.target === 'venda' ? `/app/vendas/${r.data.id}` : `/app/ordens-servico/${r.data.id}`); },
    onError: (e: Error) => toast.error(e.message),
  });
  const dup = useMutation({ mutationFn: () => api.post(`/quotes/${id}/duplicate`), onSuccess: (r: any) => { toast.success(`Orçamento #${r.data.number} criado.`); refresh(); navigate(`/app/orcamentos/${r.data.id}/editar`); } });
  if (isLoading) return <PageLoader />;
  if (error || !q) return <ErrorState error={error} onRetry={() => refetch()} />;
  const w = can('orcamentos', 'write');
  const editable = ['rascunho', 'enviado', 'expirado'].includes(q.status);
  return (
    <div>
      <div className="no-print">
        <PageHeader back={<Link to="/app/orcamentos" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"><ArrowLeft className="size-4" />Orçamentos</Link>}
          title={<span className="flex items-center gap-3">Orçamento #{q.number}<StatusBadge status={q.status} labels={QUOTE_STATUS} /></span>}
          description={q.status === 'convertido' ? <>Convertido em {q.sale_number ? <Link className="text-brand-700 underline" to={`/app/vendas/${q.converted_sale_id}`}>venda #{q.sale_number}</Link> : <Link className="text-brand-700 underline" to={`/app/ordens-servico/${q.converted_work_order_id}`}>OS #{q.work_order_number}</Link>}</> : undefined}
          actions={<>
            <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir / PDF</Button>
            {w && <Button icon={<Copy className="size-4" />} onClick={() => dup.mutate()}>Duplicar</Button>}
            {w && editable && <Link to={`/app/orcamentos/${q.id}/editar`}><Button icon={<Pencil className="size-4" />}>Editar</Button></Link>}
            {w && q.status === 'rascunho' && <Button variant="brand" icon={<Send className="size-4" />} onClick={() => status.mutate('enviado')}>Marcar como enviado</Button>}
            {w && ['rascunho', 'enviado'].includes(q.status) && <Button icon={<ThumbsDown className="size-4" />} onClick={() => status.mutate('recusado')}>Recusado</Button>}
            {w && ['rascunho', 'enviado'].includes(q.status) && <Button variant="primary" icon={<ThumbsUp className="size-4" />} onClick={() => status.mutate('aprovado')}>Aprovado</Button>}
            {w && q.status === 'aprovado' && can('vendas', 'write') && <Button variant="primary" icon={<ShoppingCart className="size-4" />} onClick={() => setConvert('venda')}>Converter em venda</Button>}
            {w && q.status === 'aprovado' && can('ordens_servico', 'write') && <Button variant="brand" icon={<Wrench className="size-4" />} onClick={() => setConvert('ordem_servico')}>Gerar ordem de serviço</Button>}
            {w && !['aprovado', 'convertido'].includes(q.status) && <Button variant="ghost" className="text-red-600" icon={<Trash2 className="size-4" />} onClick={async () => {
              if (await confirm({ title: 'Excluir orçamento?', description: 'A exclusão é definitiva.', confirmLabel: 'Excluir' })) { try { await api.del(`/quotes/${q.id}`); toast.success('Orçamento excluído.'); refresh(); navigate('/app/orcamentos'); } catch (e: any) { toast.error(e.message); } }
            }}>Excluir</Button>}
          </>} />
        {q.status === 'expirado' && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Este orçamento passou da validade. Edite a data de validade para reenviá-lo.</p>}
      </div>
      <Card className="print-page mx-auto max-w-4xl p-8 sm:p-10">
        <div className="flex flex-col justify-between gap-6 border-b border-ink-200 pb-6 sm:flex-row">
          <div>
            <p className="font-display text-xl font-extrabold">{q.company.name}</p>
            <p className="mt-1 text-sm text-ink-500">{[q.company.document && formatDocument(q.company.document), q.company.phone && formatPhone(q.company.phone), q.company.email].filter(Boolean).join(' · ')}</p>
            <p className="text-sm text-ink-500">{[q.company.city, q.company.state].filter(Boolean).join(' - ')}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Orçamento</p>
            <p className="font-display text-3xl font-extrabold">#{q.number}</p>
            <p className="text-sm text-ink-500">Emitido em {formatDate(q.issued_on)} · válido até <b>{formatDate(q.valid_until)}</b></p>
          </div>
        </div>
        <div className="grid gap-4 py-6 sm:grid-cols-2">
          <div><p className="text-xs font-bold uppercase tracking-wider text-ink-400">Cliente</p><p className="mt-1 font-semibold">{q.customer_name ?? '—'}</p>
            <p className="text-sm text-ink-500">{[q.customer_document && formatDocument(q.customer_document), q.customer_phone && formatPhone(q.customer_phone), q.customer_email].filter(Boolean).join(' · ')}</p>
            {q.customer_address && <p className="text-sm text-ink-500">{q.customer_address}</p>}</div>
          <div><p className="text-xs font-bold uppercase tracking-wider text-ink-400">Referente a</p><p className="mt-1 font-semibold">{q.title}</p>{q.estimated_hours && <p className="text-sm text-ink-500">Tempo estimado: {formatNumber(q.estimated_hours)} h</p>}</div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-y border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500"><th className="py-2">Descrição</th><th className="py-2">Tipo</th><th className="py-2 text-right">Qtd.</th><th className="py-2 text-right">Valor un.</th><th className="py-2 text-right">Total</th></tr></thead>
          <tbody className="divide-y divide-ink-100">
            {q.items.map((i: any) => (
              <tr key={i.id}><td className="py-2.5 pr-2">{i.description}</td><td className="py-2.5 text-ink-500">{ITEM_KIND[i.kind as keyof typeof ITEM_KIND]}</td><td className="py-2.5 text-right tabular">{formatNumber(i.quantity)}</td>
                <td className="py-2.5 text-right tabular">{formatBRL(i.unit_price)}{i.discount > 0 && <span className="block text-xs text-ink-400">− {formatBRL(i.discount)}</span>}</td><td className="py-2.5 text-right font-medium tabular">{formatBRL(i.total)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto mt-4 max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-ink-600">Subtotal</span><span className="tabular">{formatBRL(q.subtotal)}</span></div>
          {q.discount > 0 && <div className="flex justify-between"><span className="text-ink-600">Desconto</span><span className="tabular">− {formatBRL(q.discount)}</span></div>}
          <div className="flex justify-between border-t-2 border-ink-900 pt-2 text-lg font-extrabold"><span>Total</span><span className="tabular">{formatBRL(q.total)}</span></div>
          {q.cost_total != null && <p className="no-print pt-1 text-right text-xs text-ink-500">Custo estimado {formatBRL(q.cost_total)} (interno)</p>}
        </div>
        {q.terms && <div className="mt-8 border-t border-ink-200 pt-4"><p className="text-xs font-bold uppercase tracking-wider text-ink-400">Condições</p><p className="mt-1 whitespace-pre-line text-sm text-ink-700">{q.terms}</p></div>}
        {q.notes && <div className="no-print mt-4 rounded-lg bg-ink-50 p-3 text-sm text-ink-600"><b>Observações internas:</b> {q.notes}</div>}
        <div className="mt-10 flex items-center justify-between text-xs text-ink-400"><span>Gerado por {me.user.name}</span><Logo size={18} /></div>
      </Card>
      <Dialog open={!!convert} onOpenChange={(o) => !o && setConvert(null)} title={convert === 'venda' ? 'Converter em venda' : 'Gerar ordem de serviço'} size="sm"
        description={convert === 'venda' ? 'Os produtos vinculados ao estoque serão baixados e a receita será lançada.' : 'Os itens do orçamento serão copiados para a nova OS.'}
        footer={<><Button onClick={() => setConvert(null)}>Cancelar</Button><Button variant="primary" loading={conv.isPending} onClick={() => conv.mutate()}>Confirmar</Button></>}>
        {convert === 'venda' ? (
          <div className="space-y-4">
            <Field label="Forma de pagamento"><Select value={pay.payment_method} onChange={(e) => setPay({ ...pay, payment_method: e.target.value, payment_status: e.target.value === 'a_prazo' ? 'pendente' : pay.payment_status })}>{Object.entries(PAYMENT_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Situação"><Select value={pay.payment_status} disabled={pay.payment_method === 'a_prazo'} onChange={(e) => setPay({ ...pay, payment_status: e.target.value })}><option value="pago">Recebido</option><option value="pendente">A receber</option></Select></Field>
            {pay.payment_status === 'pendente' && <Field label="Vencimento"><Input type="date" value={pay.due_date} onChange={(e) => setPay({ ...pay, due_date: e.target.value })} /></Field>}
          </div>
        ) : <p className="text-sm text-ink-600">Total: <b>{formatBRL(q.total)}</b>. A cobrança será feita ao faturar a OS.</p>}
      </Dialog>
    </div>
  );
}
