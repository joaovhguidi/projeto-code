import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ZodTypeAny } from 'zod';
import type { ModuleKey } from '@nexo/shared';
import { api, qs, type Page } from '@/lib/api';
import { useCan, useTimezone } from '@/lib/auth';
import { Button, Card, DataTable, EmptyState, ErrorState, Menu, PageHeader, Pagination, SearchInput, Select, useConfirm, type Column } from '@/components/ui';
import { FormSheet, type FieldDef } from '@/components/form/form';

export interface FilterDef { key: string; label: string; options: Record<string, string>; allLabel?: string }

export interface ResourceConfig<T> {
  title: string;
  description?: string;
  help?: React.ReactNode;
  module: ModuleKey;
  endpoint: string;
  entity: string;             // "cliente"
  newLabel?: string;          // "Novo cliente"
  columns: Column<T>[];
  fields: FieldDef[];
  schema: ZodTypeAny;
  defaults?: () => Record<string, any>;
  filters?: FilterDef[];
  softDelete?: boolean;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  detailPath?: (row: T) => string;
  rowActions?: (row: T, ctx: { refresh: () => void }) => ({ label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean } | false)[];
  empty?: { title: string; description?: string; icon?: React.ReactNode };
  headerExtra?: React.ReactNode;
  toolbarExtra?: React.ReactNode;
  beforeTable?: React.ReactNode;
  rowClassName?: (row: T) => string | undefined;
  wideForm?: boolean;
  formExtra?: React.ReactNode;
  canDelete?: (row: T) => boolean;
  /** ajusta valores antes de abrir o formulário de edição */
  toInitial?: (row: T) => Record<string, any>;
}

export function useListParams(defaults: { key: string; dir: 'asc' | 'desc' } | undefined, filterKeys: string[]) {
  const [sp, setSp] = useSearchParams();
  const get = (k: string) => sp.get(k) ?? '';
  const set = (patch: Record<string, string | number | null | undefined>, resetPage = true) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined || v === '') next.delete(k); else next.set(k, String(v)); }
    if (resetPage && !('page' in patch)) next.delete('page');
    setSp(next, { replace: true });
  };
  const params: Record<string, string> = {};
  for (const k of [...filterKeys, 'q', 'archived']) if (get(k)) params[k] = get(k);
  return {
    sp, set, get, params,
    page: Number(get('page') || 1),
    sort: { key: get('sort') || defaults?.key || '', dir: (get('dir') || defaults?.dir || 'asc') as 'asc' | 'desc' },
  };
}

