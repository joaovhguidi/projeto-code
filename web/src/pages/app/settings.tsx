import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Download, Plus, X } from 'lucide-react';
import {
  DIFFICULTIES, EMPLOYEE_RANGES, GOALS, MODULES, MODULE_KEYS, PERMISSIONS, ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, UF, canDo, changePasswordSchema, companySchema, memberCreateSchema,
  type ModuleKey, type SegmentInfo,
} from '@nexo/shared';
import { api, qs, type Page } from '@/lib/api';
import { useMe, useRefreshMe } from '@/lib/auth';
import { cn, relativeTime } from '@/lib/utils';
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Pagination, Select, Switch, Tabs, TabPanel, Textarea, useConfirm } from '@/components/ui';
import { FormSheet, applyServerErrors, maskDocument, maskPhone, useEntityForm } from '@/components/form/form';
import { Controller } from 'react-hook-form';

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function CompanyTab({ canEdit }: { canEdit: boolean }) {
  const me = useMe();
  const refresh = useRefreshMe();
  const { data: segs } = useQuery({ queryKey: ['segments'], queryFn: () => api.get<{ data: SegmentInfo[] }>('/segments').then((r) => r.data) });
  const c = me.company;
  const form = useEntityForm<any>(companySchema, { ...c, document: c.document ? maskDocument(c.document) : '', phone: c.phone ? maskPhone(c.phone) : '', email: c.email ?? '', city: c.city ?? '', state: c.state ?? '', custom_segment: c.custom_segment ?? '', description: c.description ?? '', employees_range: c.employees_range ?? '', main_offerings: c.main_offerings ?? '' });
  const v = form.watch();
  const err = (k: string) => (form.formState.errors as any)[k]?.message;
  const toggle = (f: 'goals' | 'difficulties', k: string) => { const cur: string[] = form.getValues(f) ?? []; form.setValue(f, cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]); };
  const submit = form.handleSubmit(async (vals) => { try { await api.put('/company', vals); toast.success('Dados da empresa salvos. O painel foi reorganizado.'); refresh(); } catch (e) { applyServerErrors(form, e); } });
  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={!canEdit} className="space-y-4">
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Nome da empresa" required error={err('name')} className="sm:col-span-2"><Input {...form.register('name')} /></Field>
          <Field label="CNPJ/CPF" error={err('document')}><Controller name="document" control={form.control} render={({ field }) => <Input value={field.value ?? ''} onChange={(e) => field.onChange(maskDocument(e.target.value))} />} /></Field>
          <Field label="Telefone" error={err('phone')}><Controller name="phone" control={form.control} render={({ field }) => <Input value={field.value ?? ''} onChange={(e) => field.onChange(maskPhone(e.target.value))} />} /></Field>
          <Field label="E-mail" error={err('email')}><Input {...form.register('email')} /></Field>
          <div className="grid grid-cols-[1fr_90px] gap-2"><Field label="Cidade"><Input {...form.register('city')} /></Field><Field label="UF"><Select {...form.register('state')}><option value="">—</option>{UF.map((u) => <option key={u}>{u}</option>)}</Select></Field></div>
          <Field label="Fuso horário" hint="Usado para datas, agenda e relatórios"><Select {...form.register('timezone')}>{['America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Bahia', 'America/Porto_Velho', 'America/Rio_Branco', 'America/Noronha'].map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Funcionários"><Select {...form.register('employees_range')}><option value="">—</option>{Object.entries(EMPLOYEE_RANGES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Segmento" hint="Mudar o segmento reorganiza menu, indicadores e dicas" className="sm:col-span-2"><Select {...form.register('segment_key')}>{segs?.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</Select></Field>
          {v.segment_key === 'outro' && <Field label="Atividade" error={err('custom_segment')} className="sm:col-span-2"><Input {...form.register('custom_segment')} /></Field>}
          <Field label="Descrição do negócio" className="sm:col-span-2"><Textarea {...form.register('description')} rows={2} /></Field>
          <Field label="Principais produtos ou serviços" className="sm:col-span-2"><Textarea {...form.register('main_offerings')} rows={2} /></Field>
        </Card>
        <Card className="space-y-4 p-5">
          <div><p className="text-sm font-semibold">Objetivos</p><div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(GOALS).map(([k, l]) => <button key={k} type="button" aria-pressed={v.goals?.includes(k)} onClick={() => toggle('goals', k)} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium', v.goals?.includes(k) ? 'border-brand-700 bg-brand-800 text-white' : 'border-ink-200')}>{l}</button>)}</div></div>
          <div><p className="text-sm font-semibold">Dificuldades</p><div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(DIFFICULTIES).map(([k, l]) => <button key={k} type="button" aria-pressed={v.difficulties?.includes(k)} onClick={() => toggle('difficulties', k)} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium', v.difficulties?.includes(k) ? 'border-brand-700 bg-brand-800 text-white' : 'border-ink-200')}>{l}</button>)}</div></div>
        </Card>
      </fieldset>
      {canEdit && <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>Salvar dados da empresa</Button>}
    </form>
  );
}

function PriorityTab({ canEdit }: { canEdit: boolean }) {
  const me = useMe();
  const refresh = useRefreshMe();
  const [list, setList] = useState<ModuleKey[]>(me.company.preferences?.priorityModules ?? me.workspace.priorityModules);
  const available = MODULE_KEYS.filter((k) => !MODULES[k].fixed && !list.includes(k));
  const move = (i: number, d: number) => setList((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const save = async (p: ModuleKey[] | null) => { try { await api.put('/company/preferences', { priorityModules: p ?? [] }); toast.success(p ? 'Prioridades atualizadas.' : 'Prioridades do segmento restauradas.'); await refresh(); } catch (e: any) { toast.error(e.message); } };
  return (
    <Card className="p-5">
      <p className="text-sm text-ink-600">Defina a ordem dos módulos em destaque no menu. Indicadores e ações rápidas do painel acompanham essas prioridades. Os demais módulos continuam acessíveis em “Outros módulos”.</p>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div><p className="mb-2 text-sm font-semibold">Prioritários ({list.length}/10)</p>
          <ul className="space-y-1.5">{list.map((k, i) => <li key={k} className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm"><span className="w-5 font-bold text-brand-600">{i + 1}</span><span className="flex-1">{MODULES[k].label}</span>
            {canEdit && <><Button size="icon" variant="ghost" className="size-7" onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp className="size-3.5" /></Button><Button size="icon" variant="ghost" className="size-7" onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown className="size-3.5" /></Button><Button size="icon" variant="ghost" className="size-7" onClick={() => setList(list.filter((x) => x !== k))} aria-label="Remover"><X className="size-3.5" /></Button></>}</li>)}</ul></div>
        {canEdit && <div><p className="mb-2 text-sm font-semibold">Adicionar</p><div className="flex flex-wrap gap-1.5">{available.map((k) => <button key={k} type="button" disabled={list.length >= 10} onClick={() => setList([...list, k])} className="rounded-full border border-ink-200 px-3 py-1.5 text-xs hover:border-brand-400">+ {MODULES[k].label}</button>)}</div></div>}
      </div>
      {canEdit && <div className="mt-5 flex gap-2"><Button variant="primary" disabled={list.length < 2} onClick={() => save(list)}>Salvar prioridades</Button>{me.company.segment_key !== 'outro' && <Button onClick={() => save(null)}>Usar padrão do segmento</Button>}</div>}
    </Card>
  );
}

function HoursTab({ canEdit }: { canEdit: boolean }) {
  const me = useMe();
  const refresh = useRefreshMe();
  const init = me.company.opening_hours ?? {};
  const [h, setH] = useState<Record<string, { open: string; close: string } | null>>(() => Object.fromEntries(DAYS.map((_, i) => [String(i), Object.keys(init).length ? init[String(i)] ?? null : i === 0 ? null : { open: '08:00', close: '18:00' }])));
  return (
    <Card className="p-5">
      <p className="mb-4 text-sm text-ink-600">Usado pela agenda para calcular horários livres.{!Object.keys(init).length && ' Ainda não configurado — a agenda usa 8h às 18h.'}</p>
      <div className="space-y-2">{DAYS.map((d, i) => { const v = h[String(i)]; return (
        <div key={d} className="flex flex-wrap items-center gap-3"><span className="w-24 text-sm font-medium">{d}</span><Switch checked={!!v} disabled={!canEdit} label={`Aberto ${d}`} onCheckedChange={(on) => setH({ ...h, [i]: on ? { open: '08:00', close: '18:00' } : null })} />
          {v ? <><Input type="time" className="w-32" value={v.open} disabled={!canEdit} onChange={(e) => setH({ ...h, [i]: { ...v, open: e.target.value } })} /><span>às</span><Input type="time" className="w-32" value={v.close} disabled={!canEdit} onChange={(e) => setH({ ...h, [i]: { ...v, close: e.target.value } })} /></> : <span className="text-sm text-ink-400">Fechado</span>}</div>); })}</div>
      {canEdit && <Button className="mt-5" variant="primary" onClick={async () => { try { await api.put('/company/hours', { opening_hours: h }); toast.success('Horário salvo.'); refresh(); } catch (e: any) { toast.error(e.message); } }}>Salvar horário</Button>}
    </Card>
  );
}

function UsersTab() {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const manage = canDo(me.role, 'manageUsers');
  const { data } = useQuery({ queryKey: ['members'], queryFn: () => api.get<{ data: any[] }>('/company/members').then((r) => r.data) });
  const upd = async (m: any, patch: any) => { try { await api.put(`/company/members/${m.user_id}`, { role: m.role, active: m.active, employee_id: m.employee_id, ...patch }); toast.success('Acesso atualizado.'); qc.invalidateQueries({ queryKey: ['members'] }); } catch (e: any) { toast.error(e.message); } };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Usuários" description="Cada usuário acessa somente os dados desta empresa, conforme a função." action={manage && <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Adicionar usuário</Button>} />
        <ul className="divide-y divide-ink-100 border-t border-ink-100">{data?.map((m) => (
          <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1"><p className="font-medium">{m.name} {m.user_id === me.user.id && <Badge>Você</Badge>} {!m.active && <Badge tone="danger">Desativado</Badge>}</p><p className="text-xs text-ink-500">{m.email}{m.employee_name ? ` · colaborador: ${m.employee_name}` : ''}</p></div>
            {manage && m.user_id !== me.user.id ? <>
              <Select className="w-40" value={m.role} onChange={(e) => upd(m, { role: e.target.value })} aria-label="Função">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select>
              <Button size="sm" onClick={() => upd(m, { active: !m.active })}>{m.active ? 'Desativar' : 'Reativar'}</Button>
              <Button size="sm" variant="ghost" className="text-red-600" onClick={async () => { if (await confirm({ title: `Remover ${m.name}?`, description: 'O usuário perde o acesso a esta empresa.', confirmLabel: 'Remover' })) { try { await api.del(`/company/members/${m.user_id}`); qc.invalidateQueries({ queryKey: ['members'] }); } catch (e: any) { toast.error(e.message); } } }}>Remover</Button>
            </> : <Badge tone="brand">{ROLE_LABELS[m.role as keyof typeof ROLE_LABELS]}</Badge>}
          </li>))}</ul>
      </Card>
      <Card className="overflow-x-auto">
        <CardHeader title="Permissões por função" description="Verificadas no servidor em todas as operações." />
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-y border-ink-100 bg-ink-50 text-xs uppercase text-ink-500"><th className="p-2 text-left">Módulo</th>{ROLES.map((r) => <th key={r} className="p-2">{ROLE_LABELS[r]}</th>)}</tr></thead>
          <tbody className="divide-y divide-ink-100">{MODULE_KEYS.map((k) => <tr key={k}><td className="p-2">{MODULES[k].label}</td>{ROLES.map((r) => { const a = PERMISSIONS[r][k]; return <td key={r} className="p-2 text-center text-xs">{a === 'write' ? <Badge tone="success">Editar</Badge> : a === 'read' ? <Badge tone="info">Ver</Badge> : <span className="text-ink-300">—</span>}</td>; })}</tr>)}</tbody>
        </table>
        <div className="grid gap-2 p-4 text-xs text-ink-500 md:grid-cols-2">{ROLES.map((r) => <p key={r}><b className="text-ink-700">{ROLE_LABELS[r]}:</b> {ROLE_DESCRIPTIONS[r]}</p>)}</div>
      </Card>
      <FormSheet open={adding} onOpenChange={setAdding} title="Adicionar usuário" description="Informe uma senha inicial e repasse ao colaborador. Ele poderá alterá-la no perfil." schema={memberCreateSchema} tz={me.company.timezone} initial={{ role: 'colaborador' }}
        fields={[{ name: 'name', label: 'Nome', required: true, span: 2 }, { name: 'email', label: 'E-mail', type: 'email', required: true }, { name: 'password', label: 'Senha inicial', required: true, hint: 'Mín. 8 caracteres, letras e números' },
          { name: 'role', label: 'Função', type: 'select', options: ROLE_LABELS, required: true }, { name: 'employee_id', label: 'Vincular ao colaborador', type: 'entity', endpoint: '/staff/options' }]}
        onSubmit={async (v) => { await api.post('/company/members', v); toast.success('Usuário adicionado.'); setAdding(false); qc.invalidateQueries({ queryKey: ['members'] }); }} />
    </div>
  );
}

function ProfileTab() {
  const me = useMe();
  const refresh = useRefreshMe();
  const [name, setName] = useState(me.user.name);
  const [phone, setPhone] = useState(me.user.phone ? maskPhone(me.user.phone) : '');
  const pw = useEntityForm<any>(changePasswordSchema, { currentPassword: '', newPassword: '' });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-4 p-5"><h3 className="font-bold">Meus dados</h3>
        <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Telefone"><Input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} /></Field>
        <Field label="E-mail" hint="Usado para login"><Input value={me.user.email} disabled /></Field>
        <Button variant="primary" onClick={async () => { try { await api.put('/auth/profile', { name, phone }); toast.success('Perfil salvo.'); refresh(); } catch (e: any) { toast.error(e.message); } }}>Salvar</Button>
      </Card>
      <Card className="p-5"><h3 className="mb-4 font-bold">Alterar senha</h3>
        <form className="space-y-4" onSubmit={pw.handleSubmit(async (v) => { try { await api.post('/auth/password', v); toast.success('Senha alterada. Outras sessões foram encerradas.'); pw.reset(); } catch (e) { applyServerErrors(pw, e); } })}>
          <Field label="Senha atual" error={(pw.formState.errors as any).currentPassword?.message}><Input type="password" autoComplete="current-password" {...pw.register('currentPassword')} /></Field>
          <Field label="Nova senha" error={(pw.formState.errors as any).newPassword?.message} hint="Mín. 8 caracteres, letras e números"><Input type="password" autoComplete="new-password" {...pw.register('newPassword')} /></Field>
          <Button type="submit" variant="primary" loading={pw.formState.isSubmitting}>Alterar senha</Button>
        </form>
      </Card>
    </div>
  );
}

function DataTab() {
  const me = useMe();
  const [page, setPage] = useState(1);
  const { data } = useQuery({ queryKey: ['activity', page], queryFn: () => api.get<Page<any>>(`/company/activity${qs({ page })}`) });
  return (
    <div className="space-y-4">
      {canDo(me.role, 'exportData') && <Card className="flex flex-wrap items-center justify-between gap-3 p-5"><div><h3 className="font-bold">Exportar meus dados</h3><p className="text-sm text-ink-500">Baixe todos os registros da empresa em formato JSON.</p></div>
        <a href="/api/company/export"><Button icon={<Download className="size-4" />}>Exportar dados</Button></a></Card>}
      <Card><CardHeader title="Histórico de ações" description={canDo(me.role, 'viewActivityLog') ? 'Ações de todos os usuários' : 'Suas ações'} />
        <ul className="divide-y divide-ink-100 border-t border-ink-100">{data?.data.map((a) => <li key={a.id} className="px-5 py-2.5 text-sm"><p>{a.summary}</p><p className="text-xs text-ink-400">{a.user_name ?? 'Sistema'} · {relativeTime(a.created_at)}</p></li>)}</ul>
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  );
}

export default function Settings() {
  const me = useMe();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('aba') ?? 'empresa';
  const canEdit = canDo(me.role, 'editCompany');
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);
  return (
    <div>
      <PageHeader title="Configurações" description="Empresa, personalização, horário, usuários, permissões e dados." />
      <Tabs value={tab} onValueChange={(v) => setSp({ aba: v }, { replace: true })} tabs={[{ value: 'empresa', label: 'Empresa' }, { value: 'prioridades', label: 'Personalização' }, { value: 'horario', label: 'Horário de funcionamento' }, { value: 'usuarios', label: 'Usuários e permissões' }, { value: 'perfil', label: 'Meu perfil' }, { value: 'dados', label: 'Dados e histórico' }]}>
        <TabPanel value="empresa"><CompanyTab canEdit={canEdit} /></TabPanel>
        <TabPanel value="prioridades"><PriorityTab canEdit={canEdit} /></TabPanel>
        <TabPanel value="horario"><HoursTab canEdit={canEdit} /></TabPanel>
        <TabPanel value="usuarios"><UsersTab /></TabPanel>
        <TabPanel value="perfil"><ProfileTab /></TabPanel>
        <TabPanel value="dados"><DataTab /></TabPanel>
      </Tabs>
    </div>
  );
}
