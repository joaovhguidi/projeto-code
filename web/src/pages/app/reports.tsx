import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { DELIVERY_STATUS, PRIORITY, REPORT_CATALOG, TASK_STATUS, WASTE_REASON, formatBRL, formatDate, formatDateTime, formatNumber, formatPercent, todayIn, type ReportKey } from '@nexo/shared';
import { api, qs } from '@/lib/api';
import { useCan, useMe, useTimezone } from '@/lib/auth';
import { cn, downloadBlob, toCSV } from '@/lib/utils';
import { Button, Card, DataTable, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton } from '@/components/ui';
import { DonutChart, HBarChart, RevenueExpensesChart, SERIES } from '@/components/charts/charts';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const LABELS: Record<string, Record<string, string>> = { reason: WASTE_REASON, status: { ...TASK_STATUS, ...DELIVERY_STATUS }, priority: PRIORITY };
export default function Reports() {
  const me = useMe();
  const can = useCan();
  const tz = useTimezone();
  const [sp, setSp] = useSearchParams();
  const all = (Object.keys(REPORT_CATALOG) as ReportKey[]).filter((k) => can(REPORT_CATALOG[k].module));
  const featured = me.workspace.reports.filter((r) => all.includes(r));
  const key = (sp.get('r') as ReportKey) || featured[0] || all[0];
  const today = todayIn(tz);
  const from = sp.get('from') || today.slice(0, 8) + '01';
  const to = sp.get('to') || today;
  const group = sp.get('group') || '';
  const set = (p: Record<string, string>) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(p)) v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['reports', key, from, to, group], queryFn: () => api.get<{ data: any }>(`/reports/${key}${qs({ from, to, group })}`).then((r) => r.data), enabled: !!key });
  const fmt = (v: any, f?: string, k?: string) => v == null ? '—' : f === 'currency' ? formatBRL(v) : f === 'number' ? formatNumber(v) : f === 'percent' ? formatPercent(v) : f === 'date' ? formatDate(String(v)) : f === 'datetime' ? formatDateTime(v, tz) : (k && LABELS[k]?.[v]) ?? String(v);
  const exportCsv = () => data && downloadBlob(new Blob([toCSV(data.columns, data.rows.map((r: any) => Object.fromEntries(data.columns.map((c: any) => [c.key, fmt(r[c.key], c.format, c.key)]))))], { type: 'text/csv;charset=utf-8' }), `${key}-${from}-${to}.csv`);
  return (
    <div>
      <PageHeader title="Relatórios" description="Indicadores calculados exclusivamente a partir dos dados registrados."
        actions={<div className="no-print flex gap-2"><Button icon={<Download className="size-4" />} onClick={exportCsv} disabled={!data?.rows?.length}>Exportar CSV</Button><Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir</Button></div>} />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="no-print h-fit p-2">
          {featured.length > 0 && <p className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-brand-700">Em destaque para seu negócio</p>}
          {[...featured, ...all.filter((k) => !featured.includes(k))].map((k, i) => (<div key={k}>
            {i === featured.length && featured.length > 0 && <p className="px-2 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-ink-400">Outros</p>}
            <button type="button" onClick={() => set({ r: k })} className={cn('w-full rounded-lg px-3 py-2 text-left text-sm', k === key ? 'bg-brand-50 font-semibold text-brand-900' : 'text-ink-700 hover:bg-ink-50')}>{REPORT_CATALOG[k].label}</button>
          </div>))}
        </Card>
        <div className="space-y-4">
          <Card className="no-print flex flex-wrap items-center gap-2 p-3">
            <span className="font-display font-bold">{REPORT_CATALOG[key]?.label}</span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {key === 'sales_by_period' && <Select value={group} onChange={(e) => set({ group: e.target.value })} className="w-32" aria-label="Agrupar"><option value="">Por dia</option><option value="semana">Por semana</option><option value="mes">Por mês</option></Select>}
              <Input type="date" value={from} onChange={(e) => set({ from: e.target.value })} className="w-40" aria-label="De" /><Input type="date" value={to} onChange={(e) => set({ to: e.target.value })} className="w-40" aria-label="Até" />
            </div>
          </Card>
          {isLoading ? <Skeleton className="h-80" /> : error ? <ErrorState error={error} onRetry={() => refetch()} /> : data && <>
            {data.summary?.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.summary.map((s: any) => <Card key={s.label} className="p-4"><p className="text-xs font-semibold text-ink-500">{s.label}</p><p className="mt-1 font-display text-xl font-extrabold tabular">{fmt(s.value, s.format)}</p></Card>)}</div>}
            {data.chart && data.rows.length > 0 && <Card className="p-4">
              {data.chart.type === 'pie' ? <DonutChart data={data.rows.map((r: any) => ({ name: fmt(r[data.chart.x], undefined, data.chart.x), v: r[data.chart.series[0].key] }))} valueKey="v" money />
                : data.chart.type === 'hbar' ? <HBarChart data={data.rows.slice(0, 10).map((r: any) => ({ name: r[data.chart.x], v: r[data.chart.series[0].key] }))} valueKey="v" money={data.chart.series[0].key !== 'quantity'} />
                  : key === 'revenue_expenses' || key === 'financial_result' ? <RevenueExpensesChart data={data.rows.map((r: any) => ({ month: r.period.slice(0, 7), revenue: r.revenue, expenses: r.expenses }))} />
                    : <ResponsiveContainer width="100%" height={260}><BarChart data={data.rows}><CartesianGrid vertical={false} stroke="#eff1f2" /><XAxis dataKey={data.chart.x} tick={{ fontSize: 11 }} tickFormatter={(v) => (/^\d{4}-/.test(v) ? formatDate(v).slice(0, 5) : v)} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend />
                      {data.chart.series.map((s: any, i: number) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={[SERIES.revenue, SERIES.expenses, SERIES.neutral][i]} radius={[4, 4, 0, 0]} />)}</BarChart></ResponsiveContainer>}
            </Card>}
            <Card className="overflow-hidden">
              <DataTable<any> rows={data.rows} empty={<EmptyState title="Sem dados no período" description="Não há registros para calcular este relatório. Ajuste o período ou registre movimentações." />}
                columns={data.columns.map((c: any, i: number) => ({ key: c.key, header: c.label, primary: i === 0, align: ['currency', 'number', 'percent'].includes(c.format) ? 'right' : 'left', render: (r: any) => <span className={c.format ? 'tabular' : ''}>{fmt(r[c.key], c.format, c.key)}</span> }))} />
            </Card>
            {data.note && <p className="text-xs text-ink-500">{data.note}</p>}
          </>}
        </div>
      </div>
    </div>
  );
}
