import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { GROUP_LABELS, MODULES, type ModuleGroup } from '@nexo/shared';
import { Icon } from '@/lib/icons';
import { Button } from '@/components/ui';
import { PublicFooter, PublicHeader } from './public-layout';

const DETAILS: Partial<Record<keyof typeof MODULES, string[]>> = {
  clientes: ['Histórico de compras e atendimentos', 'Data do último atendimento', 'Identificação de clientes inativos', 'Busca, filtros e paginação'],
  agenda: ['Visões diária, semanal e mensal', 'Prevenção de conflitos por profissional', 'Horários livres calculados', 'Status: agendado, confirmado, concluído, cancelado e falta'],
  estoque: ['Entradas, saídas e ajustes com histórico', 'Estoque mínimo e alertas', 'Controle de validade', 'Produtos mais vendidos e parados'],
  vendas: ['Produtos e serviços na mesma venda', 'Baixa automática de estoque', 'Receita lançada sem duplicação', 'Cancelamento com estorno controlado'],
  financeiro: ['Receitas, despesas e categorias', 'Contas a pagar e receber, com parcelas', 'Fluxo de caixa', 'Faturamento, resultado estimado e saldo de caixa separados'],
  cobrancas: ['Pagamentos parciais', 'Identificação de atrasos', 'Registro de contatos de cobrança', 'Recebíveis por faixa de atraso'],
  orcamentos: ['Materiais, mão de obra e serviços', 'Validade e status', 'Conversão em venda ou OS', 'Impressão e PDF pelo navegador'],
  ordens_servico: ['Veículo/equipamento vinculado', 'Prazos e horas estimadas x reais', 'Faturamento com baixa de peças'],
  equipe: ['Funções e responsabilidades', 'Treinamentos e documentos', 'Usuários com permissões por função'],
  escalas: ['Turnos, folgas e férias', 'Bloqueio de sobreposição', 'Pedidos de troca de turno', 'Cópia da escala da semana anterior'],
  entregas: ['Status e linha do tempo', 'Registro de ocorrências', 'Atrasos e custos por entrega'],
  dicas: ['Regras por segmento e dados reais', 'Motivo, ação e benefício', 'Concluir, dispensar e ver histórico'],
};

export default function Features() {
  const groups = Object.entries(GROUP_LABELS) as [ModuleGroup, string][];
  return (
    <div className="bg-white">
      <PublicHeader />
      <section className="mx-auto max-w-7xl px-4 pb-10 pt-16 sm:px-6">
        <p className="text-sm font-bold uppercase tracking-wider text-brand-600">Funcionalidades</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-extrabold text-ink-950 sm:text-5xl">Tudo o que um pequeno negócio precisa, integrado.</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-600">Cada módulo grava dados reais e conversa com os demais. Os que mais importam para o seu segmento aparecem primeiro.</p>
      </section>
      <div className="mx-auto max-w-7xl space-y-14 px-4 pb-20 sm:px-6">
        {groups.map(([g, label]) => {
          const mods = Object.values(MODULES).filter((m) => m.group === g && m.key !== 'dashboard');
          if (!mods.length) return null;
          return (
            <section key={g}>
              <h2 className="text-xl font-extrabold text-ink-950">{label}</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {mods.map((m) => (
                  <article key={m.key} className="rounded-2xl border border-ink-200 p-6">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100"><Icon name={m.icon} className="size-5" /></span>
                      <h3 className="font-bold text-ink-950">{m.label}</h3>
                    </div>
                    <p className="mt-3 text-sm text-ink-600">{m.description}</p>
                    {DETAILS[m.key] && (
                      <ul className="mt-4 space-y-1.5">
                        {DETAILS[m.key]!.map((d) => <li key={d} className="flex gap-2 text-sm text-ink-700"><Check className="mt-0.5 size-4 shrink-0 text-brand-600" />{d}</li>)}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
        <div className="rounded-3xl bg-brand-950 p-10 text-center text-white">
          <h2 className="text-3xl font-extrabold">Pronto para organizar seu negócio?</h2>
          <Link to="/cadastro" className="mt-6 inline-block"><Button variant="primary" size="lg">Criar conta</Button></Link>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
