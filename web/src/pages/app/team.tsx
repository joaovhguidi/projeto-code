import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, UserRound } from 'lucide-react';
import { EMPLOYEE_STATUS, ROLE_LABELS, SHIFT_KIND, TASK_STATUS, TRAINING_KIND, employeeSchema, formatDate, formatPhone, trainingSchema } from '@nexo/shared';
import { api } from '@/lib/api';
import { useCan, useTimezone } from '@/lib/auth';
import { ResourcePage } from '@/components/resource-page';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, KeyValue, PageHeader, PageLoader, StatusBadge, useConfirm } from '@/components/ui';
import { FormSheet, type FieldDef } from '@/components/form/form';

const FIELDS: FieldDef[] = [
  { name: 'name', label: 'Nome', required: true, span: 2 }, { name: 'role_title', label: 'Função' }, { name: 'status', label: 'Situação', type: 'select', options: EMPLOYEE_STATUS, required: true },
  { name: 'phone', label: 'Telefone', type: 'tel' }, { name: 'email', label: 'E-mail', type: 'email' }, { name: 'document', label: 'CPF', type: 'document' }, { name: 'hire_date', label: 'Admissão', type: 'date' },
  { name: 'work_schedule', label: 'Horário de trabalho', span: 2, placeholder: 'Ex.: seg a sex, 9h às 18h' }, { name: 'responsibilities', label: 'Responsabilidades', type: 'textarea' },
  { name: 'color', label: 'Cor na agenda', type: 'color' }, { name: 'notes', label: 'Observações', type: 'textarea' },
];

export function Team() {
  return (
    <ResourcePage<any> title="Equipe" description="Colaboradores, funções, horários e treinamentos." module="equipe" endpoint="/employees" entity="colaborador" newLabel="Novo colaborador" softDelete
      help={<p>Para dar acesso ao sistema a um colaborador, crie um usuário em <b>Configurações → Usuários e permissões</b> e vincule ao cadastro. O acesso a dados financeiros depende da função escolhida.</p>}
      defaultSort={{ key: 'name', dir: 'asc' }} detailPath={(r) => `/app/equipe/${r.id}`} filters={[{ key: 'status', label: 'Situação', options: EMPLOYEE_STATUS }]}
      empty={{ title: 'Nenhum colaborador', icon: <UserRound className="size-6" /> }}
      columns={[
        { key: 'name', header: 'Nome', sortKey: 'name', primary: true, render: (r) => <span className="flex items-center gap-2.5"><Avatar name={r.name} color={r.color} size={30} /><span><span className="block font-semibold">{r.name}</span><span className="text-xs text-ink-500">{r.role_title ?? ''}</span></span></span> },
        { key: 'phone', header: 'Telefone', render: (r) => formatPhone(r.phone) },
        { key: 'work_schedule', header: 'Horário', hideOnMobile: true },
        { key: 'open_tasks', header: 'Tarefas abertas', align: 'right', hideOnMobile: true },
        { key: 'user_role', header: 'Acesso', render: (r) => (r.user_role ? <Badge tone="brand">{ROLE_LABELS[r.user_role as keyof typeof ROLE_LABELS]}</Badge> : <span className="text-xs text-ink-400">Sem usuário</span>) },
        { key: 'status', header: 'Situação', render: (r) => <StatusBadge status={r.status} labels={EMPLOYEE_STATUS} /> },
      ]}
      schema={employeeSchema} defaults={() => ({ status: 'ativo', color: '#0E9670' })} fields={FIELDS} />
  );
}

