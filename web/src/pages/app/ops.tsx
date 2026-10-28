import { useState } from 'react';
import { MessageSquare, Truck, ListChecks, LifeBuoy, MessageSquareWarning, Trash2, Wrench, CircleCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DELIVERY_STATUS, EQUIPMENT_STATUS, FEEDBACK_STATUS, FEEDBACK_TYPE, ISSUE_CATEGORY, ISSUE_STATUS, MAINTENANCE_STATUS, MAINTENANCE_TYPE, PRIORITY, TASK_STATUS, WASTE_REASON,
  deliverySchema, equipmentSchema, feedbackSchema, issueSchema, maintenanceSchema, taskSchema, wasteSchema, formatBRL, formatDate, formatDateTime, formatNumber, todayIn,
} from '@nexo/shared';
import { api } from '@/lib/api';
import { useCan, useTimezone } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { ResourcePage } from '@/components/resource-page';
import { Badge, Card, Rating, Select, StatusBadge, Tabs, TabPanel } from '@/components/ui';
import { TimelineDialog } from '@/components/timeline-dialog';
import { DonutChart } from '@/components/charts/charts';
import { useSearchParams } from 'react-router-dom';

const quick = async (url: string, body: any, qc: any, key: string, msg = 'Atualizado.') => {
  try { await api.patch(url, body); toast.success(msg); qc.invalidateQueries({ queryKey: [key] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); } catch (e: any) { toast.error(e.message); }
};

export function Tasks() {
  const qc = useQueryClient();
  const can = useCan();
  const [sp] = useSearchParams();
  const [open, setOpen] = useState<string | null>(sp.get('abrir'));
  return (
    <>
      <ResourcePage<any> title="Tarefas" description="Tarefas e projetos da equipe, com prioridade, prazo e comentários." module="tarefas" endpoint="/tasks" entity="tarefa" newLabel="Nova tarefa"
        defaultSort={{ key: 'due_date', dir: 'asc' }}
        filters={[{ key: 'status', label: 'Situação', options: TASK_STATUS }, { key: 'priority', label: 'Prioridade', options: PRIORITY }, { key: 'overdue', label: 'Prazo', options: { '1': 'Atrasadas' }, allLabel: 'Todos os prazos' }]}
        empty={{ title: 'Nenhuma tarefa', icon: <ListChecks className="size-6" /> }}
        rowClassName={(r) => (r.is_overdue ? 'bg-red-50/40' : undefined)}
        columns={[
          { key: 'title', header: 'Tarefa', sortKey: 'title', primary: true, render: (r) => <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); setOpen(r.id); }}><p className="font-semibold text-ink-900 hover:underline">{r.title}</p><p className="text-xs text-ink-500">{r.project ?? ''}{r.comments_count ? ` · ${r.comments_count} comentário(s)` : ''}</p></button> },
          { key: 'assignee_name', header: 'Responsável', render: (r) => r.assignee_name ?? '—' },
          { key: 'priority', header: 'Prioridade', sortKey: 'priority', render: (r) => <StatusBadge status={r.priority} labels={PRIORITY} /> },
          { key: 'due_date', header: 'Prazo', sortKey: 'due_date', render: (r) => <span className={cn(r.is_overdue && 'font-semibold text-red-600')}>{formatDate(r.due_date)}</span> },
          { key: 'status', header: 'Situação', render: (r) => can('tarefas', 'write') ? (
            <Select value={r.status} onClick={(e) => e.stopPropagation()} onChange={(e) => quick(`/tasks/${r.id}/status`, { status: e.target.value }, qc, '/tasks')} className="h-8 w-36 text-xs" aria-label="Situação">
              {Object.entries(TASK_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>) : <StatusBadge status={r.status} labels={TASK_STATUS} /> },
        ]}
        rowActions={(r) => [{ label: 'Comentários e histórico', icon: <MessageSquare className="size-4" />, onSelect: () => setOpen(r.id) }]}
        schema={taskSchema} defaults={() => ({ priority: 'media', status: 'pendente' })}
        fields={[
          { name: 'title', label: 'Título', required: true, span: 2 }, { name: 'description', label: 'Descrição', type: 'textarea' },
          { name: 'assignee_id', label: 'Responsável', type: 'entity', endpoint: '/staff/options' }, { name: 'project', label: 'Projeto' },
          { name: 'priority', label: 'Prioridade', type: 'select', options: PRIORITY, required: true }, { name: 'status', label: 'Situação', type: 'select', options: TASK_STATUS, required: true },
          { name: 'start_date', label: 'Início', type: 'date' }, { name: 'due_date', label: 'Prazo', type: 'date' },
        ]} />
      <TimelineDialog endpoint="/tasks" id={open} onClose={() => setOpen(null)} invalidate="/tasks" title={(d) => d.title} listKey="comments" postPath="comments" postLabel="Escreva um comentário…" canPost={can('tarefas', 'write')}
        header={(d) => <div className="space-y-2 text-sm"><div className="flex flex-wrap gap-2"><StatusBadge status={d.status} labels={TASK_STATUS} /><StatusBadge status={d.priority} labels={PRIORITY} /><span className="text-ink-500">Prazo: {formatDate(d.due_date)} · {d.assignee_name ?? 'Sem responsável'}</span></div>
          {d.description && <p className="whitespace-pre-line text-ink-700">{d.description}</p>}
          {d.history?.length > 0 && <details className="text-xs text-ink-500"><summary className="cursor-pointer">Histórico de alterações ({d.history.length})</summary>{d.history.map((h: any, i: number) => <p key={i}>{h.summary} — {h.user_name}</p>)}</details>}</div>} />
    </>
  );
}

