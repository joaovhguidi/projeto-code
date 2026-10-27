import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BarChart3, Check, Eye, KeyRound, Layers, Lightbulb, LockKeyhole, ShieldCheck, Sparkles, Target, Users2, Zap } from 'lucide-react';
import { KPI_CATALOG, MODULES, QUICK_ACTIONS, type SegmentInfo } from '@nexo/shared';
import { api } from '@/lib/api';
import { Icon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { PublicFooter, PublicHeader } from './public-layout';

function HeroPreview() {
  // Ilustração estática da interface (não representa dados reais)
  const bars = [38, 52, 44, 61, 58, 72, 66, 80, 74, 88, 82, 94];
  return (
    <div className="relative" aria-hidden>
      <div className="absolute -inset-6 rounded-[2rem] bg-accent-400/10 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex">
          <div className="hidden w-40 shrink-0 bg-brand-950 p-3 sm:block">
            <div className="mb-4 flex items-center gap-2"><span className="size-5 rounded-md bg-accent-400" /><span className="h-2 w-14 rounded bg-white/30" /></div>
            {['CalendarDays', 'Users', 'Wallet', 'Scissors', 'HeartHandshake'].map((i, idx) => (
              <div key={i} className={cn('mb-1 flex items-center gap-2 rounded-md px-2 py-1.5', idx === 0 && 'bg-white/10')}>
                <Icon name={i} className={cn('size-3.5', idx === 0 ? 'text-accent-400' : 'text-brand-300/70')} /><span className="h-1.5 w-14 rounded bg-white/25" />
              </div>
            ))}
          </div>
          <div className="flex-1 bg-ink-50 p-4">
            <div className="mb-3 h-2.5 w-40 rounded bg-ink-300" />
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {[['Atendimentos hoje', '14'], ['Horários livres', '6'], ['Faturamento do mês', 'R$ 18,4 mil'], ['Cancelamentos', '3']].map(([l, v], i) => (
                <div key={l} className="rounded-lg border border-ink-200 bg-white p-2.5">
                  <p className="text-[9px] font-medium text-ink-500">{l}</p>
                  <p className={cn('mt-1 font-display text-sm font-extrabold', i === 2 ? 'text-brand-700' : 'text-ink-900')}>{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-2.5 grid gap-2.5 lg:grid-cols-3">
              <div className="rounded-lg border border-ink-200 bg-white p-3 lg:col-span-2">
                <p className="mb-2 text-[9px] font-semibold text-ink-600">Receitas x despesas</p>
                <div className="flex h-24 items-end gap-1.5">
                  {bars.map((b, i) => <div key={i} className="flex-1 rounded-t bg-brand-600" style={{ height: `${b}%`, opacity: 0.55 + i * 0.035 }} />)}
                </div>
              </div>
              <div className="rounded-lg border border-accent-400/60 bg-accent-100 p-3">
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-brand-900"><Lightbulb className="size-3" /> Dica para seu negócio</div>
                <p className="mt-1.5 text-[10px] font-semibold leading-snug text-ink-900">3 atendimentos de amanhã ainda sem confirmação.</p>
                <p className="mt-1 text-[9px] text-ink-600">Confirme para reduzir faltas.</p>
                <span className="mt-2 inline-block rounded bg-brand-800 px-2 py-1 text-[9px] font-semibold text-white">Resolver agora</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-brand-200/60">Ilustração da interface</p>
    </div>
  );
}

function SegmentShowcase() {
  const { data } = useQuery({ queryKey: ['segments'], queryFn: () => api.get<{ data: SegmentInfo[] }>('/segments') });
  const segments = (data?.data ?? []).filter((s) => s.key !== 'outro');
  const [sel, setSel] = useState('barbearia');
  const seg = segments.find((s) => s.key === sel) ?? segments[0];
  return (
    <section id="segmentos" className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-wider text-brand-600">Personalização por segmento</p>
          <h2 className="mt-2 text-3xl font-extrabold text-ink-950 sm:text-4xl">Um painel diferente para cada tipo de negócio</h2>
          <p className="mt-4 text-lg text-ink-600">Ao cadastrar sua empresa, o Nexo reorganiza menus, indicadores, ações rápidas e alertas de acordo com a sua atividade. Todos os módulos continuam disponíveis — só muda o que fica em destaque.</p>
        </div>
        <div className="mt-10 flex flex-wrap gap-2" role="tablist" aria-label="Segmentos">
          {segments.slice(0, 12).map((s) => (
            <button key={s.key} role="tab" aria-selected={s.key === seg?.key} onClick={() => setSel(s.key)}
              className={cn('inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all',
                s.key === seg?.key ? 'border-brand-800 bg-brand-900 text-white shadow-md' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300')}>
              <Icon name={s.icon} className={cn('size-4', s.key === seg?.key ? 'text-accent-400' : 'text-brand-600')} />{s.name}
            </button>
          ))}
        </div>
        {seg && (
          <div key={seg.key} className="mt-8 grid gap-5 lg:grid-cols-3 animate-slide-up" role="tabpanel">
            <div className="rounded-2xl border border-ink-200 bg-ink-50/60 p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Menu prioritário</p>
              <ol className="mt-4 space-y-2">
                {seg.config.modules.slice(0, 6).map((m, i) => (
                  <li key={m} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2.5 shadow-card ring-1 ring-ink-200/70">
                    <span className="grid size-6 place-items-center rounded-md bg-brand-900 text-[11px] font-bold text-accent-400">{i + 1}</span>
                    <Icon name={MODULES[m].icon} className="size-4 text-brand-600" /><span className="text-sm font-medium">{MODULES[m].label}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-2xl border border-ink-200 bg-ink-50/60 p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Indicadores no painel</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {seg.config.kpis.slice(0, 6).map((k) => (
                  <div key={k} className="rounded-lg bg-white p-3 shadow-card ring-1 ring-ink-200/70">
                    <BarChart3 className="size-4 text-brand-600" />
                    <p className="mt-2 text-xs font-medium leading-snug text-ink-700">{KPI_CATALOG[k]?.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-ink-200 bg-ink-50/60 p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Ações rápidas e dicas</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {seg.config.quickActions.map((q) => (
                  <span key={q} className="inline-flex items-center gap-1.5 rounded-lg bg-accent-400 px-3 py-2 text-xs font-semibold text-ink-950">
                    <Icon name={QUICK_ACTIONS[q].icon} className="size-3.5" />{QUICK_ACTIONS[q].label}
                  </span>
                ))}
              </div>
              <ul className="mt-5 space-y-2.5">
                {seg.config.starterTips.slice(0, 2).map((t) => (
                  <li key={t.title} className="flex gap-2.5 text-sm text-ink-700"><Lightbulb className="mt-0.5 size-4 shrink-0 text-brand-600" />{t.title}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <p className="mt-6 text-sm text-ink-500">E também: {segments.slice(12).map((s) => s.name).join(', ')} e "outro tipo de negócio", em que você escolhe os módulos prioritários.</p>
      </div>
    </section>
  );
}

const PILLARS = [
  { icon: Layers, title: 'Tudo conectado', text: 'Uma venda baixa o estoque e lança a receita automaticamente. Um cancelamento desfaz tudo, preservando o histórico.' },
  { icon: Target, title: 'Feito para a sua atividade', text: 'Barbearia, loja, restaurante, oficina, pet shop, autônomo… cada um vê primeiro o que mais importa.' },
  { icon: Lightbulb, title: 'Dicas que vêm dos seus dados', text: 'Recomendações práticas com o motivo, a ação e o benefício — sem inventar números.' },
  { icon: Zap, title: 'Simples de aprender', text: 'Ações rápidas, busca global, ajuda em cada tela e mensagens claras em português.' },
];

export default function Landing() {
  return (
    <div className="bg-white">
      <div className="relative overflow-hidden bg-brand-950">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-brand-600/30 blur-3xl" />
        <PublicHeader dark />
        <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
          <div className="animate-slide-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent-400/30 bg-accent-400/10 px-3 py-1 text-xs font-semibold text-accent-300">
              <Sparkles className="size-3.5" /> Gestão inteligente para pequenos negócios
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] text-white sm:text-5xl lg:text-[56px]">
              Todas as áreas do seu negócio, <span className="text-accent-400">conectadas</span> em um só lugar.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-brand-100/80">
              Agenda, clientes, estoque, vendas, financeiro e equipe numa plataforma que se adapta ao seu segmento e mostra, todos os dias, o que merece sua atenção.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/cadastro"><Button variant="primary" size="lg">Criar minha conta <ArrowRight className="size-4" /></Button></Link>
              <Link to="/funcionalidades"><Button size="lg" variant="ghost" className="text-white ring-1 ring-white/20 hover:bg-white/10">Ver funcionalidades</Button></Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-brand-100/70">
              {['Configuração guiada em minutos', 'Dados isolados por empresa', 'Funciona no celular'].map((t) => (
                <li key={t} className="flex items-center gap-2"><Check className="size-4 text-accent-400" />{t}</li>
              ))}
            </ul>
          </div>
          <HeroPreview />
        </section>
      </div>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-ink-200 p-6 transition-shadow hover:shadow-pop">
              <div className="grid size-11 place-items-center rounded-xl bg-brand-900 text-accent-400"><p.icon className="size-5" /></div>
              <h3 className="mt-4 text-lg font-bold text-ink-950">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      <SegmentShowcase />

      <section id="dicas" className="bg-ink-50 py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-brand-600">Dicas para meu negócio</p>
            <h2 className="mt-2 text-3xl font-extrabold text-ink-950 sm:text-4xl">Um assistente que olha os seus números por você</h2>
            <p className="mt-4 text-lg text-ink-600">As recomendações consideram seu segmento, seus objetivos, as dificuldades que você informou e os dados reais registrados. Cada dica explica o motivo, a ação recomendada e o benefício esperado.</p>
            <ul className="mt-6 space-y-3 text-ink-700">
              {['Prioriza o que pode gerar perda financeira ou operacional', 'Mostra o indicador que originou a recomendação', 'Sem dados suficientes? Exibe sugestões iniciais claramente identificadas', 'Nunca inventa vendas, despesas ou tendências'].map((t) => (
                <li key={t} className="flex gap-3"><Check className="mt-0.5 size-5 shrink-0 text-brand-600" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-pop">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">Prioridade alta</span>
              <span className="text-xs text-ink-400">Exemplo ilustrativo</span>
            </div>
            <h3 className="mt-4 text-xl font-bold text-ink-950">Alguns produtos estão abaixo do estoque mínimo</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div><dt className="font-semibold text-ink-900">Por quê</dt><dd className="text-ink-600">Itens no limite do mínimo podem faltar antes da próxima compra.</dd></div>
              <div><dt className="font-semibold text-ink-900">O que fazer</dt><dd className="text-ink-600">Revise a necessidade de reposição antes de realizar novos pedidos.</dd></div>
              <div><dt className="font-semibold text-ink-900">Benefício</dt><dd className="text-ink-600">Evita perder vendas por falta de produto.</dd></div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-lg bg-brand-800 px-3 py-2 text-sm font-semibold text-white">Resolver agora</span>
              <span className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700">Ver detalhes</span>
              <span className="rounded-lg px-3 py-2 text-sm font-medium text-ink-500">Marcar como concluída</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-wider text-brand-600">Módulos</p>
          <h2 className="mt-2 text-3xl font-extrabold text-ink-950 sm:text-4xl">Mais de 20 ferramentas integradas</h2>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.values(MODULES).filter((m) => !['dashboard', 'configuracoes'].includes(m.key)).map((m) => (
            <div key={m.key} className="flex items-start gap-3 rounded-xl border border-ink-200 p-4">
              <Icon name={m.icon} className="mt-0.5 size-5 shrink-0 text-brand-600" />
              <div><p className="text-sm font-semibold text-ink-900">{m.label}</p><p className="text-xs text-ink-500">{m.description}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section id="seguranca" className="bg-brand-950 py-20 text-white sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-wider text-accent-400">Segurança</p>
            <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Seus dados separados, protegidos e sob seu controle</h2>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: LockKeyhole, t: 'Isolamento por empresa', d: 'Cada registro pertence a uma empresa e o banco de dados aplica regras de segurança em nível de linha.' },
              { icon: KeyRound, t: 'Permissões por função', d: 'Proprietário, gerente, financeiro e colaborador veem apenas o que precisam.' },
              { icon: Eye, t: 'Histórico de ações', d: 'Operações importantes ficam registradas com usuário e horário.' },
              { icon: ShieldCheck, t: 'Senhas protegidas', d: 'Senhas armazenadas com hash forte e sessões seguras.' },
            ].map((x) => (
              <div key={x.t} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <x.icon className="size-6 text-accent-400" /><h3 className="mt-4 font-bold">{x.t}</h3><p className="mt-2 text-sm text-brand-100/70">{x.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="grid gap-8 md:grid-cols-3">
          {[
            { n: '1', t: 'Crie sua conta', d: 'Nome, e-mail e senha. Leva menos de um minuto.' },
            { n: '2', t: 'Conte sobre seu negócio', d: 'Segmento, objetivos e dificuldades. O painel é montado a partir disso.' },
            { n: '3', t: 'Comece pelo que importa', d: 'Use as ações rápidas e siga as dicas para organizar sua rotina.' },
          ].map((s) => (
            <div key={s.n} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-400 font-display font-extrabold text-ink-950">{s.n}</span>
              <div><h3 className="text-lg font-bold">{s.t}</h3><p className="mt-1 text-ink-600">{s.d}</p></div>
            </div>
          ))}
        </div>
        <div className="mt-16 flex flex-col items-center justify-between gap-6 rounded-3xl bg-brand-900 px-8 py-10 text-white sm:flex-row">
          <div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">Organize seu negócio a partir de hoje</h2>
            <p className="mt-2 text-brand-100/75">Configure sua empresa e receba um painel montado para a sua atividade.</p>
          </div>
          <Link to="/cadastro"><Button variant="primary" size="lg"><Users2 className="size-5" />Criar conta</Button></Link>
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
