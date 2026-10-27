import { Plus, Trash2 } from 'lucide-react';
import { ITEM_KIND, formatBRL, lineTotal, toCents } from '@nexo/shared';
import { Button, EntitySelect, Input, MoneyInput, NumberInput, Select } from '@/components/ui';

export interface LineItem { kind: string; product_id?: string | null; service_id?: string | null; description: string; quantity: number; unit_cost: number; unit_price: number; discount: number }
export const emptyItem = (kind = 'servico'): LineItem => ({ kind, description: '', quantity: 1, unit_cost: 0, unit_price: 0, discount: 0 });

export function itemsTotals(items: LineItem[], discount = 0) {
  const sub = items.reduce((s, i) => s + toCents(lineTotal(i.quantity || 0, i.unit_price || 0, i.discount || 0)), 0);
  const cost = items.reduce((s, i) => s + toCents(lineTotal(i.quantity || 0, i.unit_cost || 0)), 0);
  return { subtotal: sub / 100, total: Math.max(0, sub - toCents(discount)) / 100, cost: cost / 100 };
}

/** Editor de itens de orçamento/OS: serviços, produtos, materiais e mão de obra com custo e preço. */
export function ItemsEditor({ items, onChange, showCost, error }: { items: LineItem[]; onChange: (i: LineItem[]) => void; showCost: boolean; error?: string }) {
  const upd = (idx: number, patch: Partial<LineItem>) => onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  return (
    <div>
      <div className="space-y-3">
        {items.map((it, idx) => (
          <div key={idx} className="rounded-xl border border-ink-200 bg-white p-3">
            <div className="grid gap-2 md:grid-cols-[150px_1fr_auto]">
              <Select value={it.kind} onChange={(e) => upd(idx, { kind: e.target.value, product_id: null, service_id: null })} aria-label="Tipo de item">
                {Object.entries(ITEM_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
              {it.kind === 'servico' ? (
                <EntitySelect endpoint="/services/options" value={it.service_id ?? null} placeholder="Buscar serviço cadastrado (opcional)"
                  onChange={(id, o) => upd(idx, { service_id: id, ...(o ? { description: o.name, unit_price: o.price, unit_cost: o.estimated_cost ?? 0 } : {}) })} />
              ) : it.kind === 'produto' || it.kind === 'material' ? (
                <EntitySelect endpoint="/products/options" value={it.product_id ?? null} placeholder="Buscar produto do estoque (opcional)"
                  onChange={(id, o) => upd(idx, { product_id: id, ...(o ? { description: o.name, unit_price: o.sale_price, unit_cost: o.cost_price ?? 0 } : {}) })} />
              ) : <div className="hidden md:block" />}
              <Button size="icon" variant="ghost" className="text-ink-400 hover:text-red-600" onClick={() => onChange(items.filter((_, i) => i !== idx))} aria-label="Remover item"><Trash2 className="size-4" /></Button>
            </div>
            <Input className="mt-2" placeholder="Descrição do item" value={it.description} onChange={(e) => upd(idx, { description: e.target.value })} aria-label="Descrição" />
            <div className={`mt-2 grid grid-cols-2 gap-2 ${showCost ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
              <label className="text-xs text-ink-500">Quantidade<NumberInput value={it.quantity} onChange={(v) => upd(idx, { quantity: v === '' ? 0 : v })} step={0.001} /></label>
              {showCost && <label className="text-xs text-ink-500">Custo un.<MoneyInput value={it.unit_cost} onChange={(v) => upd(idx, { unit_cost: v })} /></label>}
              <label className="text-xs text-ink-500">Preço un.<MoneyInput value={it.unit_price} onChange={(v) => upd(idx, { unit_price: v })} /></label>
              <label className="text-xs text-ink-500">Desconto<MoneyInput value={it.discount} onChange={(v) => upd(idx, { discount: v })} /></label>
              <div className="text-right text-xs text-ink-500">Total<p className="mt-2 font-display text-base font-bold tabular text-ink-900">{formatBRL(lineTotal(it.quantity || 0, it.unit_price || 0, it.discount || 0))}</p></div>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(ITEM_KIND).map(([k, l]) => <Button key={k} size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => onChange([...items, emptyItem(k)])}>{l}</Button>)}
      </div>
    </div>
  );
}
