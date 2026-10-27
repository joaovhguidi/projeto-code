import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBRL, formatNumber } from '@nexo/shared';

export const CHART_COLORS = ['#0c614c', '#149473', '#a5dc35', '#7dd3b4', '#f59e0b', '#6b737b', '#0a4a3b', '#d0f57a'];
export const SERIES = { revenue: '#0f7a5f', expenses: '#e2725b', neutral: '#9aa1a8', light: '#7dd3b4', dark: '#0a4a3b', accent: '#a5dc35' };

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const monthLabel = (ym: string) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1]}/${y.slice(2)}`; };
export const dayLabel = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const weekdayLabel = (d: string) => `${WEEK[new Date(d + 'T12:00:00Z').getUTCDay()]} ${d.slice(8, 10)}`;
const compactBRL = (v: number) => (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : formatBRL(v));

function TooltipBox({ active, payload, label, money, labelFmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs shadow-pop">
      {label !== undefined && <p className="mb-1 font-semibold text-ink-900">{labelFmt ? labelFmt(label) : label}</p>}
      {payload.map((p: any) => (
        <p key={p.dataKey ?? p.name} className="flex items-center gap-2 text-ink-600">
          <span className="size-2 rounded-full" style={{ background: p.color ?? p.payload?.fill }} />{p.name}: <b className="text-ink-900 tabular">{money ? formatBRL(p.value) : formatNumber(p.value)}</b>
        </p>
      ))}
    </div>
  );
}
const axis = { tick: { fontSize: 11, fill: '#6b737b' }, axisLine: false, tickLine: false } as const;

export function RevenueExpensesChart({ data, height = 240 }: { data: { month: string; receitas?: number; despesas?: number; revenue?: number; expenses?: number }[]; height?: number }) {
  const rows = data.map((d) => ({ month: d.month, Receitas: d.receitas ?? d.revenue ?? 0, Despesas: d.despesas ?? d.expenses ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} barGap={3} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#eff1f2" />
        <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
        <YAxis tickFormatter={compactBRL} width={78} {...axis} />
        <Tooltip content={<TooltipBox money labelFmt={monthLabel} />} cursor={{ fill: '#f7f8f8' }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Receitas" fill={SERIES.revenue} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="Despesas" fill={SERIES.expenses} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SalesAreaChart({ data, height = 240 }: { data: { date: string; total: number; count: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data.map((d) => ({ ...d, Vendas: d.total }))} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <defs><linearGradient id="gSales" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={SERIES.revenue} stopOpacity={0.28} /><stop offset="100%" stopColor={SERIES.revenue} stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="#eff1f2" />
        <XAxis dataKey="date" tickFormatter={dayLabel} {...axis} minTickGap={24} />
        <YAxis tickFormatter={compactBRL} width={78} {...axis} />
        <Tooltip content={<TooltipBox money labelFmt={dayLabel} />} />
        <Area type="monotone" dataKey="Vendas" stroke={SERIES.revenue} strokeWidth={2} fill="url(#gSales)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function AppointmentsWeekChart({ data, height = 240 }: { data: { date: string; agendados: number; concluidos: number; cancelados: number }[]; height?: number }) {
  const rows = data.map((d) => ({ date: d.date, 'A realizar': d.agendados, Concluídos: d.concluidos, 'Cancelados/faltas': d.cancelados }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#eff1f2" />
        <XAxis dataKey="date" tickFormatter={weekdayLabel} {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip content={<TooltipBox labelFmt={weekdayLabel} />} cursor={{ fill: '#f7f8f8' }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Concluídos" stackId="a" fill={SERIES.dark} maxBarSize={36} />
        <Bar dataKey="A realizar" stackId="a" fill={SERIES.light} maxBarSize={36} />
        <Bar dataKey="Cancelados/faltas" stackId="a" fill="#c8cdd1" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HBarChart({ data, valueKey, money, height }: { data: { name: string; [k: string]: any }[]; valueKey: string; money?: boolean; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(160, data.length * 38 + 20)}>
      <BarChart data={data.map((d) => ({ ...d, valor: Number(d[valueKey]) }))} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={130} {...axis} tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 17) + '…' : v)} />
        <Tooltip content={<TooltipBox money={money} />} cursor={{ fill: '#f7f8f8' }} />
        <Bar dataKey="valor" name={money ? 'Faturamento' : 'Quantidade'} fill={SERIES.revenue} radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, valueKey, labels, money, height = 240 }: { data: { name: string; [k: string]: any }[]; valueKey: string; labels?: Record<string, string>; money?: boolean; height?: number }) {
  const rows = data.map((d) => ({ name: labels?.[d.name] ?? d.name, value: Number(d[valueKey]) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">
          {rows.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip content={<TooltipBox money={money} />} />
        <Legend iconType="circle" iconSize={8} layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