export function EmployeeDetail() {
  const { id } = useParams();
  const tz = useTimezone();
  const can = useCan();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [training, setTraining] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['/employees', 'detail', id], queryFn: () => api.get<{ data: any }>(`/employees/${id}`).then((r) => r.data) });
  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  return (
    <div>
      <PageHeader back={<Link to="/app/equipe" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"><ArrowLeft className="size-4" />Equipe</Link>}
        title={<span className="flex items-center gap-3"><Avatar name={data.name} color={data.color} size={40} />{data.name}<StatusBadge status={data.status} labels={EMPLOYEE_STATUS} /></span>} description={data.role_title}
        actions={can('equipe', 'write') && <Button variant="primary" onClick={() => setTraining(true)}>Registrar treinamento/documento</Button>} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit p-5"><KeyValue className="!grid-cols-1" items={[
          { label: 'Telefone', value: formatPhone(data.phone) }, { label: 'E-mail', value: data.email }, { label: 'Admissão', value: formatDate(data.hire_date) },
          { label: 'Horário', value: data.work_schedule }, { label: 'Responsabilidades', value: data.responsibilities }, { label: 'Acesso ao sistema', value: data.user_role ? ROLE_LABELS[data.user_role as keyof typeof ROLE_LABELS] : 'Sem usuário vinculado' },
        ]} /></Card>
        <div className="space-y-4">
          <Card><CardHeader title="Treinamentos e documentos" />
            {data.trainings.length ? <ul className="divide-y divide-ink-100 border-t border-ink-100">{data.trainings.map((t: any) => (
              <li key={t.id} className="flex items-center justify-between px-5 py-2.5 text-sm"><span><b>{t.title}</b> <Badge>{TRAINING_KIND[t.kind as keyof typeof TRAINING_KIND]}</Badge><span className="block text-xs text-ink-500">Concluído {formatDate(t.completed_on)}{t.expires_on ? ` · vence ${formatDate(t.expires_on)}` : ''}</span></span>
                {can('equipe', 'write') && <Button size="xs" variant="ghost" onClick={async () => { if (await confirm({ title: 'Excluir registro?', confirmLabel: 'Excluir' })) { await api.del(`/employee-trainings/${t.id}`); refetch(); } }}>Excluir</Button>}</li>))}</ul>
              : <EmptyState compact title="Nenhum registro" />}
          </Card>
          <Card><CardHeader title="Tarefas em aberto" />
            {data.tasks.length ? <ul className="divide-y divide-ink-100 border-t border-ink-100">{data.tasks.map((t: any) => <li key={t.id} className="flex justify-between px-5 py-2.5 text-sm"><Link to={`/app/tarefas?abrir=${t.id}`} className="hover:underline">{t.title}</Link><span className="text-ink-500">{formatDate(t.due_date)} · {TASK_STATUS[t.status as keyof typeof TASK_STATUS]}</span></li>)}</ul> : <EmptyState compact title="Nenhuma tarefa" />}
          </Card>
          <Card><CardHeader title="Escala próxima" />
            {data.shifts.length ? <ul className="divide-y divide-ink-100 border-t border-ink-100">{data.shifts.map((s: any) => <li key={s.id} className="px-5 py-2 text-sm">{formatDate(s.date)} · {SHIFT_KIND[s.kind as keyof typeof SHIFT_KIND]}{s.start_time ? ` ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}` : ''}</li>)}</ul> : <EmptyState compact title="Sem escala lançada" />}
          </Card>
        </div>
      </div>
      <FormSheet open={training} onOpenChange={setTraining} title="Treinamento ou documento" schema={trainingSchema} tz={tz} initial={{ employee_id: id, kind: 'treinamento' }}
        fields={[{ name: 'title', label: 'Título', required: true, span: 2 }, { name: 'kind', label: 'Tipo', type: 'select', options: TRAINING_KIND, required: true }, { name: 'completed_on', label: 'Concluído em', type: 'date' }, { name: 'expires_on', label: 'Validade', type: 'date' }, { name: 'notes', label: 'Observações', type: 'textarea' }]}
        onSubmit={async (v) => { await api.post('/employee-trainings', { ...v, employee_id: id }); toast.success('Registro salvo.'); setTraining(false); qc.invalidateQueries({ queryKey: ['/employees'] }); }} />
    </div>
  );
}
