import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertOctagon, AlertTriangle, ArrowDown, ArrowRight, ArrowUp, CalendarClock, Eye, EyeOff, Info, LayoutGrid, ListTodo, Star, Truck, Zap, History, Lightbulb, TrendingDown, TrendingUp } from 'lucide-react';
import { CHART_CATALOG, DASHBOARD_CARDS, MODULES, PRIORITY, QUICK_ACTIONS, formatBRL, formatDate, formatNumber, formatPercent, formatTime, type ModuleKey } from '@nexo/shared';
import { api } from '@/lib/api';
import { useCan, useMe, useRefreshMe } from '@/lib/auth';
import { Icon } from '@/lib/icons';
import { cn, greeting, relativeTime } from '@/lib/utils';
import { Avatar, Badge, Button, Card, CardHeader, Dialog, EmptyState, ErrorState, PageLoader, StatusBadge } from '@/components/ui';
import { AppointmentsWeekChart, DonutChart, HBarChart, RevenueExpensesChart, SalesAreaChart } from '@/components/charts/charts';
import { TipCard, type Tip } from '@/components/tip-card';
import { APPOINTMENT_STATUS, DELIVERY_STATUS, WASTE_REASON, WORK_ORDER_STATUS } from '@nexo/shared';

interface Kpi { key: string; label: string; format: 'number' | 'currency' | 'percent'; value: number | null; detail?: string; href?: string; tone?: 'positive' | 'negative' | 'neutral'; empty?: { message: string; action: string; href: string } }

function KpiCard({ k, i }: { k: Kpi; i: number }) {
  const val = k.value === null ? '—' : k.format === 'currency' ? formatBRL(k.value) : k.format === 'percent' ? formatPercent(k.value) : formatNumber(k.value);
  const body = (
    <Card className={cn('group h-full p-4 transition-all animate-slide-up hover:-translate-y-0.5 hover:shadow-pop', i === 0 && 'bg-brand-950 border-brand-900 text-white')} style={{ animationDelay: `${i * 40}ms` }}>
      <p className={cn('text-xs font-semibold', i === 0 ? 'text-brand-200' : 'text-ink-500')}>{k.label}</p>
      {k.empty ? (
        <div className="mt-2">
          <p className={cn('text-sm', i === 0 ? 'text-brand-100/80' : 'text-ink-500')}>{k.empty.message}</p>
          <span className={cn('mt-2 inline-flex items-center gap-1 text-sm font-semibold', i === 0 ? 'text-accent-400' : 'text-brand-700')}>{k.empty.action}<ArrowRight className="size-3.5" /></span>
        </div>
      ) : (<>
        <p className={cn('mt-1.5 font-display text-[26px] font-extrabold leading-none tabular', i === 0 ? 'text-white' : k.tone === 'negative' && k.value ? 'text-red-600' : 'text-ink-950')}>{val}</p>
        {k.detail && (
          <p className={cn('mt-2 flex items-center gap-1 text-xs', i === 0 ? 'text-brand-100/70' : k.tone === 'positive' ? 'text-brand-700' : k.tone === 'negative' ? 'text-red-600' : 'text-ink-500')}>
            {k.tone === 'positive' && <TrendingUp className="size-3.5" />}{k.tone === 'negative' && <TrendingDown className="size-3.5" />}{k.detail}
          </p>
        )}
      </>)}
    </Card>
  );
  const href = k.empty?.href ?? k.href;
  return href ? <Link to={href} className="block focus-visible:rounded-xl">{body}</Link> : body;
}

function ChartCard({ chart }: { chart: any }) {
  const meta = CHART_CATALOG[chart.key as keyof typeof CHART_CATALOG];
  const labels: Record<string, Record<string, string>> = { waste_by_reason: WASTE_REASON, deliveries_status: DELIVERY_STATUS, work_orders_status: WORK_ORDER_STATUS };
  return (
    <Card className="flex flex-col">
      <CardHeader title={meta?.label} description={chart.hasData ? 'Calculado a partir dos registros' : undefined} />
      <div className="flex-1 px-3 pb-4">
        {!chart.hasData ? (
          <EmptyState compact title="Ainda sem dados para este gráfico" description={chart.empty.message}
            action={<Link to={chart.empty.href}><Button size="sm" variant="subtle">{chart.empty.action}</Button></Link>} />
        ) : chart.key === 'revenue_expenses' ? <RevenueExpensesChart data={chart.data} />
          : chart.key === 'sales_daily' ? <SalesAreaChart data={chart.data} />
            : chart.key === 'appointments_week' ? <AppointmentsWeekChart data={chart.data} />
              : chart.key === 'top_services' ? <HBarChart data={chart.data} valueKey="total" money />
                : chart.key === 'top_products' ? <HBarChart data={chart.data} valueKey="quantity" />
                  : <DonutChart data={chart.data} valueKey="total" labels={labels[chart.key]} money={chart.key === 'waste_by_reason'} />}
      </div>
    </Card>
  );
}

