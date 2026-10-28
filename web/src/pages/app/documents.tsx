import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, FolderLock, Lock, Upload } from 'lucide-react';
import { DOCUMENT_CATEGORY, canDo, documentSchema, formatDate } from '@nexo/shared';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { ResourcePage } from '@/components/resource-page';
import { Badge } from '@/components/ui';
import { TimelineDialog } from '@/components/timeline-dialog';

export default function Documents() {
  const me = useMe();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [hist, setHist] = useState<string | null>(null);
  const restrictedOk = canDo(me.role, 'restrictedDocuments');
  const upload = async (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    try { await api.upload(`/documents/${target}/files`, fd); toast.success('Arquivo enviado.'); qc.invalidateQueries({ queryKey: ['/documents'] }); } catch (e: any) { toast.error(e.message); }
    setTarget(null);
  };
  return (
    <>
      <input ref={input} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      <ResourcePage<any> title="Documentos e contratos" description="Alvarás, contratos e certificados com alertas de vencimento. Arquivos armazenados de forma privada." module="documentos" endpoint="/documents" entity="documento" newLabel="Novo documento" softDelete
        help={<p>Documentos <b>restritos</b> só são visíveis para proprietário e gerente. Cada novo arquivo enviado vira uma nova versão, mantendo o histórico.</p>}
        defaultSort={{ key: 'expires_on', dir: 'asc' }} filters={[{ key: 'category', label: 'Categoria', options: DOCUMENT_CATEGORY }, { key: 'expiring', label: 'Vencimento', options: { '1': 'Vencidos ou vencendo em 30 dias' }, allLabel: 'Todos' }]}
        empty={{ title: 'Nenhum documento', icon: <FolderLock className="size-6" /> }}
        columns={[
          { key: 'title', header: 'Documento', sortKey: 'title', primary: true, render: (r) => <div><p className="flex items-center gap-1.5 font-semibold">{r.restricted && <Lock className="size-3.5 text-ink-400" aria-label="Restrito" />}{r.title}</p><p className="text-xs text-ink-500">{DOCUMENT_CATEGORY[r.category as keyof typeof DOCUMENT_CATEGORY]}{r.responsible ? ` · ${r.responsible}` : ''}</p></div> },
          { key: 'issued_on', header: 'Emissão', sortKey: 'issued_on', hideOnMobile: true, render: (r) => formatDate(r.issued_on) },
          { key: 'expires_on', header: 'Vencimento', sortKey: 'expires_on', render: (r) => <span className="flex items-center gap-1.5">{formatDate(r.expires_on)}{r.is_expired ? <Badge tone="danger">Vencido</Badge> : r.is_expiring ? <Badge tone="warning">Vence em breve</Badge> : null}</span> },
          { key: 'file', header: 'Arquivo', render: (r) => (r.current_file ? <a href={`/api/documents/${r.id}/files/${r.current_file.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-brand-700 hover:underline"><Download className="size-3.5" />v{r.current_version}</a> : <span className="text-xs text-ink-400">Sem arquivo</span>) },
        ]}
        rowActions={(r) => [{ label: 'Enviar arquivo / nova versão', icon: <Upload className="size-4" />, onSelect: () => { setTarget(r.id); setTimeout(() => input.current?.click(), 0); } },
          { label: 'Versões e histórico', onSelect: () => setHist(r.id) }]}
        schema={documentSchema} defaults={() => ({ category: 'contrato', restricted: restrictedOk })}
        fields={[{ name: 'title', label: 'Título', required: true, span: 2 }, { name: 'category', label: 'Categoria', type: 'select', options: DOCUMENT_CATEGORY, required: true }, { name: 'responsible', label: 'Responsável' },
          { name: 'issued_on', label: 'Emissão', type: 'date' }, { name: 'expires_on', label: 'Vencimento', type: 'date' }, { name: 'description', label: 'Descrição', type: 'textarea' },
          ...(restrictedOk ? [{ name: 'restricted', label: 'Restrito a proprietário/gerente', type: 'switch' as const }] : [])]} />
      <TimelineDialog endpoint="/documents" id={hist} onClose={() => setHist(null)} invalidate="/documents" title={(d) => d.title} listKey="history"
        header={(d) => <ul className="space-y-1 text-sm">{d.files.map((f: any) => <li key={f.id}><a className="text-brand-700 hover:underline" href={`/api/documents/${d.id}/files/${f.id}`}>Versão {f.version}: {f.file_name}</a> <span className="text-xs text-ink-500">({Math.ceil(f.size_bytes / 1024)} KB, {f.uploaded_by_name})</span></li>)}{!d.files.length && <li className="text-ink-500">Nenhum arquivo enviado.</li>}</ul>} />
    </>
  );
}