export function Deliveries() {
  const qc = useQueryClient();
  const can = useCan();
  const tz = useTimezone();
  const [open, setOpen] = useState<string | null>(null);
  const nowLocal = new Date(Date.now() + 3600_000).toISOString();
  return (
    <>
      <ResourcePage<any> title="Entregas e pedidos" description="Pedidos, endereços, entregadores, prazos e ocorrências." module="entregas" endpoint="/deliveries" entity="entrega" newLabel="Nova entrega"
        defaultSort={{ key: 'scheduled_for', dir: 'asc' }}
        help={<p>Ao concluir uma entrega com <b>custo</b> informado, a despesa é lançada automaticamente no financeiro (uma única vez).</p>}
        filters={[{ key: 'status', label: 'Situação', options: DELIVERY_STATUS }, { key: 'late', label: 'Prazo', options: { '1': 'Atrasadas' }, allLabel: 'Todos os prazos' }, { key: 'open', label: 'Abertas', options: { '1': 'Somente em aberto' }, allLabel: 'Abertas e encerradas' }]}
        empty={{ title: 'Nenhuma entrega', icon: <Truck className="size-6" /> }}
        rowClassName={(r) => (r.is_late ? 'bg-red-50/40' : undefined)}
        canDelete={(r) => r.status !== 'concluida'}
        columns={[
          { key: 'number', header: 'Nº', sortKey: 'number', primary: true, render: (r) => <span className="font-semibold">#{r.number}</span> },
          { key: 'recipient', header: 'Destinatário', sortKey: 'recipient', render: (r) => <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); setOpen(r.id); }}><p className="font-medium hover:underline">{r.recipient_name}</p><p className="text-xs text-ink-500">{[r.address, r.neighborhood].filter(Boolean).join(' · ')}</p></button> },
          { key: 'scheduled_for', header: 'Previsto', sortKey: 'scheduled_for', render: (r) => <span className={cn(r.is_late && 'font-semibold text-red-600')}>{formatDateTime(r.scheduled_for, tz)}</span> },
          { key: 'courier_name', header: 'Entregador', hideOnMobile: true },
          { key: 'cost', header: 'Taxa / custo', align: 'right', hideOnMobile: true, render: (r) => `${formatBRL(r.fee)} / ${formatBRL(r.cost)}` },
          { key: 'status', header: 'Situação', render: (r) => can('entregas', 'write') && !['concluida', 'cancelada'].includes(r.status) ? (
            <Select value={r.status} onClick={(e) => e.stopPropagation()} onChange={(e) => quick(`/deliveries/${r.id}/status`, { status: e.target.value }, qc, '/deliveries')} className="h-8 w-40 text-xs" aria-label="Situação">
              {Object.entries(DELIVERY_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>) : <div className="flex gap-1"><StatusBadge status={r.status} labels={DELIVERY_STATUS} />{r.delivered_late && <Badge tone="warning">Com atraso</Badge>}</div> },
        ]}
        rowActions={(r) => [{ label: 'Linha do tempo e ocorrências', icon: <MessageSquare className="size-4" />, onSelect: () => setOpen(r.id) }]}
        schema={deliverySchema} defaults={() => ({ scheduled_for: nowLocal, fee: 0, cost: 0 })}
        fields={[
          { name: 'customer_id', label: 'Cliente', type: 'entity', endpoint: '/customers/options', onChangeEffect: (_v, f, o) => { if (o) { f.setValue('recipient_name', o.name); if (o.address) f.setValue('address', o.address); if (o.phone) f.setValue('recipient_phone', o.phone); } } },
          { name: 'recipient_name', label: 'Destinatário', required: true }, { name: 'recipient_phone', label: 'Telefone', type: 'tel' },
          { name: 'address', label: 'Endereço', required: true, span: 2 }, { name: 'neighborhood', label: 'Bairro/região' },
          { name: 'scheduled_for', label: 'Data e hora previstas', type: 'datetime', required: true }, { name: 'courier_id', label: 'Entregador', type: 'entity', endpoint: '/staff/options' },
          { name: 'description', label: 'Itens do pedido', type: 'textarea' }, { name: 'fee', label: 'Taxa cobrada', type: 'money' }, { name: 'cost', label: 'Custo da entrega', type: 'money' },
          { name: 'distance_km', label: 'Distância (km)', type: 'number', step: 0.1 }, { name: 'notes', label: 'Observações', type: 'textarea' },
        ]} />
      <TimelineDialog endpoint="/deliveries" id={open} onClose={() => setOpen(null)} invalidate="/deliveries" title={(d) => `Entrega #${d.number} — ${d.recipient_name}`} listKey="events"
        postPath="occurrences" postField="note" postLabel="Registrar ocorrência (ex.: cliente ausente)…" canPost={can('entregas', 'write')}
        header={(d) => <p className="text-sm text-ink-600">{d.address} · previsto {formatDateTime(d.scheduled_for, tz)} · <StatusBadge status={d.status} labels={DELIVERY_STATUS} /></p>} />
    </>
  );
}

