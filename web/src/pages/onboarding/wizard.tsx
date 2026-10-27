import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, LogOut, Sparkles } from 'lucide-react';
import {
  DIFFICULTIES, EMPLOYEE_RANGES, GOALS, KPI_CATALOG, MODULES, MODULE_KEYS, QUICK_ACTIONS, UF, onboardingSchema, resolveWorkspace, type ModuleKey, type SegmentInfo,
} from '@nexo/shared';
import { api, ApiError } from '@/lib/api';
import { useMeQuery } from '@/lib/auth';
import { Icon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/layout/logo';
import { Button, Field, Input, Select, Skeleton, Textarea } from '@/components/ui';
import { maskDocument, maskPhone } from '@/components/form/form';

const STEPS = ['Empresa', 'Segmento', 'Seu negócio', 'Objetivos', 'Revisão'];
const STEP_FIELDS: string[][] = [['name', 'document', 'phone', 'email', 'city', 'state'], ['segment_key', 'custom_segment', 'priority_modules'], ['description', 'employees_range', 'main_offerings'], ['goals', 'difficulties'], []];
const SELECTABLE = MODULE_KEYS.filter((k) => !MODULES[k].fixed);

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-all',
        active ? 'border-brand-700 bg-brand-800 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300')}>
      {active && <Check className="size-3.5 text-accent-400" />}{children}
    </button>
  );
}

