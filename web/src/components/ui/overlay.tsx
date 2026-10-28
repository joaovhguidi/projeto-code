import { createContext, useCallback, useContext, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertPrimitive from '@radix-ui/react-alert-dialog';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { AlertTriangle, MoreHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md' }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const w = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-950/40 backdrop-blur-[2px] animate-fade-in" />
        <DialogPrimitive.Content className={cn('fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white shadow-pop animate-slide-up focus:outline-none', w)}>
          <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-4">
            <div>
              <DialogPrimitive.Title className="font-display text-lg font-bold text-ink-950">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-0.5 text-sm text-ink-500">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{String(title)}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Fechar"><X className="size-4" /></DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto px-6 py-5 scrollbar-thin">{children}</div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-ink-100 px-6 py-3.5 sm:flex-row sm:justify-end">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Painel lateral para formulários (tela cheia no celular). */
export function Sheet({ open, onOpenChange, title, description, children, footer, wide }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-950/30 animate-fade-in" />
        <DialogPrimitive.Content className={cn('fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-pop animate-slide-in-right focus:outline-none', wide ? 'sm:max-w-3xl' : 'sm:max-w-xl')}>
          <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-display text-lg font-bold text-ink-950">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-0.5 text-sm text-ink-500">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">Formulário</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Fechar"><X className="size-4" /></DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">{children}</div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-ink-100 bg-ink-50/60 px-6 py-3.5 sm:flex-row sm:justify-end">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Confirmação de operações críticas: const confirm = useConfirm(); if (await confirm({...}))
// ---------------------------------------------------------------------------
interface ConfirmOptions { title: string; description?: React.ReactNode; confirmLabel?: string; tone?: 'danger' | 'brand'; requireText?: string }
const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState('');
  const resolver = useRef<(v: boolean) => void>(undefined);
  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o); setTyped('');
    return new Promise<boolean>((res) => { resolver.current = res; });
  }, []);
  const close = (v: boolean) => { resolver.current?.(v); setOpts(null); };
  const blocked = !!opts?.requireText && typed.trim().toLowerCase() !== opts.requireText.toLowerCase();
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <AlertPrimitive.Root open={!!opts} onOpenChange={(v) => !v && close(false)}>
        <AlertPrimitive.Portal>
          <AlertPrimitive.Overlay className="fixed inset-0 z-[60] bg-ink-950/40 animate-fade-in" />
          <AlertPrimitive.Content className="fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-pop animate-slide-up">
            <div className="flex gap-4">
              <div className={cn('grid size-10 shrink-0 place-items-center rounded-full', opts?.tone === 'brand' ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-600')}>
                <AlertTriangle className="size-5" />
              </div>
              <div className="min-w-0">
                <AlertPrimitive.Title className="font-display text-lg font-bold text-ink-950">{opts?.title}</AlertPrimitive.Title>
                <AlertPrimitive.Description asChild><div className="mt-1 text-sm text-ink-600">{opts?.description}</div></AlertPrimitive.Description>
                {opts?.requireText && (
                  <label className="mt-3 block text-sm text-ink-600">Digite <b>{opts.requireText}</b> para confirmar
                    <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-ink-200 px-3 focus:border-brand-500 focus:outline-none" />
                  </label>
                )}
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertPrimitive.Cancel asChild><Button variant="secondary">Voltar</Button></AlertPrimitive.Cancel>
              <Button variant={opts?.tone === 'brand' ? 'brand' : 'danger'} disabled={blocked} onClick={() => close(true)}>{opts?.confirmLabel ?? 'Confirmar'}</Button>
            </div>
          </AlertPrimitive.Content>
        </AlertPrimitive.Portal>
      </AlertPrimitive.Root>
    </ConfirmCtx.Provider>
  );
}

export function Menu({ items, label = 'Ações', trigger }: { items: unknown[]; label?: string; trigger?: React.ReactNode }) {
  const list = items.filter(Boolean) as { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }[];
  if (!list.length) return null;
  return (
    <DropdownPrimitive.Root modal={false}>
      <DropdownPrimitive.Trigger asChild>
        {trigger ?? <Button variant="ghost" size="icon" aria-label={label} onClick={(e) => e.stopPropagation()}><MoreHorizontal className="size-4" /></Button>}
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content align="end" sideOffset={4} className="z-[55] min-w-48 rounded-xl border border-ink-200 bg-white p-1 shadow-pop animate-fade-in" onClick={(e) => e.stopPropagation()}>
          {list.map((it) => (
            <DropdownPrimitive.Item key={it.label} disabled={it.disabled} onSelect={it.onSelect}
              className={cn('flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-ink-100 data-[disabled]:opacity-40',
                it.danger ? 'text-red-600 data-[highlighted]:bg-red-50' : 'text-ink-700')}>
              {it.icon}{it.label}
            </DropdownPrimitive.Item>
          ))}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}

export function Tabs({ value, onValueChange, tabs, children, className }: { value: string; onValueChange: (v: string) => void; tabs: { value: string; label: React.ReactNode; count?: number }[]; children?: React.ReactNode; className?: string }) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange} className={className}>
      <TabsPrimitive.List className="flex gap-1 overflow-x-auto border-b border-ink-200 scrollbar-thin" aria-label="Seções">
        {tabs.map((t) => (
          <TabsPrimitive.Trigger key={t.value} value={t.value}
            className="relative -mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800 data-[state=active]:border-brand-600 data-[state=active]:text-brand-800">
            {t.label}
            {t.count !== undefined && <span className="rounded-full bg-ink-100 px-1.5 text-[11px] font-semibold text-ink-600 tabular">{t.count}</span>}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}
export const TabPanel = ({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) => (
  <TabsPrimitive.Content value={value} className={cn('pt-5 focus:outline-none animate-fade-in', className)}>{children}</TabsPrimitive.Content>
);