export function Maintenance() {
  const [tab, setTab] = useState('equipamentos');
  return (
    <Tabs value={tab} onValueChange={setTab} tabs={[{ value: 'equipamentos', label: 'Equipamentos' }, { value: 'ordens', label: 'Manutenções' }]}>
      <TabPanel value="equipamentos">
        <ResourcePage<any> title="Equipamentos" description="Cadastro, situação e manutenção preventiva." module="manutencao" endpoint="/equipment" entity="equipamento" newLabel="Novo equipamento" softDelete
          defaultSort={{ key: 'name', dir: 'asc' }} filters={[{ key: 'status', label: 'Situação', options: EQUIPMENT_STATUS }, { key: 'preventive_due', label: 'Preventiva', options: { '1': 'Preventiva em 7 dias' }, allLabel: 'Todas' }]}
          empty={{ title: 'Nenhum equipamento', icon: <Wrench className="size-6" /> }}
          columns={[
            { key: 'name', header: 'Equipamento', sortKey: 'name', primary: true, render: (r) => <div><p className="font-semibold">{r.name}</p><p className="text-xs text-ink-500">{[r.brand, r.model, r.location].filter(Boolean).join(' · ')}</p></div> },
            { key: 'status', header: 'Situação', render: (r) => <StatusBadge status={r.status} labels={EQUIPMENT_STATUS} /> },
            { key: 'next_preventive_on', header: 'Próxima preventiva', sortKey: 'next_preventive_on', render: (r) => <span className={cn(r.preventive_due && 'font-semibold text-amber-600')}>{formatDate(r.next_preventive_on)}</span> },
            { key: 'defects', header: 'Defeitos', align: 'right', hideOnMobile: true },
            { key: 'total_cost', header: 'Custo de reparos', sortKey: 'total_cost', align: 'right', render: (r) => formatBRL(r.total_cost) },
          ]}
          schema={equipmentSchema} defaults={() => ({ status: 'operando' })}
          fields={[{ name: 'name', label: 'Nome', required: true, span: 2 }, { name: 'category', label: 'Categoria' }, { name: 'location', label: 'Local' }, { name: 'brand', label: 'Marca' }, { name: 'model', label: 'Modelo' },
            { name: 'serial', label: 'Nº de série' }, { name: 'purchase_date', label: 'Data de compra', type: 'date' }, { name: 'status', label: 'Situação', type: 'select', options: EQUIPMENT_STATUS, required: true },
            { name: 'preventive_interval_days', label: 'Intervalo da preventiva (dias)', type: 'number' }, { name: 'next_preventive_on', label: 'Próxima preventiva', type: 'date' }, { name: 'notes', label: 'Observações', type: 'textarea' }]} />
      </TabPanel>
      <TabPanel value="ordens">
        <ResourcePage<any> title="Manutenções" description="Ordens de manutenção corretiva e preventiva, custos e responsáveis." module="manutencao" endpoint="/maintenance" entity="manutenção" newLabel="Nova manutenção"
          help={<p>Ao concluir com custo e a opção “lançar despesa”, o valor vai para o financeiro. Preventivas concluídas reprogramam a próxima data do equipamento.</p>}
          defaultSort={{ key: 'created_at', dir: 'desc' }} filters={[{ key: 'status', label: 'Situação', options: MAINTENANCE_STATUS }, { key: 'type', label: 'Tipo', options: MAINTENANCE_TYPE }]}
          columns={[
            { key: 'equipment', header: 'Equipamento', sortKey: 'equipment', primary: true, render: (r) => <div><p className="font-semibold">{r.equipment_name}</p><p className="text-xs text-ink-500">{r.problem}</p></div> },
            { key: 'type', header: 'Tipo', render: (r) => MAINTENANCE_TYPE[r.type as keyof typeof MAINTENANCE_TYPE] },
            { key: 'scheduled_on', header: 'Agendada', sortKey: 'scheduled_on', render: (r) => formatDate(r.scheduled_on) },
            { key: 'responsible', header: 'Responsável', hideOnMobile: true, render: (r) => r.responsible ?? r.supplier_name ?? '—' },
            { key: 'cost', header: 'Custo', sortKey: 'cost', align: 'right', render: (r) => formatBRL(r.cost) },
            { key: 'status', header: 'Situação', render: (r) => <StatusBadge status={r.status} labels={MAINTENANCE_STATUS} /> },
          ]}
          schema={maintenanceSchema} defaults={() => ({ type: 'corretiva', status: 'aberta', cost: 0, register_expense: true })}
          fields={[{ name: 'equipment_id', label: 'Equipamento', type: 'entity', endpoint: '/equipment/options', required: true, span: 2 }, { name: 'type', label: 'Tipo', type: 'select', options: MAINTENANCE_TYPE, required: true },
            { name: 'status', label: 'Situação', type: 'select', options: MAINTENANCE_STATUS, required: true }, { name: 'problem', label: 'Defeito / serviço', type: 'textarea', required: true },
            { name: 'solution', label: 'Solução aplicada', type: 'textarea' }, { name: 'scheduled_on', label: 'Data agendada', type: 'date' }, { name: 'completed_on', label: 'Concluída em', type: 'date' },
            { name: 'responsible', label: 'Responsável' }, { name: 'supplier_id', label: 'Prestador (fornecedor)', type: 'entity', endpoint: '/suppliers/options' },
            { name: 'cost', label: 'Custo do reparo', type: 'money' }, { name: 'register_expense', label: 'Lançar despesa ao concluir', type: 'switch' }, { name: 'notes', label: 'Observações', type: 'textarea' }]} />
      </TabPanel>
    </Tabs>
  );
}