export default function Onboarding() {
  const { data: me } = useMeQuery();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [useSuggested, setUseSuggested] = useState(true);
  const { data: segData, isLoading } = useQuery({ queryKey: ['segments'], queryFn: () => api.get<{ data: SegmentInfo[] }>('/segments') });
  const segments = segData?.data ?? [];
  const form = useForm<any>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { name: '', document: '', phone: '', email: me?.user.email ?? '', city: '', state: '', segment_key: '', custom_segment: '', description: '', employees_range: '', main_offerings: '', goals: [], difficulties: [], priority_modules: [], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo' },
    mode: 'onTouched',
  });
  const v = form.watch();
  const { errors } = form.formState;
  const err = (k: string) => (errors as any)[k]?.message as string | undefined;
  const segment = segments.find((s) => s.key === v.segment_key);

  const preview = useMemo(() => segment && resolveWorkspace({
    segment: segment.config, goals: v.goals, difficulties: v.difficulties,
    preferences: v.segment_key === 'outro' ? { priorityModules: v.priority_modules } : {}, role: 'proprietario',
  }), [segment, v.goals, v.difficulties, v.priority_modules, v.segment_key]);

  const next = async () => {
    const ok = await form.trigger(STEP_FIELDS[step] as any);
    if (step === 1 && !v.segment_key) { form.setError('segment_key', { message: 'Selecione o segmento do seu negócio' }); return; }
    if (step === 1 && v.segment_key === 'outro') {
      let bad = false;
      if (!v.custom_segment?.trim()) { form.setError('custom_segment', { message: 'Descreva a sua atividade' }); bad = true; }
      if ((v.priority_modules ?? []).length < 2) { form.setError('priority_modules', { message: 'Escolha ao menos 2 módulos prioritários' }); bad = true; }
      if (bad) return;
    }
    if (ok) setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const submit = form.handleSubmit(async (values) => {
    try {
      await api.post('/companies', { ...values, use_suggested_services: useSuggested && !!segment?.config.suggestedServices?.length });
      await qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('Empresa configurada! Seu painel está pronto.');
      navigate('/app', { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.fields) {
        for (const [k, m] of Object.entries(e.fields)) form.setError(k as any, { message: m });
        const firstStep = STEP_FIELDS.findIndex((fs) => fs.some((f) => e.fields![f]));
        if (firstStep >= 0) setStep(firstStep);
      }
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  }, (errs) => {
    const firstStep = STEP_FIELDS.findIndex((fs) => fs.some((f) => (errs as any)[f]));
    if (firstStep >= 0) setStep(firstStep);
    toast.error('Revise os dados informados.');
  });
  const toggle = (field: 'goals' | 'difficulties' | 'priority_modules', key: string) => {
    const cur: string[] = form.getValues(field) ?? [];
    form.setValue(field, cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key], { shouldValidate: field === 'priority_modules' });
  };
  const logout = async () => { await api.post('/auth/logout'); qc.clear(); navigate('/entrar'); };

  return (
    <div className="min-h-dvh bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-2">
            {sp.get('nova') && <Button variant="ghost" onClick={() => navigate('/app')}>Voltar ao painel</Button>}
            <Button variant="ghost" icon={<LogOut className="size-4" />} onClick={logout}>Sair</Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <div className="mb-8">
          <p className="text-sm font-semibold text-brand-700">Olá, {me?.user.name.split(' ')[0]}! Vamos configurar sua empresa.</p>
          <h1 className="mt-1 text-3xl font-extrabold text-ink-950">{STEPS[step]}</h1>
          <ol className="mt-6 grid grid-cols-5 gap-2" aria-label="Etapas">
            {STEPS.map((s, i) => (
              <li key={s} className="min-w-0">
                <div className={cn('h-1.5 rounded-full transition-colors', i <= step ? 'bg-brand-600' : 'bg-ink-200')} />
                <p className={cn('mt-2 hidden truncate text-xs font-medium sm:block', i === step ? 'text-brand-800' : 'text-ink-400')} aria-current={i === step ? 'step' : undefined}>{i + 1}. {s}</p>
              </li>
            ))}
          </ol>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); step === STEPS.length - 1 ? submit() : next(); }} noValidate className="card p-6 sm:p-8 animate-fade-in" key={step}>
          {step === 0 && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nome da empresa" required htmlFor="name" error={err('name')} className="sm:col-span-2"><Input id="name" autoFocus invalid={!!err('name')} {...form.register('name')} placeholder="Ex.: Barbearia Central" /></Field>
              <Field label="Responsável" hint="Vem da sua conta"><Input value={me?.user.name ?? ''} disabled /></Field>
              <Field label="CNPJ ou CPF" htmlFor="document" error={err('document')} hint="Opcional para MEI e autônomos">
                <Controller name="document" control={form.control} render={({ field }) => <Input id="document" inputMode="numeric" value={field.value} onChange={(e) => field.onChange(maskDocument(e.target.value))} onBlur={field.onBlur} invalid={!!err('document')} />} />
              </Field>
              <Field label="Telefone da empresa" htmlFor="phone" error={err('phone')}>
                <Controller name="phone" control={form.control} render={({ field }) => <Input id="phone" inputMode="tel" placeholder="(00) 00000-0000" value={field.value} onChange={(e) => field.onChange(maskPhone(e.target.value))} onBlur={field.onBlur} invalid={!!err('phone')} />} />
              </Field>
              <Field label="E-mail da empresa" htmlFor="email" error={err('email')}><Input id="email" type="email" invalid={!!err('email')} {...form.register('email')} /></Field>
              <Field label="Cidade" htmlFor="city" error={err('city')}><Input id="city" {...form.register('city')} /></Field>
              <Field label="Estado" htmlFor="state" error={err('state')}>
                <Select id="state" {...form.register('state')}><option value="">Selecione…</option>{UF.map((u) => <option key={u} value={u}>{u}</option>)}</Select>
              </Field>
            </div>
          )}

          {step === 1 && (
            <div>
              <p className="mb-4 text-sm text-ink-600">Escolha o que mais se parece com a sua atividade. O painel, os indicadores e as dicas serão organizados a partir disso — e você pode mudar depois.</p>
              {isLoading ? <div className="grid gap-3 sm:grid-cols-3">{Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div> : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Segmento">
                  {segments.map((s) => (
                    <button key={s.key} type="button" role="radio" aria-checked={v.segment_key === s.key}
                      onClick={() => { form.setValue('segment_key', s.key); form.clearErrors('segment_key'); }}
                      className={cn('flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all',
                        v.segment_key === s.key ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-500/20' : 'border-ink-200 bg-white hover:border-ink-300')}>
                      <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', v.segment_key === s.key ? 'bg-brand-800 text-accent-400' : 'bg-ink-100 text-brand-700')}><Icon name={s.icon} className="size-[18px]" /></span>
                      <span className="min-w-0"><span className="block text-sm font-semibold text-ink-900">{s.name}</span><span className="mt-0.5 block text-xs leading-snug text-ink-500">{s.description}</span></span>
                    </button>
                  ))}
                </div>
              )}
              {err('segment_key') && <p className="mt-3 text-sm font-medium text-red-600" role="alert">{err('segment_key')}</p>}
              {v.segment_key === 'outro' && (
                <div className="mt-6 space-y-5 rounded-xl border border-ink-200 bg-ink-50 p-5 animate-slide-up">
                  <Field label="Descreva sua atividade" required htmlFor="custom_segment" error={err('custom_segment')}><Input id="custom_segment" {...form.register('custom_segment')} placeholder="Ex.: Fotografia de eventos" /></Field>
                  <Field label="Módulos prioritários (na ordem de importância)" required error={err('priority_modules')} hint="Os escolhidos aparecem primeiro no menu e no painel. Os demais continuam acessíveis.">
                    <div className="flex flex-wrap gap-2">
                      {SELECTABLE.map((k) => {
                        const idx = (v.priority_modules as string[]).indexOf(k);
                        return (
                          <Chip key={k} active={idx >= 0} onClick={() => toggle('priority_modules', k)}>
                            {idx >= 0 && <span className="text-xs text-accent-300">{idx + 1}º</span>}<Icon name={MODULES[k].icon} className="size-3.5" />{MODULES[k].label}
                          </Chip>
                        );
                      })}
                    </div>
                  </Field>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Descrição do negócio" htmlFor="description" className="sm:col-span-2" error={err('description')}><Textarea id="description" autoFocus {...form.register('description')} placeholder="O que sua empresa faz, para quem e como." /></Field>
              <Field label="Quantidade aproximada de funcionários" htmlFor="employees_range">
                <Select id="employees_range" {...form.register('employees_range')}><option value="">Selecione…</option>{Object.entries(EMPLOYEE_RANGES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              </Field>
              <Field label="Principais produtos ou serviços" htmlFor="main_offerings" className="sm:col-span-2" error={err('main_offerings')}><Textarea id="main_offerings" {...form.register('main_offerings')} placeholder="Ex.: corte, barba, venda de pomadas" /></Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8">
              <div>
                <h2 className="font-bold text-ink-900">Quais são seus objetivos atuais?</h2>
                <p className="mt-1 text-sm text-ink-500">Selecione quantos quiser. Eles ajustam o destaque dos módulos.</p>
                <div className="mt-4 flex flex-wrap gap-2">{Object.entries(GOALS).map(([k, l]) => <Chip key={k} active={v.goals.includes(k)} onClick={() => toggle('goals', k)}>{l}</Chip>)}</div>
              </div>
              <div>
                <h2 className="font-bold text-ink-900">Quais são suas principais dificuldades de administração?</h2>
                <p className="mt-1 text-sm text-ink-500">Usamos isso para priorizar alertas, indicadores e dicas.</p>
                <div className="mt-4 flex flex-wrap gap-2">{Object.entries(DIFFICULTIES).map(([k, l]) => <Chip key={k} active={v.difficulties.includes(k)} onClick={() => toggle('difficulties', k)}>{l}</Chip>)}</div>
              </div>
            </div>
          )}

          {step === 4 && preview && segment && (
            <div>
              <div className="flex items-start gap-3 rounded-xl bg-brand-950 p-5 text-white">
                <Sparkles className="mt-0.5 size-5 shrink-0 text-accent-400" />
                <div><p className="font-bold">Seu painel foi montado para: {v.segment_key === 'outro' ? v.custom_segment : segment.name}</p>
                  <p className="mt-1 text-sm text-brand-100/75">Com base no segmento{v.goals.length ? ', nos seus objetivos' : ''}{v.difficulties.length ? ' e nas dificuldades informadas' : ''}. Você poderá ajustar tudo em Configurações.</p></div>
              </div>
              <div className="mt-6 grid gap-5 md:grid-cols-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Menu em destaque</p>
                  <ol className="mt-3 space-y-1.5">{preview.priorityModules.map((m, i) => <li key={m} className="flex items-center gap-2 text-sm"><span className="w-5 text-right text-xs font-bold text-brand-600">{i + 1}</span><Icon name={MODULES[m].icon} className="size-4 text-ink-500" />{MODULES[m].label}</li>)}</ol>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Indicadores do painel</p>
                  <ul className="mt-3 space-y-1.5">{preview.kpis.map((k) => <li key={k} className="flex items-center gap-2 text-sm"><Check className="size-4 text-brand-600" />{KPI_CATALOG[k].label}</li>)}</ul>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Ações rápidas</p>
                  <ul className="mt-3 space-y-1.5">{preview.quickActions.map((q) => <li key={q} className="flex items-center gap-2 text-sm"><Icon name={QUICK_ACTIONS[q].icon} className="size-4 text-brand-600" />{QUICK_ACTIONS[q].label}</li>)}</ul>
                </div>
              </div>
              {!!segment.config.suggestedServices?.length && (
                <label className="mt-6 flex items-start gap-3 rounded-xl border border-ink-200 p-4">
                  <input type="checkbox" checked={useSuggested} onChange={(e) => setUseSuggested(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
                  <span className="text-sm"><span className="font-semibold text-ink-900">Cadastrar serviços sugeridos para começar</span>
                    <span className="block text-ink-500">{segment.config.suggestedServices.map((s) => s.name).join(', ')} — preços e durações editáveis depois.</span></span>
                </label>
              )}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between border-t border-ink-100 pt-6">
            <Button variant="ghost" icon={<ArrowLeft className="size-4" />} disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Voltar</Button>
            {step < STEPS.length - 1
              ? <Button type="submit" variant="primary">Continuar <ArrowRight className="size-4" /></Button>
              : <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>Concluir e abrir meu painel</Button>}
          </div>
        </form>
      </div>
    </div>
  );
}
export type { ModuleKey };
