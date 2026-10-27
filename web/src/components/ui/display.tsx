import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, RefreshCw } from 'lucide-react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { HelpCircle } from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { Button } from './button';

export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...p}>{children}</div>;
}

export function CardHeader({ title, description, action, icon, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="flex items-start gap-2.5 min-w-0">
        {icon && <span className="mt-0.5 text-brand-700">{icon}</span>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-ink-900 leading-tight">{title}</h3>
          {description && <p className="text-xs text-ink-500 mt-0.5">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'violet';
const tones: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  accent: 'bg-accent-200 text-ink-900 ring-accent-400/60',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};
export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}
export type { Tone };

const STATUS_TONES: Record<string, Tone> = {
  agendado: 'info', confirmado: 'brand', concluido: 'success', concluida: 'success', cancelado: 'neutral', cancelada: 'neutral', falta: 'danger',
  pendente: 'warning', parcial: 'info', pago: 'success', atrasado: 'danger',
  rascunho: 'neutral', enviado: 'info', aprovado: 'success', recusado: 'danger', expirado: 'neutral', convertido: 'brand',
  aberta: 'warning', em_andamento: 'info', aguardando_pecas: 'violet', entregue: 'success', bloqueada: 'danger',
  aguardando: 'neutral', em_preparacao: 'info', saiu_para_entrega: 'violet', problema: 'danger',
  ativo: 'success', ferias: 'info', afastado: 'warning', desligado: 'neutral', novo: 'info', vip: 'accent', em_risco: 'warning', inativo: 'neutral',
  operando: 'success', com_defeito: 'danger', em_manutencao: 'warning', desativado: 'neutral',
  resolvida: 'success', em_analise: 'info', arquivada: 'neutral', planejada: 'neutral', ativa: 'success', encerrada: 'neutral',
  pedido: 'info', recebido: 'success', aprovada: 'success', recusada: 'danger',
  baixa: 'neutral', media: 'info', alta: 'warning', urgente: 'danger',
};
export function StatusBadge({ status, labels, className }: { status: string; labels: Record<string, string>; className?: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'neutral'} dot className={className}>{labels[status] ?? status}</Badge>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function Spinner({ className, label = 'Carregando' }: { className?: string; label?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-brand-600', className)} aria-label={label} />;
}

export function PageLoader() {
  return (
    <div className="space-y-4 animate-fade-in" aria-busy aria-label="Carregando">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className, compact }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-8 px-4' : 'py-14 px-6', className)}>
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">{icon ?? <Inbox className="size-6" />}</div>
      <h3 className="font-display text-base font-bold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const msg = error instanceof Error ? error.message : 'Não foi possível carregar os dados.';
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)} role="alert">
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-red-50 text-red-600"><AlertTriangle className="size-6" /></div>
      <h3 className="font-display font-bold text-ink-900">Algo deu errado</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{msg}</p>
      {onRetry && <Button className="mt-4" size="sm" icon={<RefreshCw className="size-4" />} onClick={onRetry}>Tentar novamente</Button>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total > 0 ? <p className="px-4 py-3 text-xs text-ink-500">{total} registro{total > 1 ? 's' : ''}</p> : null;
  const from = (page - 1) * pageSize + 1, to = Math.min(total, page * pageSize);
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-ink-100 px-4 py-3" aria-label="Paginação">
      <p className="text-xs text-ink-500 tabular">{from}–{to} de {total}</p>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Página anterior"><ChevronLeft className="size-4" /></Button>
        <span className="px-2 text-xs font-medium text-ink-700 tabular">{page} / {pages}</span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Próxima página"><ChevronRight className="size-4" /></Button>
      </div>
    </nav>
  );
}

export function Avatar({ name, color, size = 32, className }: { name?: string | null; color?: string | null; size?: number; className?: string }) {
  return (
    <span className={cn('inline-grid shrink-0 place-items-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: color ?? 'var(--color-brand-700)' }} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function Tooltip({ content, children, side = 'top' }: { content: React.ReactNode; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-[70] max-w-xs rounded-md bg-ink-900 px-2.5 py-1.5 text-xs text-white shadow-pop animate-fade-in">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/** Ajuda contextual: explica o que a tela faz em linguagem simples. */
export function HelpTip({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button type="button" className="inline-grid size-7 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-brand-700" aria-label="Ajuda sobre esta tela">
          <HelpCircle className="size-4" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content sideOffset={6} align="start" className="z-[70] w-80 rounded-xl border border-ink-200 bg-white p-4 text-sm text-ink-700 shadow-pop animate-slide-up">
          {title && <p className="mb-1.5 font-display font-bold text-ink-900">{title}</p>}
          <div className="space-y-2 leading-relaxed">{children}</div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function PageHeader({ title, description, actions, help, back }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; help?: React.ReactNode; back?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-fade-in">
      <div className="min-w-0">
        {back}
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-extrabold text-ink-950 sm:text-[28px] leading-tight">{title}</h1>
          {help && <HelpTip title={typeof title === 'string' ? title : undefined}>{help}</HelpTip>}
        </div>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ProgressBar({ value, tone = 'brand', className }: { value: number; tone?: 'brand' | 'warning' | 'danger'; className?: string }) {
  const color = tone === 'danger' ? 'bg-red-500' : tone === 'warning' ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-ink-100', className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

export function KeyValue({ items, className }: { items: { label: string; value: React.ReactNode; full?: boolean }[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2', className)}>
      {items.map((it) => (
        <div key={it.label} className={cn('min-w-0', it.full && 'sm:col-span-2')}>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{it.label}</dt>
          <dd className="mt-0.5 text-sm text-ink-800 break-words">{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