export function Waste() {
  const tz = useTimezone();
  const { data } = useQuery({ queryKey: ['/waste', 'summary'], queryFn: () => api.get<{ data: any }>('/waste-summary').then((r) => r.data) });
  return (
    <ResourcePage<any> title="Desperdícios" description="Perdas de produtos danificados, vencidos ou perdidos e seu impacto." module="desperdicios" endpoint="/waste" entity="registro de perda" newLabel="Registrar perda"
      help={<p>Quando vinculado a um produto, o registro <b>baixa o estoque</b> automaticamente. O impacto é estimado por quantidade × custo unitário.</p>}
      defaultSort={{ key: 'occurred_on', dir: 'desc' }} filters={[{ key: 'reason', label: 'Motivo', options: WASTE_REASON }]}
      beforeTable={data && data.count > 0 ? (
        <div className="mb-4 grid gap-4 md:grid-cols-[1fr_2fr]">
          <Card className="p-5"><p className="text-xs font-semibold text-ink-500">Impacto no mês</p><p className="mt-1 font-display text-3xl font-extrabold text-red-600">{formatBRL(data.total)}</p>
            <p className="text-xs text-ink-500">{data.count} registros{data.ratio !== null ? ` · ${(data.ratio * 100).toFixed(1)}% do valor vendido` : ''}</p></Card>
          <Card className="p-3"><DonutChart data={data.byReason} valueKey="total" labels={WASTE_REASON} money height={180} /></Card>
        </div>) : undefined}
      empty={{ title: 'Nenhuma perda registrada', icon: <Trash2 className="size-6" /> }}
      columns={[
        { key: 'description', header: 'Item', sortKey: 'description', primary: true, render: (r) => <div><p className="font-semibold">{r.description}</p>{r.product_name && <p className="text-xs text-ink-500">Produto: {r.product_name}</p>}</div> },
        { key: 'reason', header: 'Motivo', render: (r) => <Badge tone="warning">{WASTE_REASON[r.reason as keyof typeof WASTE_REASON]}</Badge> },
        { key: 'quantity', header: 'Qtd.', sortKey: 'quantity', align: 'right', render: (r) => `${formatNumber(r.quantity)} ${r.unit}` },
        { key: 'total_cost', header: 'Impacto', sortKey: 'total_cost', align: 'right', render: (r) => <span className="font-semibold text-red-600">{formatBRL(r.total_cost)}</span> },
        { key: 'occurred_on', header: 'Data', sortKey: 'occurred_on', render: (r) => formatDate(r.occurred_on) },
      ]}
      schema={wasteSchema} defaults={() => ({ occurred_on: todayIn(tz), reason: 'vencido', quantity: 1, unit_cost: 0, deduct_stock: true, unit: 'un' })}
      fields={[{ name: 'product_id', label: 'Produto do estoque', type: 'entity', endpoint: '/products/options', span: 2, hint: 'Opcional. Se informado, baixa o estoque.', onChangeEffect: (_v, f, o) => { if (o) { f.setValue('description', o.name); f.setValue('unit_cost', o.cost_price ?? 0); } } },
        { name: 'description', label: 'Descrição', required: true, span: 2 }, { name: 'quantity', label: 'Quantidade', type: 'number', step: 0.001, required: true }, { name: 'unit_cost', label: 'Custo unitário', type: 'money' },
        { name: 'reason', label: 'Motivo', type: 'select', options: WASTE_REASON, required: true }, { name: 'occurred_on', label: 'Data', type: 'date', required: true },
        { name: 'deduct_stock', label: 'Baixar do estoque', type: 'switch', showIf: (v) => !!v.product_id }, { name: 'notes', label: 'Observações', type: 'textarea' }]} />
  );
}

