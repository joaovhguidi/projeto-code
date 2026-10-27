// Formatação no padrão brasileiro.
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

export const formatBRL = (v: number | string | null | undefined) => brl.format(Number(v ?? 0));
export const formatNumber = (v: number | string | null | undefined) => num.format(Number(v ?? 0));
export const formatPercent = (v: number | null | undefined) => (v == null ? '—' : pct.format(v));

/** 'YYYY-MM-DD' → 'DD/MM/AAAA' sem conversão de fuso */
export function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

export function formatDateTime(iso: string | null | undefined, timeZone = 'America/Sao_Paulo') {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}
export function formatTime(iso: string | null | undefined, timeZone = 'America/Sao_Paulo') {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** Data de hoje (YYYY-MM-DD) no fuso informado */
export function todayIn(timeZone = 'America/Sao_Paulo', base = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(base);
  return parts; // en-CA => YYYY-MM-DD
}

/** Diferença em minutos entre o fuso e UTC num instante (positivo a leste) */
export function tzOffsetMinutes(timeZone: string, at = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUTC - at.getTime()) / 60000);
}

/** Converte data+hora locais da empresa para ISO UTC */
export function zonedToUtcISO(dateStr: string, timeStr: string, timeZone = 'America/Sao_Paulo') {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = tzOffsetMinutes(timeZone, new Date(guess));
  let ts = guess - off * 60000;
  const off2 = tzOffsetMinutes(timeZone, new Date(ts));
  if (off2 !== off) ts = guess - off2 * 60000;
  return new Date(ts).toISOString();
}

/** Partes locais (data e hora) de um instante no fuso da empresa */
export function utcToZonedParts(iso: string, timeZone = 'America/Sao_Paulo') {
  const date = todayIn(timeZone, new Date(iso));
  const time = formatTime(iso, timeZone);
  return { date, time };
}

export function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatPhone(v: string | null | undefined) {
  if (!v) return '—';
  const d = v.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v;
}

export function formatDocument(v: string | null | undefined) {
  if (!v) return '—';
  const d = v.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return v;
}

/** Soma valores monetários em centavos inteiros para evitar erros de ponto flutuante */
export const toCents = (v: number | string | null | undefined) => Math.round(Number(v ?? 0) * 100);
export const fromCents = (c: number) => c / 100;
export function lineTotal(quantity: number, unitPrice: number, discount = 0) {
  // quantidade com até 3 casas: calcula em milésimos de centavo e arredonda
  const gross = Math.round((Math.round(quantity * 1000) * toCents(unitPrice)) / 1000);
  return fromCents(Math.max(0, gross - toCents(discount)));
}