function CustomizeDialog({ open, onOpenChange, order, hidden, favorites }: { open: boolean; onOpenChange: (v: boolean) => void; order: string[]; hidden: string[]; favorites: ModuleKey[] }) {
  const me = useMe();
  const refresh = useRefreshMe();
  const qc = useQueryClient();
  const [cards, setCards] = useState(order);
  const [hid, setHid] = useState(hidden);
  const [fav, setFav] = useState<ModuleKey[]>(favorites);
  const save = useMutation({
    mutationFn: () => api.put('/company/preferences', { cardOrder: cards, hiddenCards: hid, favorites: fav }),
    onSuccess: async () => { await refresh(); qc.invalidateQueries({ queryKey: ['dashboard'] }); toast.success('Painel personalizado.'); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const move = (i: number, d: number) => setCards((c) => { const n = [...c]; const j = i + d; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const allModules = [...me.workspace.priorityModules, ...me.workspace.otherModules];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Personalizar painel" description="Altere a ordem dos cartões, oculte o que não usa e fixe módulos favoritos no menu." size="lg"
      footer={<><Button onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Salvar</Button></>}>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold text-ink-800">Cartões do painel</p>
          <ul className="space-y-1.5">
            {cards.map((c, i) => (
              <li key={c} className={cn('flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2', hid.includes(c) && 'opacity-50')}>
                <span className="flex-1 text-sm">{DASHBOARD_CARDS[c as keyof typeof DASHBOARD_CARDS]}</span>
                <Button size="icon" variant="ghost" className="size-7" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Mover para cima"><ArrowUp className="size-3.5" /></Button>
                <Button size="icon" variant="ghost" className="size-7" onClick={() => move(i, 1)} disabled={i === cards.length - 1} aria-label="Mover para baixo"><ArrowDown className="size-3.5" /></Button>
                <Button size="icon" variant="ghost" className="size-7" onClick={() => setHid((h) => (h.includes(c) ? h.filter((x) => x !== c) : [...h, c]))} aria-label={hid.includes(c) ? 'Mostrar' : 'Ocultar'}>
                  {hid.includes(c) ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-ink-800">Módulos favoritos <span className="font-normal text-ink-500">(até 8)</span></p>
          <div className="flex flex-wrap gap-1.5">
            {allModules.map((m) => {
              const on = fav.includes(m);
              return (
                <button key={m} type="button" aria-pressed={on} onClick={() => setFav((f) => (on ? f.filter((x) => x !== m) : f.length >= 8 ? f : [...f, m]))}
                  className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium', on ? 'border-brand-700 bg-brand-800 text-white' : 'border-ink-200 text-ink-700 hover:border-ink-300')}>
                  <Star className={cn('size-3', on && 'fill-accent-400 text-accent-400')} />{MODULES[m].label}
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-ink-500">Para mudar as prioridades do negócio (ordem do menu e indicadores), acesse Configurações → Personalização.</p>
        </div>
      </div>
    </Dialog>
  );
}

export default function Dashboard() {
  const me = useMe();
  const can = useCan();
  const tz = me.company.timezone;
  const [customize, setCustomize] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<{ data: any }>('/dashboard').then((r) => r.data), refetchInterval: 5 * 60_000 });
  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const ws = me.workspace;
  const order = ws.cardOrder.filter((c) => !ws.hiddenCards.includes(c));
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  const sections: Record<string, React.ReactNode> = {
    kpis: data.kpis.length > 0 && (
      <section aria-label="Indicadores" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {data.kpis.map((k: Kpi, i: number) => <KpiCard key={k.key} k={k} i={i} />)}
      </section>
    ),
    quick_actions: ws.quickActions.length > 0 && (
      <section aria-label="Ações rápidas">
        <h2 className="mb-2.5 flex items-center gap-1.5 text-sm font-bold text-ink-700"><Zap className="size-4 text-brand-600" />Ações rápidas</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {ws.quickActions.map((q, i) => {
            const a = QUICK_ACTIONS[q];
            return (
              <Link key={q} to={a.path} className={cn('group flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-pop',
                i === 0 ? 'border-accent-500 bg-accent-400 text-ink-950' : 'border-ink-200 bg-white text-ink-800 hover:border-brand-300')}>
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', i === 0 ? 'bg-ink-950/10' : 'bg-brand-50 text-brand-700 group-hover:bg-brand-100')}><Icon name={a.icon} className="size-4" /></span>
                <span className="leading-tight">{a.label}</span>
              </Link>
            );
          })}
        </div>
      </section>
    ),
    alerts: (
      <Card>
        <CardHeader title="Alertas importantes" icon={<AlertTriangle className="size-4" />} description="Ordenados por impacto" />
        {data.alerts.length ? (
          <ul className="divide-y divide-ink-100 border-t border-ink-100">
            {data.alerts.map((a: any) => (
              <li key={a.key}>
                <Link to={a.href} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50">
                  <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', a.severity === 'critical' ? 'bg-red-50 text-red-600' : a.severity === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600')}>
                    {a.severity === 'critical' ? <AlertOctagon className="size-4" /> : a.severity === 'warning' ? <AlertTriangle className="size-4" /> : <Info className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink-900">{a.title}</span><span className="block truncate text-xs text-ink-500">{a.description}</span></span>
                  <ArrowRight className="size-4 text-ink-300" />
                </Link>
              </li>
            ))}
          </ul>
        ) : <EmptyState compact icon={<AlertTriangle className="size-5" />} title="Nenhum alerta agora" description="Contas, estoque, prazos e agenda estão em dia." />}
      </Card>
    ),
    charts: data.charts.length > 0 && (
      <section className={cn('grid gap-4', data.charts.length > 1 && 'lg:grid-cols-2', data.charts.length > 2 && 'xl:grid-cols-3')}>
        {data.charts.map((c: any) => <ChartCard key={c.key} chart={c} />)}
      </section>
    ),
    agenda: (can('agenda') || can('entregas')) && (
      <Card>
        <CardHeader title={can('agenda') ? 'Próximos compromissos' : 'Próximas entregas'} icon={can('agenda') ? <CalendarClock className="size-4" /> : <Truck className="size-4" />}
          action={<Link to={can('agenda') ? '/app/agenda' : '/app/entregas'} className="text-xs font-semibold text-brand-700 hover:underline">Ver tudo</Link>} />
        {can('agenda') && data.agenda.length > 0 ? (
          <ul className="divide-y divide-ink-100 border-t border-ink-100">
            {data.agenda.map((a: any) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-14 shrink-0 text-center">
                  <p className="font-display text-base font-extrabold tabular text-ink-900">{formatTime(a.starts_at, tz)}</p>
                  <p className="text-[11px] text-ink-500">{new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: 'short' }).format(new Date(a.starts_at))}</p>
                </div>
                <span className="h-9 w-1 rounded-full" style={{ background: a.employee_color ?? 'var(--color-brand-500)' }} />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-900">{a.customer_name ?? 'Sem cliente'}</p><p className="truncate text-xs text-ink-500">{[a.service_name, a.employee_name].filter(Boolean).join(' · ')}</p></div>
                <StatusBadge status={a.status} labels={APPOINTMENT_STATUS} />
              </li>
            ))}
          </ul>
        ) : can('entregas') && data.deliveries.length > 0 ? (
          <ul className="divide-y divide-ink-100 border-t border-ink-100">
            {data.deliveries.map((d: any) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                <span className="font-display text-sm font-bold text-ink-500">#{d.number}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{d.recipient_name}</p><p className="text-xs text-ink-500">{new Intl.DateTimeFormat('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }).format(new Date(d.scheduled_for))}</p></div>
                <StatusBadge status={d.status} labels={DELIVERY_STATUS} />
              </li>
            ))}
          </ul>
        ) : <EmptyState compact title="Nenhum compromisso próximo" description="Os próximos agendamentos aparecerão aqui." action={can('agenda', 'write') ? <Link to="/app/agenda?novo=1"><Button size="sm" variant="subtle">Agendar</Button></Link> : undefined} />}
      </Card>
    ),
    tasks: can('tarefas') && (
      <Card>
        <CardHeader title="Tarefas pendentes" icon={<ListTodo className="size-4" />} action={<Link to="/app/tarefas" className="text-xs font-semibold text-brand-700 hover:underline">Ver todas</Link>} />
        {data.tasks.length ? (
          <ul className="divide-y divide-ink-100 border-t border-ink-100">
            {data.tasks.map((t: any) => (
              <li key={t.id}>
                <Link to={`/app/tarefas?abrir=${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50">
                  <span className={cn('size-2 shrink-0 rounded-full', t.priority === 'urgente' ? 'bg-red-500' : t.priority === 'alta' ? 'bg-amber-500' : t.priority === 'media' ? 'bg-sky-500' : 'bg-ink-300')} title={`Prioridade ${PRIORITY[t.priority as keyof typeof PRIORITY]}`} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink-900">{t.title}</span><span className="text-xs text-ink-500">{t.assignee_name ?? 'Sem responsável'}</span></span>
                  {t.due_date && <span className={cn('text-xs font-medium tabular', t.is_overdue ? 'text-red-600' : 'text-ink-500')}>{t.is_overdue ? 'Atrasada · ' : ''}{formatDate(t.due_date)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        ) : <EmptyState compact title="Nenhuma tarefa pendente" action={can('tarefas', 'write') ? <Link to="/app/tarefas?novo=1"><Button size="sm" variant="subtle">Nova tarefa</Button></Link> : undefined} />}
      </Card>
    ),
    tips: (
      <Card>
        <CardHeader title="Dicas para seu negócio" icon={<Lightbulb className="size-4" />} action={<Link to="/app/dicas" className="text-xs font-semibold text-brand-700 hover:underline">Ver todas</Link>} />
        <div className="space-y-3 px-5 pb-5">
          {data.tips.length ? data.tips.map((t: Tip) => <TipCard key={t.key} tip={t} compact />) : <EmptyState compact title="Nenhuma dica pendente" description="Você está em dia com as recomendações." />}
        </div>
      </Card>
    ),
    activity: (
      <Card>
        <CardHeader title="Atividades recentes" icon={<History className="size-4" />} />
        {data.activity.length ? (
          <ul className="space-y-0 border-t border-ink-100 px-5 py-2">
            {data.activity.map((a: any) => (
              <li key={a.id} className="flex gap-3 py-2.5">
                <Avatar name={a.user_name} size={26} />
                <div className="min-w-0"><p className="text-sm text-ink-800">{a.summary}</p><p className="text-xs text-ink-400">{a.user_name ?? 'Sistema'} · {relativeTime(a.created_at)}</p></div>
              </li>
            ))}
          </ul>
        ) : <EmptyState compact title="Sem atividades ainda" />}
      </Card>
    ),
  };

  // cartões menores ficam lado a lado
  const paired = new Set(['alerts', 'agenda', 'tasks', 'tips', 'activity']);
  const blocks: React.ReactNode[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (!buffer.length) return;
    const items = buffer.filter((k) => sections[k]);
    if (items.length) blocks.push(<div key={buffer.join()} className={cn('grid gap-4', items.length > 1 && 'lg:grid-cols-2', items.length > 2 && 'xl:grid-cols-3')}>{items.map((k) => <div key={k}>{sections[k]}</div>)}</div>);
    buffer = [];
  };
  for (const key of order) {
    if (paired.has(key)) { buffer.push(key); if (buffer.length === 3) flush(); }
    else { flush(); if (sections[key]) blocks.push(<div key={key}>{sections[key]}</div>); }
  }
  flush();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-fade-in">
        <div>
          <p className="text-sm font-medium capitalize text-ink-500">{dateLabel}</p>
          <h1 className="mt-0.5 text-2xl font-extrabold text-ink-950 sm:text-[28px]">{greeting()}, {me.user.name.split(' ')[0]}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-500">
            {me.company.name} <Badge tone="brand"><Icon name={me.segment.icon} className="size-3" />{me.company.segment_key === 'outro' ? me.company.custom_segment : me.segment.name}</Badge>
          </p>
        </div>
        <Button variant="secondary" icon={<LayoutGrid className="size-4" />} onClick={() => setCustomize(true)}>Personalizar painel</Button>
      </div>
      {blocks}
      <CustomizeDialog open={customize} onOpenChange={setCustomize} order={ws.cardOrder} hidden={ws.hiddenCards} favorites={ws.favorites} />
    </div>
  );
}