export function Feedbacks() {
  const can = useCan();
  const tz = useTimezone();
  const [open, setOpen] = useState<string | null>(null);
  const { data: sum } = useQuery({ queryKey: ['/feedbacks', 'summary'], queryFn: () => api.get<{ data: any }>('/feedback-summary').then((r) => r.data) });
  return (
    <>
      <ResourcePage<any> title="Avaliações e reclamações" description="Opiniões, ocorrências, responsáveis, prazos e providências." module="avaliacoes" endpoint="/feedbacks" entity="registro" newLabel="Registrar"
        defaultSort={{ key: 'received_on', dir: 'desc' }} filters={[{ key: 'type', label: 'Tipo', options: FEEDBACK_TYPE }, { key: 'status', label: 'Situação', options: FEEDBACK_STATUS }]}
        beforeTable={sum && <div className="mb-4 grid gap-3 sm:grid-cols-4">{[
          ['Nota média (90 dias)', sum.avg_rating_90d ? `${String(sum.avg_rating_90d).replace('.', ',')} ★` : '—'], ['Reclamações abertas', sum.open_complaints], ['Com prazo vencido', sum.overdue], ['Tempo médio de solução', sum.avg_resolution_days ? `${String(sum.avg_resolution_days).replace('.', ',')} dias` : '—'],
        ].map(([l, v]) => <Card key={l as string} className="p-4"><p className="text-xs font-semibold text-ink-500">{l}</p><p className="mt-1 font-display text-2xl font-extrabold">{v}</p></Card>)}</div>}
        empty={{ title: 'Nenhum registro', icon: <MessageSquareWarning className="size-6" /> }}
        columns={[
          { key: 'title', header: 'Assunto', primary: true, render: (r) => <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); setOpen(r.id); }}><p className="font-semibold hover:underline">{r.title}</p><p className="text-xs text-ink-500">{r.customer_name ?? 'Sem cliente'}{r.channel ? ` · ${r.channel}` : ''}</p></button> },
          { key: 'type', header: 'Tipo', render: (r) => <Badge tone={r.type === 'reclamacao' ? 'danger' : r.type === 'elogio' ? 'success' : 'info'}>{FEEDBACK_TYPE[r.type as keyof typeof FEEDBACK_TYPE]}</Badge> },
          { key: 'rating', header: 'Nota', sortKey: 'rating', render: (r) => (r.rating ? <Rating value={r.rating} readOnly size={14} /> : '—') },
          { key: 'responsible_name', header: 'Responsável', hideOnMobile: true },
          { key: 'due_date', header: 'Prazo', sortKey: 'due_date', render: (r) => <span className={cn(r.is_overdue && 'font-semibold text-red-600')}>{formatDate(r.due_date)}</span> },
          { key: 'status', header: 'Situação', render: (r) => <StatusBadge status={r.status} labels={FEEDBACK_STATUS} /> },
        ]}
        rowActions={(r) => [{ label: 'Providências', icon: <CircleCheck className="size-4" />, onSelect: () => setOpen(r.id) }]}
        schema={feedbackSchema} defaults={() => ({ type: 'reclamacao', status: 'aberta', received_on: todayIn(tz) })}
        fields={[{ name: 'type', label: 'Tipo', type: 'select', options: FEEDBACK_TYPE, required: true }, { name: 'rating', label: 'Nota', type: 'rating' }, { name: 'title', label: 'Assunto', required: true, span: 2 },
          { name: 'description', label: 'Descrição', type: 'textarea' }, { name: 'customer_id', label: 'Cliente', type: 'entity', endpoint: '/customers/options' }, { name: 'channel', label: 'Canal (ex.: Google, WhatsApp)' },
          { name: 'responsible_id', label: 'Responsável pela resolução', type: 'entity', endpoint: '/staff/options' }, { name: 'due_date', label: 'Prazo', type: 'date' },
          { name: 'status', label: 'Situação', type: 'select', options: FEEDBACK_STATUS, required: true }, { name: 'received_on', label: 'Recebido em', type: 'date', required: true }]} />
      <TimelineDialog endpoint="/feedbacks" id={open} onClose={() => setOpen(null)} invalidate="/feedbacks" title={(d) => d.title} listKey="actions" postPath="actions" postField="description" postLabel="Descreva a providência tomada…" canPost={can('avaliacoes', 'write')}
        header={(d) => d.description && <p className="text-sm text-ink-700">{d.description}</p>} />
    </>
  );
}

