import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Factory, PackageCheck, Plus, Trash2 } from 'lucide-react';
import { PAYMENT_METHODS, PURCHASE_STATUS, formatBRL, formatDate, formatPhone, lineTotal, supplierQuoteSchema, supplierSchema, todayIn, addDays } from '@nexo/shared';
import { api } from '@/lib/api';
import { useCan, useTimezone } from '@/lib/auth';
import { ResourcePage } from '@/components/resource-page';
import { Badge, Button, Card, CardHeader, Dialog, EmptyState, EntitySelect, ErrorState, Field, Input, KeyValue, MoneyInput, NumberInput, PageHeader, PageLoader, Rating, Select, StatusBadge, useConfirm } from '@/components/ui';
import { FormSheet, type FieldDef } from '@/components/form/form';

const FIELDS: FieldDef[] = [
  { name: 'name', label: 'Nome / razão social', required: true, span: 2 }, { name: 'contact_name', label: 'Contato' }, { name: 'phone', label: 'Telefone', type: 'tel' },
  { name: 'email', label: 'E-mail', type: 'email' }, { name: 'document', label: 'CNPJ/CPF', type: 'document' }, { name: 'category', label: 'Categoria' },
  { name: 'lead_time_days', label: 'Prazo médio de entrega (dias)', type: 'number' }, { name: 'address', label: 'Endereço', span: 2 },
  { name: 'products_supplied', label: 'Produtos fornecidos', type: 'textarea' }, { name: 'quality_rating', label: 'Qualidade', type: 'rating' }, { name: 'reliability_rating', label: 'Confiabilidade', type: 'rating' },
  { name: 'notes', label: 'Observações', type: 'textarea' },
];

export function Suppliers() {
  return (
    <ResourcePage<any> title="Fornecedores" description="Contatos, cotações, histórico de compras e avaliação." module="fornecedores" endpoint="/suppliers" entity="fornecedor" newLabel="Novo fornecedor" softDelete
      defaultSort={{ key: 'name', dir: 'asc' }} detailPath={(r) => `/app/fornecedores/${r.id}`}
      empty={{ title: 'Nenhum fornecedor', icon: <Factory className="size-6" /> }}
      columns={[
        { key: 'name', header: 'Fornecedor', sortKey: 'name', primary: true, render: (r) => <div><p className="font-semibold">{r.name}</p><p className="text-xs text-ink-500">{r.category ?? ''}</p></div> },
        { key: 'contact', header: 'Contato', render: (r) => <div><p>{r.contact_name ?? '—'}</p><p className="text-xs text-ink-500">{formatPhone(r.phone)}</p></div> },
        { key: 'lead_time_days', header: 'Prazo', hideOnMobile: true, render: (r) => (r.lead_time_days != null ? `${r.lead_time_days} dias` : '—') },
        { key: 'quality_rating', header: 'Qualidade', sortKey: 'quality_rating', render: (r) => <Rating value={r.quality_rating} readOnly size={13} /> },
        { key: 'reliability_rating', header: 'Confiabilidade', sortKey: 'reliability_rating', hideOnMobile: true, render: (r) => <Rating value={r.reliability_rating} readOnly size={13} /> },
        { key: 'last_purchase_on', header: 'Última compra', sortKey: 'last_purchase_on', render: (r) => formatDate(r.last_purchase_on) },
      ]}
      schema={supplierSchema} fields={FIELDS} />
  );
}

