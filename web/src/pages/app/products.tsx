import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDownUp, ArrowLeft, Package, Pencil } from 'lucide-react';
import { STOCK_MOVEMENT_TYPE, formatBRL, formatDate, formatDateTime, formatNumber, productSchema, stockMovementSchema } from '@nexo/shared';
import { api } from '@/lib/api';
import { useCan, useTimezone } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { ResourcePage } from '@/components/resource-page';
import { Badge, Button, Card, CardHeader, DataTable, EmptyState, ErrorState, KeyValue, PageHeader, PageLoader } from '@/components/ui';
import { FormSheet, type FieldDef } from '@/components/form/form';

export const PRODUCT_FIELDS = (creating: boolean, showCost: boolean): FieldDef[] => [
  { name: 'name', label: 'Nome do produto', required: true, span: 2, section: 'Identificação' },
  { name: 'sku', label: 'Código (SKU)' },
  { name: 'barcode', label: 'Código de barras' },
  { name: 'category', label: 'Categoria' },
  { name: 'unit', label: 'Unidade', type: 'select', options: { un: 'Unidade (un)', kg: 'Quilo (kg)', g: 'Grama (g)', l: 'Litro (l)', ml: 'Mililitro (ml)', m: 'Metro (m)', cx: 'Caixa (cx)', pct: 'Pacote (pct)' }, required: true },
  { name: 'supplier_id', label: 'Fornecedor principal', type: 'entity', endpoint: '/suppliers/options', span: 2 },
  ...(showCost ? [{ name: 'cost_price', label: 'Preço de compra (custo)', type: 'money', section: 'Preços e estoque' } as FieldDef] : []),
  { name: 'sale_price', label: 'Preço de venda', type: 'money', required: true, ...(showCost ? {} : { section: 'Preços e estoque' }) },
  ...(creating ? [{ name: 'initial_stock', label: 'Estoque inicial', type: 'number', step: 0.001, hint: 'Gera uma entrada no histórico' } as FieldDef] : []),
  { name: 'min_stock', label: 'Estoque mínimo', type: 'number', step: 0.001, hint: 'Abaixo disso, o sistema alerta' },
  { name: 'track_expiry', label: 'Controlar validade', type: 'switch', section: 'Validade' },
  { name: 'expiry_date', label: 'Data de validade', type: 'date', showIf: (v) => v.track_expiry },
  { name: 'active', label: 'Ativo para venda', type: 'switch' },
  { name: 'notes', label: 'Observações', type: 'textarea' },
];

const MOVE_FIELDS: FieldDef[] = [
  { name: 'product_id', label: 'Produto', type: 'entity', endpoint: '/products/options', required: true, span: 2 },
  { name: 'type', label: 'Tipo de movimentação', type: 'select', options: { entrada: 'Entrada (compra, devolução)', saida: 'Saída (uso interno, doação)', ajuste: 'Ajuste de inventário (informar saldo contado)' }, required: true, span: 2 },
  { name: 'quantity', label: 'Quantidade', type: 'number', step: 0.001, required: true, hint: 'No ajuste, informe o saldo real contado' },
  { name: 'unit_cost', label: 'Custo unitário', type: 'money', showIf: (v) => v.type === 'entrada', hint: 'Atualiza o custo do produto' },
  { name: 'reason', label: 'Motivo / observação', span: 2 },
];

