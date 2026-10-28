import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageCircle, PhoneCall } from 'lucide-react';
import { CAMPAIGN_AUDIENCE, CAMPAIGN_STATUS, CONTACT_CHANNEL, CONTACT_OUTCOME, campaignSchema, customerContactSchema, formatDate, formatPhone, todayIn } from '@nexo/shared';
import { api } from '@/lib/api';
import { useCan, useTimezone } from '@/lib/auth';
import { relativeTime } from '@/lib/utils';
import { ResourcePage } from '@/components/resource-page';
import { Button, Card, CardHeader, EmptyState, PageHeader, StatusBadge, Tabs, TabPanel } from '@/components/ui';
import { FormSheet } from '@/components/form/form';

const CONTACT_FIELDS = [
  { name: 'customer_id', label: 'Cliente', type: 'entity', endpoint: '/customers/options', required: true, span: 2 },
  { name: 'campaign_id', label: 'Campanha', type: 'entity', endpoint: '/campaigns/options', span: 2 },
  { name: 'contacted_on', label: 'Data do contato', type: 'date', required: true }, { name: 'channel', label: 'Canal', type: 'select', options: CONTACT_CHANNEL, required: true },
  { name: 'outcome', label: 'Resultado', type: 'select', options: CONTACT_OUTCOME, required: true }, { name: 'returned_on', label: 'Retornou em', type: 'date' },
  { name: 'notes', label: 'Observações', type: 'textarea' },
] as const;

