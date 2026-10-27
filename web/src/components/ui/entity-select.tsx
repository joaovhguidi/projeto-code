import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, Plus, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface Option { id: string; label: string; [k: string]: any }

/**
 * Seleção pesquisável de registros (clientes, produtos, etc.).
 * Busca no servidor via /<endpoint>/options?q= e permite navegação por teclado.
 */
export function EntitySelect({ endpoint, value, onChange, placeholder = 'Selecione…', invalid, id, disabled, extraParams, onCreate, createLabel, initialLabel, clearable = true }: {
  endpoint: string; value: string | null | undefined; onChange: (id: string | null, option?: Option) => void; placeholder?: string; invalid?: boolean; id?: string; disabled?: boolean;
  extraParams?: string; onCreate?: (search: string) => void; createLabel?: string; initialLabel?: string; clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<Option | null>(null);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(search), 200); return () => clearTimeout(t); }, [search]);
  const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}q=${encodeURIComponent(debounced)}${extraParams ? `&${extraParams}` : ''}`;
  const { data, isFetching } = useQuery({ queryKey: ['options', url], queryFn: () => api.get<{ data: Option[] }>(url), enabled: open, staleTime: 15_000 });
  const options = data?.data ?? [];
  // rótulo do valor atual quando aberto em modo de edição
  const { data: current } = useQuery({
    queryKey: ['option-label', endpoint, value],
    queryFn: async () => (await api.get<{ data: Option[] }>(`${endpoint}${endpoint.includes('?') ? '&' : '?'}id=${value}&archived=all`)).data.find((o) => o.id === value) ?? null,
    enabled: !!value && !initialLabel && selected?.id !== value,
    staleTime: 60_000,
  });
  const label = useMemo(() => (selected?.id === value ? selected?.label : null) ?? initialLabel ?? current?.label ?? (value ? '…' : ''), [selected, value, initialLabel, current]);

  const choose = (o: Option) => { setSelected(o); onChange(o.id, o); setOpen(false); setSearch(''); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter' && options[active]) { e.preventDefault(); choose(options[active]); }
  };
  useEffect(() => setActive(0), [debounced]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(v) => { setOpen(v); if (v) setTimeout(() => inputRef.current?.focus(), 0); }}>
      <div className="relative">
        <PopoverPrimitive.Trigger asChild disabled={disabled}>
          <button id={id} type="button" role="combobox" aria-expanded={open} aria-controls={listId} aria-invalid={invalid || undefined}
            className={cn('flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-left text-sm transition-colors focus:outline-none focus:ring-3 focus:ring-brand-500/15 focus:border-brand-500 disabled:bg-ink-50',
              invalid ? 'border-red-400' : 'border-ink-200 hover:border-ink-300')}>
            <span className={cn('truncate', !value && 'text-ink-400')}>{value ? label : placeholder}</span>
            <ChevronDown className="size-4 shrink-0 text-ink-400" />
          </button>
        </PopoverPrimitive.Trigger>
        {clearable && value && !disabled && (
          <button type="button" onClick={() => { setSelected(null); onChange(null); }} className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700" aria-label="Limpar seleção">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content align="start" sideOffset={4} className="z-[60] w-[var(--radix-popover-trigger-width)] min-w-64 rounded-xl border border-ink-200 bg-white shadow-pop animate-fade-in">
          <div className="flex items-center gap-2 border-b border-ink-100 px-3">
            <Search className="size-4 text-ink-400" />
            <input ref={inputRef} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={onKey} placeholder="Digite para buscar…"
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-ink-400" aria-label="Buscar" aria-controls={listId} />
            {isFetching && <Loader2 className="size-4 animate-spin text-ink-400" />}
          </div>
          <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1 scrollbar-thin">
            {options.map((o, i) => (
              <li key={o.id} role="option" aria-selected={o.id === value}
                onMouseEnter={() => setActive(i)} onClick={() => choose(o)}
                className={cn('flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm', i === active ? 'bg-brand-50 text-brand-900' : 'text-ink-700')}>
                <span className="truncate">{o.label}</span>
                {o.id === value && <Check className="size-4 text-brand-600" />}
              </li>
            ))}
            {!options.length && !isFetching && <li className="px-3 py-6 text-center text-sm text-ink-500">Nenhum resultado{search ? ` para "${search}"` : ''}.</li>}
          </ul>
          {onCreate && (
            <button type="button" onClick={() => { setOpen(false); onCreate(search); }}
              className="flex w-full items-center gap-2 border-t border-ink-100 px-3 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50">
              <Plus className="size-4" />{createLabel ?? 'Cadastrar novo'}{search ? ` "${search}"` : ''}
            </button>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
