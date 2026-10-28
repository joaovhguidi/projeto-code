import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatDateTime } from '@nexo/shared';
import { api } from '@/lib/api';
import { useTimezone } from '@/lib/auth';
import { Button, Dialog, Textarea } from '@/components/ui';

/** Detalhe com histórico (comentários, ocorrências, providências) e campo para adicionar novo registro. */
export function TimelineDialog({ endpoint, id, onClose, title, listKey, header, postPath, postField = 'body', postLabel, canPost, invalidate }: {
  endpoint: string; id: string | null; onClose: () => void; title: (d: any) => string; listKey: string; header?: (d: any) => React.ReactNode;
  postPath?: string; postField?: string; postLabel?: string; canPost?: boolean; invalidate: string;
}) {
  const tz = useTimezone();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, refetch } = useQuery({ queryKey: [invalidate, 'detail', id], queryFn: () => api.get<{ data: any }>(`${endpoint}/${id}`).then((r) => r.data), enabled: !!id });
  const post = async () => {
    setBusy(true);
    try { await api.post(`${endpoint}/${id}/${postPath}`, { [postField]: text }); setText(''); toast.success('Registro adicionado.'); refetch(); qc.invalidateQueries({ queryKey: [invalidate] }); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const items: any[] = data?.[listKey] ?? [];
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()} title={data ? title(data) : 'Carregando…'} size="lg">
      {data && <div className="space-y-5">
        {header?.(data)}
        {postPath && canPost && <div className="space-y-2"><Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={postLabel} /><Button size="sm" variant="brand" disabled={text.trim().length < 2} loading={busy} onClick={post}>Adicionar</Button></div>}
        <ul className="space-y-3 border-l-2 border-ink-100 pl-4">
          {items.map((it, i) => (
            <li key={it.id ?? i} className="text-sm"><p className="text-ink-800">{it.body ?? it.description ?? it.note ?? it.summary ?? (it.status ? `Situação: ${it.status}` : '')}{it.kind === 'ocorrencia' && <span className="ml-1 text-xs font-semibold text-red-600">(ocorrência)</span>}</p>
              <p className="text-xs text-ink-400">{it.user_name ?? 'Sistema'} · {formatDateTime(it.created_at, tz)}</p></li>
          ))}
          {!items.length && <li className="text-sm text-ink-500">Nenhum registro ainda.</li>}
        </ul>
      </div>}
    </Dialog>
  );
}