export default function Loyalty() {
  const tz = useTimezone();
  const can = useCan();
  const qc = useQueryClient();
  const [tab, setTab] = useState('visao');
  const [contact, setContact] = useState<any>(null);
  const { data } = useQuery({ queryKey: ['/customer-contacts', 'overview'], queryFn: () => api.get<{ data: any }>('/loyalty/overview').then((r) => r.data) });
  const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
  return (
    <div>
      <PageHeader title="Fidelização" description="Recorrência, clientes inativos, retornos e campanhas." />
      <Tabs value={tab} onValueChange={setTab} tabs={[{ value: 'visao', label: 'Visão geral' }, { value: 'contatos', label: 'Contatos e retornos' }, { value: 'campanhas', label: 'Campanhas' }]}>
        <TabPanel value="visao">
          {data && <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[['Clientes', data.total], ['Recorrentes (2+ em 90 dias)', data.recurring], ['Taxa de recorrência', pct(data.recurrenceRate)], ['Inativos (90+ dias)', data.inactive], ['Retornos após contato (90d)', `${data.returned90d}/${data.contacts90d}`]].map(([l, v]) => (
                <Card key={l as string} className="p-4"><p className="text-xs font-semibold text-ink-500">{l}</p><p className="mt-1 font-display text-2xl font-extrabold">{v}</p></Card>))}
            </div>
            <Card className="mt-4"><CardHeader title="Clientes para reconquistar" description="Compraram ou foram atendidos, mas não voltam há mais de 60 dias" />
              {data.inactiveList.length ? <ul className="divide-y divide-ink-100 border-t border-ink-100">{data.inactiveList.map((c: any) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span><Link to={`/app/clientes/${c.id}`} className="font-semibold hover:underline">{c.name}</Link><span className="block text-xs text-ink-500">{c.visits} visitas · última {relativeTime(c.last_at)}{c.last_contact_on ? ` · contatado ${formatDate(c.last_contact_on)}` : ''}</span></span>
                  <span className="flex gap-2">
                    {(c.whatsapp || c.phone) && <a href={`https://wa.me/55${(c.whatsapp ?? c.phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"><Button size="xs" icon={<MessageCircle className="size-3.5" />}>{formatPhone(c.whatsapp ?? c.phone)}</Button></a>}
                    {can('fidelizacao', 'write') && <Button size="xs" variant="brand" icon={<PhoneCall className="size-3.5" />} onClick={() => setContact({ customer_id: c.id })}>Registrar contato</Button>}
                  </span>
                </li>))}</ul> : <EmptyState compact title="Nenhum cliente inativo no momento" description="Os clientes aparecem aqui conforme o histórico de vendas e atendimentos." />}
            </Card>
          </>}
        </TabPanel>
        <TabPanel value="contatos">
          <ResourcePage<any> title="Contatos e retornos" module="fidelizacao" endpoint="/customer-contacts" entity="contato" newLabel="Registrar contato" defaultSort={{ key: 'contacted_on', dir: 'desc' }}
            filters={[{ key: 'outcome', label: 'Resultado', options: CONTACT_OUTCOME }]}
            columns={[
              { key: 'customer', header: 'Cliente', sortKey: 'customer', primary: true, render: (r) => <span className="font-semibold">{r.customer_name}</span> },
              { key: 'contacted_on', header: 'Data', sortKey: 'contacted_on', render: (r) => formatDate(r.contacted_on) },
              { key: 'channel', header: 'Canal', render: (r) => CONTACT_CHANNEL[r.channel as keyof typeof CONTACT_CHANNEL] },
              { key: 'campaign_name', header: 'Campanha', hideOnMobile: true },
              { key: 'outcome', header: 'Resultado', render: (r) => CONTACT_OUTCOME[r.outcome as keyof typeof CONTACT_OUTCOME] },
            ]}
            schema={customerContactSchema} defaults={() => ({ contacted_on: todayIn(tz), channel: 'whatsapp', outcome: 'sem_resposta' })} fields={CONTACT_FIELDS as any} />
        </TabPanel>
        <TabPanel value="campanhas">
          <ResourcePage<any> title="Campanhas" module="fidelizacao" endpoint="/campaigns" entity="campanha" newLabel="Nova campanha" defaultSort={{ key: 'start_date', dir: 'desc' }}
            filters={[{ key: 'status', label: 'Situação', options: CAMPAIGN_STATUS }]}
            columns={[
              { key: 'name', header: 'Campanha', sortKey: 'name', primary: true, render: (r) => <div><p className="font-semibold">{r.name}</p><p className="text-xs text-ink-500">{CAMPAIGN_AUDIENCE[r.audience as keyof typeof CAMPAIGN_AUDIENCE]}</p></div> },
              { key: 'start_date', header: 'Período', sortKey: 'start_date', render: (r) => `${formatDate(r.start_date)}${r.end_date ? ` a ${formatDate(r.end_date)}` : ''}` },
              { key: 'contacts', header: 'Contatos', align: 'right' }, { key: 'conversions', header: 'Retornos', align: 'right' },
              { key: 'status', header: 'Situação', render: (r) => <StatusBadge status={r.status} labels={CAMPAIGN_STATUS} /> },
            ]}
            schema={campaignSchema} defaults={() => ({ start_date: todayIn(tz), audience: 'inativos', status: 'planejada' })}
            fields={[{ name: 'name', label: 'Nome', required: true, span: 2 }, { name: 'audience', label: 'Público', type: 'select', options: CAMPAIGN_AUDIENCE, required: true }, { name: 'channel', label: 'Canal' },
              { name: 'offer', label: 'Oferta / mensagem', type: 'textarea' }, { name: 'goal', label: 'Objetivo', type: 'textarea' }, { name: 'start_date', label: 'Início', type: 'date', required: true },
              { name: 'end_date', label: 'Término', type: 'date' }, { name: 'status', label: 'Situação', type: 'select', options: CAMPAIGN_STATUS, required: true }]} />
        </TabPanel>
      </Tabs>
      <FormSheet open={!!contact} onOpenChange={(o) => !o && setContact(null)} title="Registrar contato" schema={customerContactSchema} tz={tz}
        initial={{ contacted_on: todayIn(tz), channel: 'whatsapp', outcome: 'sem_resposta', ...contact }} fields={CONTACT_FIELDS as any}
        onSubmit={async (v) => { await api.post('/customer-contacts', v); toast.success('Contato registrado.'); setContact(null); qc.invalidateQueries({ queryKey: ['/customer-contacts'] }); }} />
    </div>
  );
}