export function ResourcePage<T extends { id: string; archived_at?: string | null }>(cfg: ResourceConfig<T>) {
  const can = useCan();
  const tz = useTimezone();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const writable = can(cfg.module, 'write');
  const lp = useListParams(cfg.defaultSort, (cfg.filters ?? []).map((f) => f.key));
  const [editing, setEditing] = useState<T | null>(null);
  const [creating, setCreating] = useState(false);

  // atalhos: ?novo=1 abre o formulário
  useEffect(() => {
    if (lp.get('novo') && writable) { setCreating(true); lp.set({ novo: null }, false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lp.get('novo')]);

  const url = `${cfg.endpoint}${qs({ ...lp.params, page: lp.page, pageSize: 20, sort: lp.sort.key, dir: lp.sort.dir })}`;
  const query = useQuery({ queryKey: [cfg.endpoint, 'list', url], queryFn: () => api.get<Page<T>>(url), placeholderData: keepPreviousData });
  const refresh = () => qc.invalidateQueries({ queryKey: [cfg.endpoint] });

  const save = useMutation({
    mutationFn: (values: Record<string, any>) => (editing ? api.put(`${cfg.endpoint}/${editing.id}`, values) : api.post(cfg.endpoint, values)),
    onSuccess: () => {
      toast.success(editing ? 'Alterações salvas.' : `${cfg.entity[0].toUpperCase()}${cfg.entity.slice(1)} cadastrado com sucesso.`);
      setEditing(null); setCreating(false); refresh();
      qc.invalidateQueries({ queryKey: ['options'] }); qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const remove = async (row: T, permanent: boolean) => {
    const ok = await confirm({
      title: permanent ? `Excluir ${cfg.entity}?` : `Arquivar ${cfg.entity}?`,
      description: permanent
        ? 'A exclusão é definitiva. Se houver registros vinculados, o sistema vai impedir e sugerir o arquivamento.'
        : 'O registro deixa de aparecer nas listas, mas o histórico é preservado. Você pode restaurá-lo depois.',
      confirmLabel: permanent ? 'Excluir' : 'Arquivar',
    });
    if (!ok) return;
    try {
      await api.del(`${cfg.endpoint}/${row.id}${permanent && cfg.softDelete ? '?permanent=1' : ''}`);
      toast.success(permanent ? 'Registro excluído.' : 'Registro arquivado.');
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };
  const restore = async (row: T) => {
    try { await api.post(`${cfg.endpoint}/${row.id}/restore`); toast.success('Registro restaurado.'); refresh(); } catch (e: any) { toast.error(e.message); }
  };

  const onSort = (key: string) => lp.set({ sort: key, dir: lp.sort.key === key && lp.sort.dir === 'asc' ? 'desc' : 'asc' });
  const archived = lp.get('archived') === '1';
  const hasFilters = Object.keys(lp.params).length > 0;
  const initial = useMemo(() => (editing ? (cfg.toInitial ? cfg.toInitial(editing) : editing) : cfg.defaults?.() ?? {}), [editing, creating]); // eslint-disable-line

  return (
    <div>
      <PageHeader title={cfg.title} description={cfg.description} help={cfg.help}
        actions={<>
          {cfg.headerExtra}
          {writable && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>{cfg.newLabel ?? 'Novo'}</Button>}
        </>} />
      {cfg.beforeTable}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-ink-100 p-3 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput value={lp.get('q')} onChange={(v) => lp.set({ q: v })} className="sm:w-72" />
          {cfg.filters?.map((f) => (
            <Select key={f.key} value={lp.get(f.key)} onChange={(e) => lp.set({ [f.key]: e.target.value })} className="sm:w-48" aria-label={f.label}>
              <option value="">{f.allLabel ?? `${f.label}: todos`}</option>
              {Object.entries(f.options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          ))}
          {cfg.toolbarExtra}
          <div className="flex items-center gap-2 sm:ml-auto">
            {hasFilters && <Button size="sm" variant="ghost" onClick={() => lp.set(Object.fromEntries(Object.keys(lp.params).map((k) => [k, null])))}>Limpar filtros</Button>}
            {cfg.softDelete && (
              <Button size="sm" variant={archived ? 'subtle' : 'ghost'} icon={<Archive className="size-3.5" />} onClick={() => lp.set({ archived: archived ? null : '1' })}>
                {archived ? 'Vendo arquivados' : 'Arquivados'}
              </Button>
            )}
          </div>
        </div>
        {query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : (
          <DataTable<T>
            columns={cfg.columns}
            rows={query.data?.data ?? []}
            loading={query.isFetching}
            sort={lp.sort}
            onSort={onSort}
            rowClassName={cfg.rowClassName}
            onRowClick={(row) => (cfg.detailPath ? navigate(cfg.detailPath(row)) : writable ? setEditing(row) : undefined)}
            empty={
              <EmptyState icon={cfg.empty?.icon}
                title={hasFilters ? 'Nenhum resultado para os filtros aplicados' : archived ? 'Nenhum registro arquivado' : cfg.empty?.title ?? `Nenhum ${cfg.entity} cadastrado`}
                description={hasFilters ? 'Ajuste a busca ou limpe os filtros.' : cfg.empty?.description}
                action={!hasFilters && !archived && writable ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>{cfg.newLabel ?? 'Cadastrar'}</Button> : undefined} />
            }
            actions={(row) => (
              <Menu items={[
                writable && { label: 'Editar', icon: <Pencil className="size-4" />, onSelect: () => setEditing(row) },
                ...(cfg.rowActions?.(row, { refresh }) ?? []),
                writable && cfg.softDelete && !row.archived_at && { label: 'Arquivar', icon: <Archive className="size-4" />, onSelect: () => remove(row, false) },
                writable && cfg.softDelete && row.archived_at && { label: 'Restaurar', icon: <ArchiveRestore className="size-4" />, onSelect: () => restore(row) },
                writable && (cfg.canDelete?.(row) ?? true) && (!cfg.softDelete || row.archived_at) && { label: 'Excluir definitivamente', icon: <Trash2 className="size-4" />, danger: true, onSelect: () => remove(row, true) },
              ]} />
            )}
          />
        )}
        {query.data && <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onChange={(p) => lp.set({ page: p }, false)} />}
      </Card>
      <FormSheet open={creating || !!editing} onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }}
        title={editing ? `Editar ${cfg.entity}` : cfg.newLabel ?? `Novo ${cfg.entity}`} fields={cfg.fields} schema={cfg.schema} initial={initial}
        tz={tz} wide={cfg.wideForm} onSubmit={(v) => save.mutateAsync(v)}>
        {cfg.formExtra}
      </FormSheet>
    </div>
  );
}
