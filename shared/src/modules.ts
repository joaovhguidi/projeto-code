// Catálogo de módulos da plataforma. A ordem/destaque de cada módulo é
// decidida pelas regras de segmento; todos continuam acessíveis.
export const MODULE_KEYS = [
  'dashboard', 'dicas', 'clientes', 'agenda', 'servicos', 'animais', 'veiculos',
  'vendas', 'estoque', 'orcamentos', 'ordens_servico', 'financeiro', 'cobrancas',
  'entregas', 'fornecedores', 'tarefas', 'equipe', 'escalas', 'manutencao',
  'desperdicios', 'avaliacoes', 'fidelizacao', 'relatorios', 'documentos',
  'solicitacoes', 'configuracoes',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export type ModuleGroup = 'inicio' | 'atendimento' | 'comercial' | 'financeiro' | 'operacao' | 'pessoas' | 'gestao';

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  path: string;
  icon: string; // nome do ícone lucide
  group: ModuleGroup;
  description: string;
  /** módulos fixos não entram na ordenação por prioridade */
  fixed?: boolean;
}

export const MODULES: Record<ModuleKey, ModuleDef> = {
  dashboard: { key: 'dashboard', label: 'Painel', path: '/app', icon: 'LayoutDashboard', group: 'inicio', description: 'Visão geral do negócio', fixed: true },
  dicas: { key: 'dicas', label: 'Dicas para meu negócio', path: '/app/dicas', icon: 'Lightbulb', group: 'inicio', description: 'Recomendações práticas baseadas nos seus dados', fixed: true },
  clientes: { key: 'clientes', label: 'Clientes', path: '/app/clientes', icon: 'Users', group: 'atendimento', description: 'Cadastro, histórico e relacionamento' },
  agenda: { key: 'agenda', label: 'Agenda', path: '/app/agenda', icon: 'CalendarDays', group: 'atendimento', description: 'Agendamentos por dia, semana e mês' },
  servicos: { key: 'servicos', label: 'Serviços', path: '/app/servicos', icon: 'Scissors', group: 'atendimento', description: 'Catálogo de serviços, duração e preços' },
  animais: { key: 'animais', label: 'Animais', path: '/app/animais', icon: 'PawPrint', group: 'atendimento', description: 'Cadastro dos pets dos clientes' },
  veiculos: { key: 'veiculos', label: 'Veículos', path: '/app/veiculos', icon: 'Car', group: 'atendimento', description: 'Veículos e histórico por cliente' },
  vendas: { key: 'vendas', label: 'Vendas', path: '/app/vendas', icon: 'ShoppingCart', group: 'comercial', description: 'Registro de vendas e pedidos' },
  estoque: { key: 'estoque', label: 'Produtos e estoque', path: '/app/estoque', icon: 'Package', group: 'comercial', description: 'Produtos, movimentações e alertas' },
  orcamentos: { key: 'orcamentos', label: 'Orçamentos', path: '/app/orcamentos', icon: 'FileText', group: 'comercial', description: 'Propostas, aprovação e conversão' },
  ordens_servico: { key: 'ordens_servico', label: 'Ordens de serviço', path: '/app/ordens-servico', icon: 'Wrench', group: 'comercial', description: 'Serviços em andamento e concluídos' },
  financeiro: { key: 'financeiro', label: 'Financeiro', path: '/app/financeiro', icon: 'Wallet', group: 'financeiro', description: 'Receitas, despesas e fluxo de caixa' },
  cobrancas: { key: 'cobrancas', label: 'Contas a receber', path: '/app/cobrancas', icon: 'HandCoins', group: 'financeiro', description: 'Valores pendentes e cobranças' },
  entregas: { key: 'entregas', label: 'Entregas e pedidos', path: '/app/entregas', icon: 'Truck', group: 'operacao', description: 'Pedidos, rotas e ocorrências' },
  fornecedores: { key: 'fornecedores', label: 'Fornecedores', path: '/app/fornecedores', icon: 'Factory', group: 'operacao', description: 'Contatos, cotações e compras' },
  tarefas: { key: 'tarefas', label: 'Tarefas', path: '/app/tarefas', icon: 'ListChecks', group: 'operacao', description: 'Tarefas e projetos da equipe' },
  manutencao: { key: 'manutencao', label: 'Manutenção', path: '/app/manutencao', icon: 'Cog', group: 'operacao', description: 'Equipamentos e manutenções' },
  desperdicios: { key: 'desperdicios', label: 'Desperdícios', path: '/app/desperdicios', icon: 'Trash2', group: 'operacao', description: 'Perdas, motivos e impacto' },
  equipe: { key: 'equipe', label: 'Equipe', path: '/app/equipe', icon: 'UserRound', group: 'pessoas', description: 'Colaboradores e funções' },
  escalas: { key: 'escalas', label: 'Escalas', path: '/app/escalas', icon: 'CalendarClock', group: 'pessoas', description: 'Turnos, folgas e trocas' },
  avaliacoes: { key: 'avaliacoes', label: 'Avaliações', path: '/app/avaliacoes', icon: 'MessageSquareWarning', group: 'pessoas', description: 'Opiniões e reclamações' },
  fidelizacao: { key: 'fidelizacao', label: 'Fidelização', path: '/app/fidelizacao', icon: 'HeartHandshake', group: 'pessoas', description: 'Recorrência, retornos e campanhas' },
  relatorios: { key: 'relatorios', label: 'Relatórios', path: '/app/relatorios', icon: 'BarChart3', group: 'gestao', description: 'Indicadores calculados dos seus dados' },
  documentos: { key: 'documentos', label: 'Documentos', path: '/app/documentos', icon: 'FolderLock', group: 'gestao', description: 'Contratos, alvarás e vencimentos' },
  solicitacoes: { key: 'solicitacoes', label: 'Solicitações', path: '/app/solicitacoes', icon: 'LifeBuoy', group: 'gestao', description: 'Problemas internos e pedidos' },
  configuracoes: { key: 'configuracoes', label: 'Configurações', path: '/app/configuracoes', icon: 'Settings', group: 'gestao', description: 'Empresa, usuários e preferências', fixed: true },
};

export const GROUP_LABELS: Record<ModuleGroup, string> = {
  inicio: 'Início',
  atendimento: 'Atendimento',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  operacao: 'Operação',
  pessoas: 'Pessoas',
  gestao: 'Gestão',
};

export function isModuleKey(v: unknown): v is ModuleKey {
  return typeof v === 'string' && (MODULE_KEYS as readonly string[]).includes(v);
}