function PurchaseDialog({ supplierId, open, onClose }: { supplierId: string; open: boolean; onClose: () => void }) {
  const tz = useTimezone();
  const qc = useQueryClient();
  const [v, setV] = useState({ ordered_on: todayIn(tz), expected_on: '', notes: '' });
  const [items, setItems] = useState<any[]>([{ product_id: null, description: '', quantity: 1, unit_cost: 0 }]);
  const save = useMutation({
    mutationFn: () => api.post('/purchases', { supplier_id: supplierId, ...v, expected_on: v.expected_on || null, items }),
    onSuccess: () => { toast.success('Pedido de compra registrado.'); qc.invalidateQueries({ queryKey: ['/suppliers'] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const total = items.reduce((s, i) => s + lineTotal(i.quantity || 0, i.unit_cost || 0), 0);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Novo pedido de compra" size="lg" description="Ao receber, o estoque é atualizado e a despesa é lançada."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Registrar pedido · {formatBRL(total)}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Data do pedido"><Input type="date" value={v.ordered_on} onChange={(e) => setV({ ...v, ordered_on: e.target.value })} /></Field>
        <Field label="Entrega prevista"><Input type="date" value={v.expected_on} onChange={(e) => setV({ ...v, expected_on: e.target.value })} /></Field>
      </div>
      <div className="mt-4 space-y-2">
        {items.map((it, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-ink-200 p-2 sm:grid-cols-[1.4fr_1fr_90px_130px_auto]">
            <EntitySelect endpoint="/products/options" value={it.product_id} placeholder="Produto (opcional)" onChange={(id, o) => setItems(items.map((x, j) => (j === i ? { ...x, product_id: id, ...(o ? { description: o.name, unit_cost: o.cost_price ?? 0 } : {}) } : x)))} />
            <Input value={it.description} placeholder="Descrição" onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
            <NumberInput value={it.quantity} step={0.001} onChange={(q) => setItems(items.map((x, j) => (j === i ? { ...x, quantity: q === '' ? 0 : q } : x)))} />
            <MoneyInput value={it.unit_cost} onChange={(c) => setItems(items.map((x, j) => (j === i ? { ...x, unit_cost: c } : x)))} />
            <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remover"><Trash2 className="size-4" /></Button>
          </div>
        ))}
        <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setItems([...items, { product_id: null, description: '', quantity: 1, unit_cost: 0 }])}>Adicionar item</Button>
      </div>
    </Dialog>
  );
}

export function SupplierDetail() {
  const { id } = useParams();
  const tz = useTimezone();
  const can = useCan();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [quote, setQuote] = useState(false);
  const [purchase, setPurchase] = useState(false);
  const [receive, setReceive] = useState<any>(null);
  const [rv, setRv] = useState({ received_on: todayIn(tz), due_date: addDays(todayIn(tz), 30), payment_method: 'boleto', paid: false });
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['/suppliers', 'detail', id], queryFn: () => api.get<{ data: any }>(`/suppliers/${id}`).then((r) => r.data) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['/suppliers'] });
  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const w = can('fornecedores', 'write');
  return (
    <div>
      <PageHeader back={<Link to="/app/fornecedores" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"><ArrowLeft className="size-4" />Fornecedores</Link>}
        title={data.name} description={data.category}
        actions={w && <><Button onClick={() => setEditing(true)}>Editar</Button><Button onClick={() => setQuote(true)}>Registrar cotação</Button><Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setPurchase(true)}>Pedido de compra</Button></>} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit p-5"><KeyValue className="!grid-cols-1" items={[
          { label: 'Contato', value: data.contact_name }, { label: 'Telefone', value: formatPhone(data.phone) }, { label: 'E-mail', value: data.email },
          { label: 'Prazo médio', value: data.lead_time_days != null ? `${data.lead_time_days} dias` : '—' },
          { label: 'Pontualidade (compras recebidas)', value: data.onTimeRate !== null ? `${Math.round(data.onTimeRate * 100)}% no prazo` : 'Sem histórico' },
          { label: 'Qualidade', value: <Rating value={data.quality_rating} readOnly size={14} /> }, { label: 'Confiabilidade', value: <Rating value={data.reliability_rating} readOnly size={14} /> },
          { label: 'Produtos fornecidos', value: data.products_supplied },
        ]} /></Card>
        <div className="space-y-4">
          <Card><CardHeader title="Histórico de compras" />
            {data.purchases.length ? <ul className="divide-y divide-ink-100 border-t border-ink-100">{data.purchases.map((p: any) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span>Pedido de {formatDate(p.ordered_on)}{p.expected_on ? ` · previsto ${formatDate(p.expected_on)}` : ''}{p.received_on ? ` · recebido ${formatDate(p.received_on)}` : ''}{p.delivered_on_time === false && <Badge tone="warning" className="ml-2">Atrasou</Badge>}</span>
                <span className="flex items-center gap-2"><b className="tabular">{formatBRL(p.total)}</b><StatusBadge status={p.status} labels={PURCHASE_STATUS} />
                  {w && p.status === 'pedido' && <><Button size="xs" variant="brand" icon={<PackageCheck className="size-3.5" />} onClick={() => setReceive(p)}>Receber</Button>
                    <Button size="xs" variant="ghost" onClick={async () => { if (await confirm({ title: 'Cancelar pedido?', confirmLabel: 'Cancelar pedido' })) { try { await api.post(`/purchases/${p.id}/cancel`); refresh(); } catch (e: any) { toast.error(e.message); } } }}>Cancelar</Button></>}</span>
              </li>))}</ul> : <EmptyState compact title="Nenhuma compra registrada" />}
          </Card>
          <Card><CardHeader title="Cotações" />
            {data.quotes.length ? <ul className="divide-y divide-ink-100 border-t border-ink-100">{data.quotes.map((q: any) => (
              <li key={q.id} className="flex justify-between px-5 py-2.5 text-sm"><span>{q.description}{q.product_name ? ` (${q.product_name})` : ''}<span className="block text-xs text-ink-500">{formatDate(q.quoted_on)}{q.valid_until ? ` · válida até ${formatDate(q.valid_until)}` : ''}</span></span><b className="tabular">{formatBRL(q.price)}</b></li>))}</ul>
              : <EmptyState compact title="Nenhuma cotação" />}
          </Card>
        </div>
      </div>
      <FormSheet open={editing} onOpenChange={setEditing} title="Editar fornecedor" fields={FIELDS} schema={supplierSchema} initial={data} tz={tz}
        onSubmit={async (v) => { await api.put(`/suppliers/${id}`, v); toast.success('Fornecedor atualizado.'); setEditing(false); refresh(); }} />
      <FormSheet open={quote} onOpenChange={setQuote} title="Registrar cotação" schema={supplierQuoteSchema} tz={tz} initial={{ supplier_id: id, quoted_on: todayIn(tz), price: 0 }}
        fields={[{ name: 'product_id', label: 'Produto', type: 'entity', endpoint: '/products/options', span: 2, onChangeEffect: (_v, f, o) => o && f.setValue('description', o.name) }, { name: 'description', label: 'Descrição', required: true, span: 2 },
          { name: 'price', label: 'Preço cotado', type: 'money', required: true }, { name: 'quoted_on', label: 'Data', type: 'date', required: true }, { name: 'valid_until', label: 'Válida até', type: 'date' }, { name: 'notes', label: 'Observações', type: 'textarea' }]}
        onSubmit={async (v) => { await api.post('/supplier-quotes', { ...v, supplier_id: id }); toast.success('Cotação registrada.'); setQuote(false); refresh(); }} />
      <PurchaseDialog supplierId={id!} open={purchase} onClose={() => setPurchase(false)} />
      <Dialog open={!!receive} onOpenChange={(o) => !o && setReceive(null)} title="Receber compra" size="sm" description="Dá entrada no estoque dos produtos vinculados e lança a despesa."
        footer={<><Button onClick={() => setReceive(null)}>Cancelar</Button><Button variant="primary" onClick={async () => { try { await api.post(`/purchases/${receive.id}/receive`, rv); toast.success('Compra recebida.'); setReceive(null); qc.invalidateQueries(); } catch (e: any) { toast.error(e.message); } }}>Confirmar recebimento</Button></>}>
        <div className="space-y-3">
          <Field label="Recebido em"><Input type="date" value={rv.received_on} onChange={(e) => setRv({ ...rv, received_on: e.target.value })} /></Field>
          <Field label="Vencimento do pagamento"><Input type="date" value={rv.due_date} onChange={(e) => setRv({ ...rv, due_date: e.target.value })} /></Field>
          <Field label="Forma de pagamento"><Select value={rv.payment_method} onChange={(e) => setRv({ ...rv, payment_method: e.target.value })}>{Object.entries(PAYMENT_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rv.paid} onChange={(e) => setRv({ ...rv, paid: e.target.checked })} className="accent-brand-600" />Já foi pago</label>
        </div>
      </Dialog>
    </div>
  );
}
