import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CalendarPlus, Mail, MessageCircle, Pencil, Phone, ShoppingCart, Users } from 'lucide-react';
import {
  APPOINTMENT_STATUS, CONTACT_CHANNEL, CONTACT_OUTCOME, CUSTOMER_RELATIONSHIP, FEEDBACK_STATUS, FEEDBACK_TYPE, PET_SPECIES, SALE_STATUS, TX_STATUS, WORK_ORDER_STATUS,
  customerSchema, formatBRL, formatDate, formatDateTime, formatDocument, formatPhone,
} from '@nexo/shared';
import { api } from '@/lib/api';
import { useCan, useTerm, useTimezone } from '@/lib/auth';
import { relativeTime } from '@/lib/utils';
import { ResourcePage } from '@/components/resource-page';
import { Badge, Button, Card, EmptyState, ErrorState, KeyValue, PageHeader, PageLoader, StatusBadge, Tabs, TabPanel } from '@/components/ui';
import { FormSheet, type FieldDef } from '@/components/form/form';

export const CUSTOMER_FIELDS: FieldDef[] = [
  { name: 'name', label: 'Nome completo', required: true, span: 2 },
  { name: 'phone', label: 'Telefone', type: 'tel' },
  { name: 'whatsapp', label: 'WhatsApp', type: 'tel' },
  { name: 'email', label: 'E-mail', type: 'email' },
  { name: 'document', label: 'CPF/CNPJ', type: 'document' },
  { name: 'birth_date', label: 'Data de nascimento', type: 'date' },
  { name: 'relationship', label: 'Situação do relacionamento', type: 'select', options: CUSTOMER_RELATIONSHIP, required: true },
  { name: 'address', label: 'Endereço', span: 2 },
  { name: 'notes', label: 'Observações', type: 'textarea' },
];

const waLink = (phone?: string | null) => (phone ? `https://wa.me/55${phone.replace(/\D/g, '')}` : undefined);

export function Customers() {
  const navigate = useNavigate();
  const label = useTerm('customers', 'Clientes');
  const singular = useTerm('customer', 'cliente').toLowerCase();
  return (
    <ResourcePage<any>
      title={label} description="Cadastro, histórico e relacionamento." module="clientes" endpoint="/customers" entity={singular} newLabel={`Novo ${singular}`}
      help={<><p>Aqui ficam todos os seus {label.toLowerCase()}. O <b>último atendimento</b> e o <b>total gasto</b> são calculados automaticamente a partir das vendas e da agenda.</p><p>Clientes sem compra ou atendimento há mais de 90 dias aparecem como <b>inativos</b> — use o filtro para encontrá-los.</p></>}
      softDelete defaultSort={{ key: 'name', dir: 'asc' }}
      detailPath={(r) => `/app/clientes/${r.id}`}
      filters={[
        { key: 'relationship', label: 'Relacionamento', options: CUSTOMER_RELATIONSHIP },
        { key: 'inactive', label: 'Atividade', options: { '1': 'Inativos (90+ dias)' }, allLabel: 'Toda atividade' },
      ]}
      empty={{ title: `Nenhum ${singular} cadastrado`, description: 'Cadastre seus clientes para registrar vendas, agendamentos e acompanhar o relacionamento.', icon: <Users className="size-6" /> }}
      columns={[
        { key: 'name', header: 'Nome', sortKey: 'name', primary: true, render: (r) => <div><p className="font-semibold text-ink-900">{r.name}</p><p className="text-xs text-ink-500">{r.email ?? ''}</p></div> },
        { key: 'phone', header: 'Telefone', render: (r) => formatPhone(r.phone ?? r.whatsapp) },
        { key: 'relationship', header: 'Situação', render: (r) => <div className="flex flex-wrap gap-1"><StatusBadge status={r.relationship} labels={CUSTOMER_RELATIONSHIP} />{r.is_inactive && r.relationship !== 'inativo' && <Badge>Sem retorno 90d</Badge>}</div> },
        { key: 'last_visit_at', header: 'Último atendimento', sortKey: 'last_visit_at', render: (r) => (r.last_visit_at ? relativeTime(r.last_visit_at) : <span className="text-ink-400">Nunca</span>) },
        { key: 'visits', header: 'Visitas', sortKey: 'visits', align: 'right', hideOnMobile: true },
        { key: 'total_spent', header: 'Total gasto', sortKey: 'total_spent', align: 'right', render: (r) => <span className="tabular">{formatBRL(r.total_spent)}</span> },
      ]}
      rowActions={(r) => [r.whatsapp || r.phone ? { label: 'Abrir WhatsApp', icon: <MessageCircle className="size-4" />, onSelect: () => window.open(waLink(r.whatsapp ?? r.phone), '_blank', 'noopener') } : false,
        { label: 'Ver histórico', icon: <Users className="size-4" />, onSelect: () => navigate(`/app/clientes/${r.id}`) }]}
      schema={customerSchema}
      defaults={() => ({ relationship: 'novo' })}
      fields={CUSTOMER_FIELDS}
    />
  );
}

