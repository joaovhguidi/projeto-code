import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './display';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (row: T) => React.ReactNode;
  sortKey?: string;
  className?: string;
  align?: 'left' | 'right' | 'center';
  hideOnMobile?: boolean;
  /** coluna principal exibida como título no modo cartão (celular) */
  primary?: boolean;
}

export function DataTable<T extends { id?: string }>({ columns, rows, loading, sort, onSort, onRowClick, empty, rowClassName, actions }: {
  columns: Column<T>[]; rows: T[]; loading?: boolean; sort?: { key: string; dir: 'asc' | 'desc' }; onSort?: (key: string) => void;
  onRowClick?: (row: T) => void; empty?: React.ReactNode; rowClassName?: (row: T) => string | undefined; actions?: (row: T) => React.ReactNode;
}) {
  const align = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
  if (!loading && !rows.length) return <>{empty}</>;
  return (
    <>
      {/* Tabela (tablet/desktop) */}
      <div className="hidden overflow-x-auto md:block scrollbar-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/70">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn('px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500', align(c.align), c.className)}>
                  {c.sortKey && onSort ? (
                    <button type="button" onClick={() => onSort(c.sortKey!)} className={cn('inline-flex items-center gap-1 hover:text-ink-800', c.align === 'right' && 'flex-row-reverse')}
                      aria-label={`Ordenar por ${typeof c.header === 'string' ? c.header : c.key}`}>
                      {c.header}
                      {sort?.key === c.sortKey ? (sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ChevronsUpDown className="size-3 opacity-40" />}
                    </button>
                  ) : c.header}
                </th>
              ))}
              {actions && <th className="w-12"><span className="sr-only">Ações</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {loading && !rows.length
              ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>{columns.map((c) => <td key={c.key} className="px-4 py-3.5"><Skeleton className="h-4 w-3/4" /></td>)}{actions && <td />}</tr>
              ))
              : rows.map((row, i) => (
                <tr key={row.id ?? i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn('transition-colors', onRowClick && 'cursor-pointer hover:bg-brand-50/40 focus:bg-brand-50/60 focus:outline-none', loading && 'opacity-60', rowClassName?.(row))}>
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3 text-ink-700', align(c.align), c.className)}>{c.render ? c.render(row) : (row as any)[c.key] ?? '—'}</td>
                  ))}
                  {actions && <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>{actions(row)}</td>}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {/* Cartões (celular) */}
      <ul className="divide-y divide-ink-100 md:hidden">
        {loading && !rows.length
          ? Array.from({ length: 4 }).map((_, i) => <li key={i} className="p-4"><Skeleton className="h-4 w-1/2" /><Skeleton className="mt-2 h-3 w-3/4" /></li>)
          : rows.map((row, i) => {
            const primary = columns.find((c) => c.primary) ?? columns[0];
            const rest = columns.filter((c) => c !== primary && !c.hideOnMobile);
            return (
              <li key={row.id ?? i} className={cn('flex gap-3 p-4', onRowClick && 'cursor-pointer active:bg-ink-50', rowClassName?.(row))}
                onClick={onRowClick ? () => onRowClick(row) : undefined}>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink-900">{primary.render ? primary.render(row) : (row as any)[primary.key]}</div>
                  <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
                    {rest.map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-[11px] uppercase tracking-wide text-ink-400">{c.header}</dt>
                        <dd className="truncate text-sm text-ink-700">{c.render ? c.render(row) : (row as any)[c.key] ?? '—'}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                {actions && <div onClick={(e) => e.stopPropagation()}>{actions(row)}</div>}
              </li>
            );
          })}
      </ul>
    </>
  );
}
