import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChevronDown, Lightbulb, X } from 'lucide-react';
import { MODULES, type ModuleKey } from '@nexo/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge, Button } from '@/components/ui';

export interface Tip {
  key: string; fingerprint: string; kind: 'dados' | 'inicial'; priority: number; module: ModuleKey; title: string; reason: string; action: string; benefit: string;
  indicator?: { label: string; value: string }; resolveHref?: string; detailsHref?: string;
}

const priorityOf = (t: Tip) => (t.kind === 'inicial' ? null : t.priority < 200 ? 'alta' : t.priority < 400 ? 'media' : 'baixa');

export function TipCard({ tip, compact }: { tip: Tip; compact?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(!compact);
  const act = useMutation({
    mutationFn: (status: 'concluida' | 'dispensada') => api.post('/tips/state', { key: tip.key, fingerprint: tip.fingerprint, title: tip.title, status }),
    onSuccess: (_d, status) => {
      toast.success(status === 'concluida' ? 'Dica marcada como concluída.' : 'Dica dispensada. Ela não será repetida tão cedo.');
      qc.invalidateQueries({ queryKey: ['tips'] }); qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const pr = priorityOf(tip);
  const resolve = tip.resolveHref ?? (tip.module && MODULES[tip.module] ? MODULES[tip.module].path : undefined);
  return (
    <article className={cn('rounded-xl border p-4 transition-shadow hover:shadow-card', tip.kind === 'inicial' ? 'border-dashed border-ink-300 bg-white' : pr === 'alta' ? 'border-red-200 bg-red-50/30' : 'border-ink-200 bg-white')}>
      <div className="flex items-start gap-3">
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', tip.kind === 'inicial' ? 'bg-ink-100 text-ink-500' : 'bg-accent-200 text-brand-900')}><Lightbulb className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {tip.kind === 'inicial' ? <Badge>Sugestão inicial</Badge> : <Badge tone={pr === 'alta' ? 'danger' : pr === 'media' ? 'warning' : 'info'}>Prioridade {pr}</Badge>}
            {MODULES[tip.module] && <span className="text-xs text-ink-400">{MODULES[tip.module].label}</span>}
          </div>
          <h3 className="mt-1.5 font-semibold leading-snug text-ink-900">{tip.title}</h3>
          {tip.indicator && (
            <p className="mt-1.5 inline-flex items-baseline gap-1.5 rounded-md bg-ink-100 px-2 py-0.5 text-xs text-ink-600">{tip.indicator.label}: <b className="font-display text-sm text-ink-900 tabular">{tip.indicator.value}</b></p>
          )}
          {open && (
            <dl className="mt-3 space-y-2 text-sm animate-fade-in">
              <div><dt className="font-semibold text-ink-800">Motivo</dt><dd className="text-ink-600">{tip.reason}</dd></div>
              <div><dt className="font-semibold text-ink-800">Ação recomendada</dt><dd className="text-ink-600">{tip.action}</dd></div>
              <div><dt className="font-semibold text-ink-800">Benefício esperado</dt><dd className="text-ink-600">{tip.benefit}</dd></div>
            </dl>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {resolve && <Link to={resolve}><Button size="sm" variant="brand">Resolver agora</Button></Link>}
            {compact ? <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? 'Menos detalhes' : 'Ver detalhes'}<ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} /></Button>
              : tip.detailsHref && <Link to={tip.detailsHref}><Button size="sm" variant="secondary">Ver detalhes</Button></Link>}
            <Button size="sm" variant="ghost" icon={<Check className="size-3.5" />} loading={act.isPending && act.variables === 'concluida'} onClick={() => act.mutate('concluida')}>Marcar como concluída</Button>
            <Button size="sm" variant="ghost" className="text-ink-500" icon={<X className="size-3.5" />} onClick={() => act.mutate('dispensada')} aria-label="Dispensar dica">Dispensar</Button>
          </div>
        </div>
      </div>
    </article>
  );
}