export function CustomerDetail() {
  const { id } = useParams();
  const tz = useTimezone();
  const can = useCan();
  const qc = useQueryClient();
  const [tab, setTab] = useState('compras');
  const [editing, setEditing] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['/customers', 'detail', id], queryFn: () => api.get<{ data: any }>(`/customers/${id}`).then((r) => r.data) });
  const save = useMutation({
    mutationFn: (v: any) => api.put(`/customers/${id}`, v),
    onSuccess: () => { toast.success('Cliente atualizado.'); setEditing(false); qc.invalidateQueries({ queryKey: ['/customers'] }); },
  });
  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const h = data.history;
  const openReceivable = h.receivables.reduce((s: number, r: any) => s + (r.amount - r.amount_paid), 0);
  return (
    <div>
      <PageHeader
        back={<Link to="/app/clientes" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"><ArrowLeft className="size-4" />Clientes</Link>}
        title={<span className="flex items-center gap-3">{data.name}<StatusBadge status={data.relationship} labels={CUSTOMER_RELATIONSHIP} /></span>}
        description={data.archived_at ? 'Cliente arquivado' : data.is_inactive ? 'Sem compra ou atendimento há mais de 90 dias' : undefined}
        actions={<>
          {(data.whatsapp || data.phone) && <a href={waLink(data.whatsapp ?? data.phone)} target="_blank" rel="noopener noreferrer"><Button icon={<MessageCircle className="size-4" />}>WhatsApp</Button></a>}
          {can('agenda', 'write') && <Link to={`/app/agenda?novo=1&cliente=${data.id}`}><Button icon={<CalendarPlus className="size-4" />}>Agendar</Button></Link>}
          {can('vendas', 'write') && <Link to={`/app/vendas/nova?cliente=${data.id}`}><Button variant="primary" icon={<ShoppingCart className="size-4" />}>Registrar venda</Button></Link>}
          {can('clientes', 'write') && <Button variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Editar</Button>}
        </>} />
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="grid grid-cols-3 gap-3 border-b border-ink-100 pb-4 text-center">
              <div><p className="font-display text-xl font-extrabold tabular">{data.visits}</p><p className="text-xs text-ink-500">Visitas</p></div>
              <div><p className="font-display text-xl font-extrabold tabular">{formatBRL(data.total_spent)}</p><p className="text-xs text-ink-500">Total gasto</p></div>
              <div><p className="font-display text-xl font-extrabold">{data.last_visit_at ? relativeTime(data.last_visit_at) : '—'}</p><p className="text-xs text-ink-500">Último</p></div>
            </div>
            <KeyValue className="mt-4 !grid-cols-1" items={[
              { label: 'Telefone', value: data.phone ? <a href={`tel:${data.phone}`} className="inline-flex items-center gap-1.5 text-brand-700"><Phone className="size-3.5" />{formatPhone(data.phone)}</a> : '—' },
              { label: 'WhatsApp', value: formatPhone(data.whatsapp) },
              { label: 'E-mail', value: data.email ? <a href={`mailto:${data.email}`} className="inline-flex items-center gap-1.5 text-brand-700"><Mail className="size-3.5" />{data.email}</a> : '—' },
              { label: 'CPF/CNPJ', value: formatDocument(data.document) },
              { label: 'Nascimento', value: formatDate(data.birth_date) },
              { label: 'Endereço', value: data.address },
              { label: 'Cliente desde', value: formatDate(data.created_at) },
              { label: 'Observações', value: data.notes ? <span className="whitespace-pre-line">{data.notes}</span> : '—' },
            ]} />
          </Card>
          {openReceivable > 0 && (
            <Card className="border-amber-200 bg-amber-50/50 p-4">
              <p className="text-sm font-semibold text-amber-900">Valores em aberto: {formatBRL(openReceivable)}</p>
              <Link to={`/app/cobrancas?customer_id=${data.id}`} className="text-xs font-semibold text-amber-800 underline">Ver contas a receber</Link>
            </Card>
          )}
        </div>
        <Card className="p-5">
          <Tabs value={tab} onValueChange={setTab} tabs={[
            { value: 'compras', label: 'Compras', count: h.sales.length },
            { value: 'atendimentos', label: 'Atendimentos', count: h.appointments.length },
            ...(h.pets.length || can('animais') ? [{ value: 'pets', label: 'Animais', count: h.pets.length }] : []),
            ...(h.vehicles.length || h.workOrders.length ? [{ value: 'veiculos', label: 'Veículos e OS', count: h.vehicles.length + h.workOrders.length }] : []),
            { value: 'cobrancas', label: 'Em aberto', count: h.receivables.length },
            { value: 'contatos', label: 'Contatos', count: h.contacts.length },
            { value: 'avaliacoes', label: 'Avaliações', count: h.feedbacks.length },
          ]}>
            <TabPanel value="compras">
              {h.sales.length ? <ul className="divide-y divide-ink-100">{h.sales.map((s: any) => (
                <li key={s.id}><Link to={`/app/vendas/${s.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-ink-50">
                  <div className="min-w-0"><p className="text-sm font-medium">Venda #{s.number} · <span className="text-ink-500">{formatDateTime(s.sold_at, tz)}</span></p><p className="truncate text-xs text-ink-500">{s.items}</p></div>
                  <div className="text-right"><p className="font-semibold tabular">{formatBRL(s.total)}</p>{s.status === 'cancelada' && <StatusBadge status={s.status} labels={SALE_STATUS} />}</div>
                </Link></li>))}</ul> : <EmptyState compact title="Nenhuma compra registrada" />}
            </TabPanel>
            <TabPanel value="atendimentos">
              {h.appointments.length ? <ul className="divide-y divide-ink-100">{h.appointments.map((a: any) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                  <div><p className="text-sm font-medium">{a.service_name ?? 'Atendimento'}</p><p className="text-xs text-ink-500">{formatDateTime(a.starts_at, tz)}{a.employee_name ? ` · ${a.employee_name}` : ''}</p></div>
                  <StatusBadge status={a.status} labels={APPOINTMENT_STATUS} />
                </li>))}</ul> : <EmptyState compact title="Nenhum atendimento" />}
            </TabPanel>
            <TabPanel value="pets">
              {h.pets.length ? <ul className="divide-y divide-ink-100">{h.pets.map((p: any) => (
                <li key={p.id} className="flex items-center justify-between py-3"><div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-ink-500">{PET_SPECIES[p.species as keyof typeof PET_SPECIES]}{p.breed ? ` · ${p.breed}` : ''}</p></div>
                  {p.next_return && <span className="text-xs text-ink-500">Retorno: {formatDate(p.next_return)}</span>}</li>))}</ul>
                : <EmptyState compact title="Nenhum animal" action={can('animais', 'write') ? <Link to="/app/animais?novo=1"><Button size="sm" variant="subtle">Cadastrar animal</Button></Link> : undefined} />}
            </TabPanel>
            <TabPanel value="veiculos">
              <ul className="divide-y divide-ink-100">
                {h.vehicles.map((v: any) => <li key={v.id} className="py-3 text-sm"><span className="mr-2 rounded bg-ink-900 px-1.5 py-0.5 font-mono text-xs font-bold text-white">{v.plate}</span>{[v.brand, v.model, v.year].filter(Boolean).join(' ')}</li>)}
                {h.workOrders.map((w: any) => (
                  <li key={w.id}><Link to={`/app/ordens-servico/${w.id}`} className="flex items-center justify-between py-3 hover:bg-ink-50">
                    <span className="text-sm">OS #{w.number} · {w.title} <span className="text-xs text-ink-500">({formatDate(w.opened_on)})</span></span>
                    <span className="flex items-center gap-2"><span className="text-sm tabular">{formatBRL(w.total)}</span><StatusBadge status={w.status} labels={WORK_ORDER_STATUS} /></span>
                  </Link></li>))}
              </ul>
            </TabPanel>
            <TabPanel value="cobrancas">
              {h.receivables.length ? <ul className="divide-y divide-ink-100">{h.receivables.map((r: any) => (
                <li key={r.id} className="flex items-center justify-between py-3"><div><p className="text-sm font-medium">{r.description}</p><p className="text-xs text-ink-500">Vence em {formatDate(r.due_date)}</p></div>
                  <div className="text-right"><p className="font-semibold tabular">{formatBRL(r.amount - r.amount_paid)}</p><StatusBadge status={r.status} labels={TX_STATUS} /></div></li>))}</ul>
                : <EmptyState compact title="Nada em aberto" description="Este cliente não tem valores pendentes." />}
            </TabPanel>
            <TabPanel value="contatos">
              {h.contacts.length ? <ul className="divide-y divide-ink-100">{h.contacts.map((c: any) => (
                <li key={c.id} className="py-3"><p className="text-sm font-medium">{formatDate(c.contacted_on)} · {CONTACT_CHANNEL[c.channel as keyof typeof CONTACT_CHANNEL]} · {CONTACT_OUTCOME[c.outcome as keyof typeof CONTACT_OUTCOME]}</p>
                  {c.campaign_name && <p className="text-xs text-ink-500">Campanha: {c.campaign_name}</p>}{c.notes && <p className="text-xs text-ink-600">{c.notes}</p>}</li>))}</ul>
                : <EmptyState compact title="Nenhum contato registrado" action={can('fidelizacao', 'write') ? <Link to="/app/fidelizacao"><Button size="sm" variant="subtle">Ir para Fidelização</Button></Link> : undefined} />}
            </TabPanel>
            <TabPanel value="avaliacoes">
              {h.feedbacks.length ? <ul className="divide-y divide-ink-100">{h.feedbacks.map((f: any) => (
                <li key={f.id} className="flex items-center justify-between py-3"><div><p className="text-sm font-medium">{f.title}</p><p className="text-xs text-ink-500">{FEEDBACK_TYPE[f.type as keyof typeof FEEDBACK_TYPE]} · {formatDate(f.received_on)}</p></div>
                  <StatusBadge status={f.status} labels={FEEDBACK_STATUS} /></li>))}</ul> : <EmptyState compact title="Nenhuma avaliação" />}
            </TabPanel>
          </Tabs>
        </Card>
      </div>
      <FormSheet open={editing} onOpenChange={setEditing} title="Editar cliente" fields={CUSTOMER_FIELDS} schema={customerSchema} initial={data} tz={tz} onSubmit={(v) => save.mutateAsync(v)} />
    </div>
  );
}