export function StockMovementSheet({ open, onOpenChange, productId }: { open: boolean; onOpenChange: (v: boolean) => void; productId?: string }) {
  const tz = useTimezone();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (v: any) => api.post('/stock-movements', v),
    onSuccess: (r: any) => {
      toast.success(`Estoque atualizado. Saldo de ${r.data.name}: ${formatNumber(r.data.balance)}`);
      onOpenChange(false); qc.invalidateQueries({ queryKey: ['/products'] }); qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  return <FormSheet open={open} onOpenChange={onOpenChange} title="Movimentar estoque" description="Entradas, saídas e ajustes ficam registrados no histórico do produto."
    fields={MOVE_FIELDS} schema={stockMovementSchema} initial={{ product_id: productId ?? '', type: 'entrada', quantity: '' }} tz={tz} onSubmit={(v) => save.mutateAsync(v)} submitLabel="Registrar movimentação" />;
}

export function Products() {
  const can = useCan();
  const [sp, setSp] = useSearchParams();
  const [moving, setMoving] = useState<string | null>(null);
  useEffect(() => { if (sp.get('movimentar')) { setMoving(''); sp.delete('movimentar'); setSp(sp, { replace: true }); } }, [sp]); // eslint-disable-line
  const showCost = can('financeiro');
  const { data: cats } = useQuery({ queryKey: ['/products', 'categories'], queryFn: () => api.get<{ data: string[] }>('/products/categories') });
  return (
    <>
      <ResourcePage<any>
        title="Produtos e estoque" description="Cadastro, saldos, validade e movimentações." module="estoque" endpoint="/products" entity="produto" newLabel="Cadastrar produto"
        help={<><p>O saldo de estoque só muda por <b>movimentações</b>: vendas, compras recebidas, perdas, entradas, saídas e ajustes. Assim o histórico fica completo.</p><p>Defina o <b>estoque mínimo</b> para receber alertas de reposição.</p></>}
        softDelete defaultSort={{ key: 'name', dir: 'asc' }} detailPath={(r) => `/app/estoque/${r.id}`}
        headerExtra={can('estoque', 'write') && <Button icon={<ArrowDownUp className="size-4" />} onClick={() => setMoving('')}>Movimentar estoque</Button>}
        filters={[
          { key: 'status', label: 'Situação', options: { low: 'Estoque baixo', out: 'Em falta', expiring: 'Vencendo (30 dias)', inactive: 'Inativos' }, allLabel: 'Todas as situações' },
          ...(cats?.data?.length ? [{ key: 'category', label: 'Categoria', options: Object.fromEntries(cats.data.map((c) => [c, c])), allLabel: 'Todas as categorias' }] : []),
        ]}
        rowClassName={(r) => (r.is_out ? 'bg-red-50/40' : undefined)}
        empty={{ title: 'Nenhum produto cadastrado', description: 'Cadastre seus produtos com preço e estoque mínimo para controlar reposições.', icon: <Package className="size-6" /> }}
        columns={[
          { key: 'name', header: 'Produto', sortKey: 'name', primary: true, render: (r) => <div><p className="font-semibold text-ink-900">{r.name}</p><p className="text-xs text-ink-500">{[r.sku, r.category].filter(Boolean).join(' · ') || '—'}</p></div> },
          { key: 'stock_qty', header: 'Estoque', sortKey: 'stock_qty', align: 'right', render: (r) => (
            <span className={cn('font-semibold tabular', r.is_out ? 'text-red-600' : r.is_low ? 'text-amber-600' : 'text-ink-900')}>{formatNumber(r.stock_qty)} <span className="text-xs font-normal text-ink-500">{r.unit}</span></span>) },
          { key: 'min_stock', header: 'Mínimo', align: 'right', hideOnMobile: true, render: (r) => formatNumber(r.min_stock) },
          ...(showCost ? [{ key: 'cost_price', header: 'Custo', align: 'right' as const, hideOnMobile: true, render: (r: any) => <span className="tabular">{formatBRL(r.cost_price)}</span> }] : []),
          { key: 'sale_price', header: 'Preço', sortKey: 'sale_price', align: 'right', render: (r) => <span className="tabular font-medium">{formatBRL(r.sale_price)}</span> },
          { key: 'flags', header: 'Alertas', render: (r) => (
            <div className="flex flex-wrap gap-1">
              {r.is_out ? <Badge tone="danger">Em falta</Badge> : r.is_low ? <Badge tone="warning">Baixo</Badge> : null}
              {r.is_expiring && <Badge tone={r.expiry_date < new Date().toISOString().slice(0, 10) ? 'danger' : 'warning'}>Validade {formatDate(r.expiry_date)}</Badge>}
              {!r.active && <Badge>Inativo</Badge>}
              {!r.is_out && !r.is_low && !r.is_expiring && r.active && <span className="text-xs text-ink-400">—</span>}
            </div>) },
        ]}
        rowActions={(r) => [can('estoque', 'write') && { label: 'Movimentar estoque', icon: <ArrowDownUp className="size-4" />, onSelect: () => setMoving(r.id) }]}
        schema={productSchema}
        defaults={() => ({ unit: 'un', cost_price: 0, sale_price: 0, min_stock: 0, initial_stock: 0, active: true, track_expiry: false })}
        fields={PRODUCT_FIELDS(true, showCost)}
      />
      <StockMovementSheet open={moving !== null} onOpenChange={(v) => !v && setMoving(null)} productId={moving ?? undefined} />
    </>
  );
}

export function ProductDetail() {
  const { id } = useParams();
  const tz = useTimezone();
  const can = useCan();
  const qc = useQueryClient();
  const [moving, setMoving] = useState(false);
  const [editing, setEditing] = useState(false);
  const showCost = can('financeiro');
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['/products', 'detail', id], queryFn: () => api.get<{ data: any }>(`/products/${id}`).then((r) => r.data) });
  const save = useMutation({ mutationFn: (v: any) => api.put(`/products/${id}`, v), onSuccess: () => { toast.success('Produto atualizado.'); setEditing(false); qc.invalidateQueries({ queryKey: ['/products'] }); } });
  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const margin = data.cost_price != null && data.sale_price > 0 ? (data.sale_price - data.cost_price) / data.sale_price : null;
  return (
    <div>
      <PageHeader back={<Link to="/app/estoque" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"><ArrowLeft className="size-4" />Produtos</Link>}
        title={data.name} description={[data.sku && `SKU ${data.sku}`, data.category, data.supplier_name && `Fornecedor: ${data.supplier_name}`].filter(Boolean).join(' · ')}
        actions={can('estoque', 'write') && <>
          <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Editar</Button>
          <Button variant="primary" icon={<ArrowDownUp className="size-4" />} onClick={() => setMoving(true)}>Movimentar estoque</Button>
        </>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4"><p className="text-xs font-semibold text-ink-500">Estoque atual</p><p className={cn('mt-1 font-display text-2xl font-extrabold tabular', data.is_out ? 'text-red-600' : data.is_low ? 'text-amber-600' : '')}>{formatNumber(data.stock_qty)} <span className="text-sm font-medium text-ink-500">{data.unit}</span></p><p className="text-xs text-ink-500">Mínimo: {formatNumber(data.min_stock)}</p></Card>
        <Card className="p-4"><p className="text-xs font-semibold text-ink-500">Preço de venda</p><p className="mt-1 font-display text-2xl font-extrabold tabular">{formatBRL(data.sale_price)}</p>{showCost && <p className="text-xs text-ink-500">Custo {formatBRL(data.cost_price)}{margin !== null ? ` · margem ${Math.round(margin * 100)}%` : ''}</p>}</Card>
        <Card className="p-4"><p className="text-xs font-semibold text-ink-500">Vendido em 30 dias</p><p className="mt-1 font-display text-2xl font-extrabold tabular">{formatNumber(data.sold30?.qty)}</p><p className="text-xs text-ink-500">{formatBRL(data.sold30?.amount)}</p></Card>
        <Card className="p-4"><p className="text-xs font-semibold text-ink-500">Validade</p><p className="mt-1 font-display text-2xl font-extrabold">{data.track_expiry ? formatDate(data.expiry_date) : '—'}</p><p className="text-xs text-ink-500">{data.track_expiry ? (data.is_expiring ? 'Atenção: vence em até 30 dias' : 'Controlada') : 'Não controlada'}</p></Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Histórico de movimentações" description="Últimas 100 movimentações" />
          <DataTable<any> rows={data.movements} empty={<EmptyState compact title="Nenhuma movimentação" />}
            columns={[
              { key: 'created_at', header: 'Data', primary: true, render: (m) => formatDateTime(m.created_at, tz) },
              { key: 'type', header: 'Tipo', render: (m) => <Badge tone={m.quantity > 0 ? 'success' : 'warning'}>{STOCK_MOVEMENT_TYPE[m.type as keyof typeof STOCK_MOVEMENT_TYPE]}</Badge> },
              { key: 'quantity', header: 'Quantidade', align: 'right', render: (m) => <span className={cn('font-semibold tabular', m.quantity > 0 ? 'text-brand-700' : 'text-red-600')}>{m.quantity > 0 ? '+' : ''}{formatNumber(m.quantity)}</span> },
              { key: 'balance_after', header: 'Saldo', align: 'right', render: (m) => <span className="tabular">{formatNumber(m.balance_after)}</span> },
              { key: 'reason', header: 'Motivo', hideOnMobile: true, render: (m) => <span className="text-ink-600">{m.reason ?? '—'}</span> },
              { key: 'user_name', header: 'Usuário', hideOnMobile: true },
            ]} />
        </Card>
        <div className="space-y-4">
          <Card className="p-5"><KeyValue className="!grid-cols-1" items={[
            { label: 'Código de barras', value: data.barcode }, { label: 'Fornecedor', value: data.supplier_id ? <Link className="text-brand-700 hover:underline" to={`/app/fornecedores/${data.supplier_id}`}>{data.supplier_name}</Link> : '—' },
            { label: 'Última venda', value: data.last_sale_at ? formatDateTime(data.last_sale_at, tz) : 'Nunca vendido' }, { label: 'Observações', value: data.notes },
          ]} /></Card>
          {data.supplierQuotes?.length > 0 && (
            <Card><CardHeader title="Cotações de fornecedores" />
              <ul className="divide-y divide-ink-100 border-t border-ink-100">{data.supplierQuotes.map((q: any, i: number) => (
                <li key={i} className="flex justify-between px-5 py-2.5 text-sm"><span>{q.supplier_name}<span className="block text-xs text-ink-500">{formatDate(q.quoted_on)}</span></span><span className="font-semibold tabular">{formatBRL(q.price)}</span></li>))}</ul>
            </Card>)}
        </div>
      </div>
      <StockMovementSheet open={moving} onOpenChange={setMoving} productId={data.id} />
      <FormSheet open={editing} onOpenChange={setEditing} title="Editar produto" fields={PRODUCT_FIELDS(false, showCost)} schema={productSchema} initial={data} tz={tz} onSubmit={(v) => save.mutateAsync(v)} />
    </div>
  );
}
