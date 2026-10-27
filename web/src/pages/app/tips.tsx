import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { History, Lightbulb, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { relativeTime } from '@/lib/utils';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, PageLoader } from '@/components/ui';
import { TipCard, type Tip } from '@/components/tip-card';
import { DIFFICULTIES, GOALS } from '@nexo/shared';

export default function Tips() {
  const me = useMe();
  const qc = useQueryClient();
  const tips = useQuery({ queryKey: ['tips'], queryFn: () => api.get<{ data: Tip[] }>('/tips').then((r) => r.data) });
  const history = useQuery({ queryKey: ['tips', 'history'], queryFn: () => api.get<{ data: any[] }>('/tips/history').then((r) => r.data) });
  const reactivate = useMutation({
    mutationFn: (id: string) => api.del(`/tips/history/${id}`),
    onSuccess: () => { toast.success('Dica reativada.'); qc.invalidateQueries({ queryKey: ['tips'] }); },
  });
  if (tips.isLoading) return <PageLoader />;
  if (tips.error) return <ErrorState error={tips.error} onRetry={() => tips.refetch()} />;
  const list = tips.data ?? [];
  const data = list.filter((t) => t.kind === 'dados');
  const starter = list.filter((t) => t.kind === 'inicial');
  const c = me.company;
  return (
    <div>
      <PageHeader title="Dicas para meu negócio" description="Recomendações práticas a partir do seu segmento, objetivos e dos dados registrados."
        help={<><p>As dicas são geradas por regras que analisam seus dados reais. Elas nunca inventam números: quando não há dados suficientes, aparecem <b>sugestões iniciais</b>, identificadas como tal.</p><p>Ao marcar como concluída ou dispensar, a dica só volta se a situação mudar (e dispensadas não voltam por 14 dias).</p></>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold"><Lightbulb className="size-5 text-brand-600" />Baseadas nos seus dados <Badge>{data.length}</Badge></h2>
            {data.length ? <div className="space-y-3">{data.map((t) => <TipCard key={t.key} tip={t} />)}</div>
              : <Card><EmptyState compact title="Nenhuma recomendação a partir dos dados agora" description="Continue registrando vendas, agenda e financeiro. Quando houver algo que mereça atenção, aparecerá aqui." /></Card>}
          </section>
          {starter.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-lg font-bold">Sugestões iniciais</h2>
              <p className="mb-3 text-sm text-ink-500">Orientações gerais para o seu tipo de negócio, enquanto ainda não há dados suficientes.</p>
              <div className="space-y-3">{starter.map((t) => <TipCard key={t.key} tip={t} />)}</div>
            </section>
          )}
        </div>
        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Considerando</p>
            <p className="mt-2 text-sm"><b>Segmento:</b> {c.segment_key === 'outro' ? c.custom_segment : me.segment.name}</p>
            {c.goals?.length > 0 && <p className="mt-2 text-sm"><b>Objetivos:</b> {c.goals.map((g: string) => GOALS[g as keyof typeof GOALS]).join(', ')}</p>}
            {c.difficulties?.length > 0 && <p className="mt-2 text-sm"><b>Dificuldades:</b> {c.difficulties.map((d: string) => DIFFICULTIES[d as keyof typeof DIFFICULTIES]).join(', ')}</p>}
            <p className="mt-3 text-xs text-ink-500">Atualize essas informações em Configurações → Empresa.</p>
          </Card>
          <Card>
            <CardHeader title="Histórico" icon={<History className="size-4" />} description="Dicas concluídas e dispensadas" />
            {history.data?.length ? (
              <ul className="divide-y divide-ink-100 border-t border-ink-100">
                {history.data.map((h) => (
                  <li key={h.id} className="flex items-start gap-2 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink-800">{h.title}</p>
                      <p className="text-xs text-ink-500">{h.status === 'concluida' ? 'Concluída' : 'Dispensada'} por {h.user_name ?? '—'} · {relativeTime(h.created_at)}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="size-7" aria-label="Reativar dica" onClick={() => reactivate.mutate(h.id)}><RotateCcw className="size-3.5" /></Button>
                  </li>
                ))}
              </ul>
            ) : <EmptyState compact title="Sem histórico ainda" />}
          </Card>
        </div>
      </div>
    </div>
  );
}
