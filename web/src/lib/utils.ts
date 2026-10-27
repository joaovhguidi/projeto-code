import clsx, { type ClassValue } from 'clsx';
export const cn = (...v: ClassValue[]) => clsx(v);

export function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  if (Math.abs(diff) < 60) return 'agora';
  if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  if (Math.abs(diff) < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day');
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCSV(columns: { key: string; label: string }[], rows: Record<string, unknown>[]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [columns.map((c) => esc(c.label)).join(';'), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(';'))].join('\n');
}