export function Issues() {
  const can = useCan();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <ResourcePage<any> title="Central de solicitações" description="Problemas internos de equipamentos, sistemas e processos." module="solicitacoes" endpoint="/issues" entity="solicitação" newLabel="Nova solicitação"
        defaultSort={{ key: 'created_at', dir: 'desc' }} filters={[{ key: 'status', label: 'Situação', options: ISSUE_STATUS }, { key: 'category', label: 'Categoria', options: ISSUE_CATEGORY }, { key: 'priority', label: 'Prioridade', options: PRIORITY }]}
        empty={{ title: 'Nenhuma solicitação', icon: <LifeBuoy className="size-6" /> }}
        columns={[
          { key: 'title', header: 'Solicitação', primary: true, render: (r) => <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); setOpen(r.id); }}><p className="font-semibold hover:underline">{r.title}</p><p className="text-xs text-ink-500">{ISSUE_CATEGORY[r.category as keyof typeof ISSUE_CATEGORY]}{r.equipment_name ? ` · ${r.equipment_name}` : ''} · aberta por {r.created_by_name ?? '—'}</p></button> },
          { key: 'priority', header: 'Prioridade', sortKey: 'priority', render: (r) => <StatusBadge status={r.priority} labels={PRIORITY} /> },
          { key: 'responsible_name', header: 'Responsável', hideOnMobile: true },
          { key: 'due_date', header: 'Prazo', sortKey: 'due_date', render: (r) => <span className={cn(r.is_overdue && 'font-semibold text-red-600')}>{formatDate(r.due_date)}</span> },
          { key: 'status', header: 'Situação', render: (r) => <StatusBadge status={r.status} labels={ISSUE_STATUS} /> },
        ]}
        rowActions={(r) => [{ label: 'Atualizações', icon: <MessageSquare className="size-4" />, onSelect: () => setOpen(r.id) }]}
        schema={issueSchema} defaults={() => ({ category: 'processo', priority: 'media', status: 'aberta' })}
        fields={[{ name: 'title', label: 'Título', required: true, span: 2 }, { name: 'category', label: 'Categoria', type: 'select', options: ISSUE_CATEGORY, required: true }, { name: 'priority', label: 'Prioridade', type: 'select', options: PRIORITY, required: true },
          { name: 'description', label: 'Descrição', type: 'textarea' }, { name: 'equipment_id', label: 'Equipamento relacionado', type: 'entity', endpoint: '/equipment/options', showIf: (v) => v.category === 'equipamento' },
          { name: 'responsible_id', label: 'Responsável', type: 'entity', endpoint: '/staff/options' }, { name: 'due_date', label: 'Prazo', type: 'date' }, { name: 'status', label: 'Situação', type: 'select', options: ISSUE_STATUS, required: true }]} />
      <TimelineDialog endpoint="/issues" id={open} onClose={() => setOpen(null)} invalidate="/issues" title={(d) => d.title} listKey="updates" postPath="updates" postLabel="Registrar atualização…" canPost={can('solicitacoes', 'write')}
        header={(d) => d.description && <p className="text-sm text-ink-700">{d.description}</p>} />
    </>
  );
}
