// Catálogos usados pelas regras de personalização por segmento.
// Um segmento novo é apenas um registro em business_segments que referencia
// estas chaves; não é preciso alterar código para cadastrá-lo.
import { MODULES, MODULE_KEYS, type ModuleKey } from './modules';
import { can, type Role } from './permissions';
import type { DifficultyKey, GoalKey } from './labels';

export const KPI_CATALOG = {
  appointments_today: { label: 'Atendimentos hoje', module: 'agenda', format: 'number' },
  free_slots_today: { label: 'Horários livres hoje', module: 'agenda', format: 'number' },
  upcoming_appointments: { label: 'Compromissos (7 dias)', module: 'agenda', format: 'number' },
  cancellations_month: { label: 'Cancelamentos e faltas no mês', module: 'agenda', format: 'number' },
  revenue_month: { label: 'Faturamento do mês', module: 'financeiro', format: 'currency' },
  expenses_month: { label: 'Despesas do mês', module: 'financeiro', format: 'currency' },
  result_month: { label: 'Resultado estimado do mês', module: 'financeiro', format: 'currency' },
  cash_balance: { label: 'Saldo de caixa', module: 'financeiro', format: 'currency' },
  sales_month: { label: 'Vendas do mês', module: 'vendas', format: 'currency' },
  sales_today: { label: 'Vendas hoje', module: 'vendas', format: 'currency' },
  orders_today: { label: 'Pedidos hoje', module: 'vendas', format: 'number' },
  avg_ticket_month: { label: 'Ticket médio do mês', module: 'vendas', format: 'currency' },
  estimated_margin_month: { label: 'Margem bruta estimada', module: 'vendas', format: 'percent' },
  low_stock_count: { label: 'Produtos com estoque baixo', module: 'estoque', format: 'number' },
  out_of_stock_count: { label: 'Produtos em falta', module: 'estoque', format: 'number' },
  expiring_products: { label: 'Vencendo em 30 dias', module: 'estoque', format: 'number' },
  waste_month: { label: 'Perdas registradas no mês', module: 'desperdicios', format: 'currency' },
  receivables_open: { label: 'A receber', module: 'cobrancas', format: 'currency' },
  overdue_receivables: { label: 'Recebimentos atrasados', module: 'cobrancas', format: 'currency' },
  payables_open: { label: 'Contas a pagar', module: 'financeiro', format: 'currency' },
  pending_quotes: { label: 'Orçamentos aguardando resposta', module: 'orcamentos', format: 'number' },
  work_orders_open: { label: 'Serviços em andamento', module: 'ordens_servico', format: 'number' },
  work_orders_done_month: { label: 'Serviços concluídos no mês', module: 'ordens_servico', format: 'number' },
  deliveries_pending: { label: 'Entregas pendentes', module: 'entregas', format: 'number' },
  deliveries_late: { label: 'Entregas atrasadas', module: 'entregas', format: 'number' },
  deliveries_done_month: { label: 'Entregas concluídas no mês', module: 'entregas', format: 'number' },
  delivery_costs_month: { label: 'Custos de entrega no mês', module: 'entregas', format: 'currency' },
  customers_total: { label: 'Clientes ativos', module: 'clientes', format: 'number' },
  inactive_customers: { label: 'Clientes inativos (90 dias)', module: 'clientes', format: 'number' },
  tasks_overdue: { label: 'Tarefas atrasadas', module: 'tarefas', format: 'number' },
  open_issues: { label: 'Solicitações abertas', module: 'solicitacoes', format: 'number' },
  open_complaints: { label: 'Reclamações abertas', module: 'avaliacoes', format: 'number' },
  pets_total: { label: 'Animais cadastrados', module: 'animais', format: 'number' },
} as const satisfies Record<string, { label: string; module: ModuleKey; format: 'number' | 'currency' | 'percent' }>;
export type KpiKey = keyof typeof KPI_CATALOG;

export const QUICK_ACTIONS = {
  new_appointment: { label: 'Agendar atendimento', icon: 'CalendarPlus', path: '/app/agenda?novo=1', module: 'agenda' },
  new_customer: { label: 'Cadastrar cliente', icon: 'UserPlus', path: '/app/clientes?novo=1', module: 'clientes' },
  register_payment: { label: 'Registrar pagamento', icon: 'BadgeDollarSign', path: '/app/vendas/nova', module: 'vendas' },
  register_receipt: { label: 'Registrar recebimento', icon: 'HandCoins', path: '/app/cobrancas', module: 'cobrancas' },
  new_product: { label: 'Cadastrar produto', icon: 'PackagePlus', path: '/app/estoque?novo=1', module: 'estoque' },
  new_sale: { label: 'Registrar venda', icon: 'ShoppingCart', path: '/app/vendas/nova', module: 'vendas' },
  new_order: { label: 'Registrar pedido', icon: 'ClipboardList', path: '/app/vendas/nova', module: 'vendas' },
  stock_entry: { label: 'Atualizar estoque', icon: 'ArrowDownUp', path: '/app/estoque?movimentar=1', module: 'estoque' },
  new_supplier: { label: 'Cadastrar fornecedor', icon: 'Factory', path: '/app/fornecedores?novo=1', module: 'fornecedores' },
  new_work_order: { label: 'Abrir ordem de serviço', icon: 'Wrench', path: '/app/ordens-servico/nova', module: 'ordens_servico' },
  new_vehicle: { label: 'Cadastrar veículo', icon: 'Car', path: '/app/veiculos?novo=1', module: 'veiculos' },
  new_quote: { label: 'Criar orçamento', icon: 'FilePlus2', path: '/app/orcamentos/novo', module: 'orcamentos' },
  new_pet: { label: 'Cadastrar animal', icon: 'PawPrint', path: '/app/animais?novo=1', module: 'animais' },
  new_delivery: { label: 'Nova entrega', icon: 'Truck', path: '/app/entregas?novo=1', module: 'entregas' },
  new_task: { label: 'Nova tarefa', icon: 'ListPlus', path: '/app/tarefas?novo=1', module: 'tarefas' },
  new_expense: { label: 'Lançar despesa', icon: 'Receipt', path: '/app/financeiro?novo=despesa', module: 'financeiro' },
  new_income: { label: 'Lançar receita', icon: 'CirclePlus', path: '/app/financeiro?novo=receita', module: 'financeiro' },
  new_waste: { label: 'Registrar perda', icon: 'Trash2', path: '/app/desperdicios?novo=1', module: 'desperdicios' },
} as const satisfies Record<string, { label: string; icon: string; path: string; module: ModuleKey }>;
export type QuickActionKey = keyof typeof QUICK_ACTIONS;

export const ALERT_CATALOG = {
  overdue_receivables: { label: 'Recebimentos atrasados', module: 'cobrancas' },
  overdue_payables: { label: 'Contas a pagar vencidas', module: 'financeiro' },
  low_stock: { label: 'Estoque baixo', module: 'estoque' },
  expiring_products: { label: 'Produtos perto do vencimento', module: 'estoque' },
  unconfirmed_appointments: { label: 'Agendamentos sem confirmação', module: 'agenda' },
  overdue_tasks: { label: 'Tarefas atrasadas', module: 'tarefas' },
  late_deliveries: { label: 'Entregas atrasadas', module: 'entregas' },
  late_work_orders: { label: 'Ordens de serviço atrasadas', module: 'ordens_servico' },
  expiring_quotes: { label: 'Orçamentos perto de expirar', module: 'orcamentos' },
  documents_expiring: { label: 'Documentos vencendo', module: 'documentos' },
  preventive_due: { label: 'Manutenção preventiva', module: 'manutencao' },
  open_complaints: { label: 'Reclamações sem solução', module: 'avaliacoes' },
  pending_swaps: { label: 'Trocas de turno pendentes', module: 'escalas' },
} as const satisfies Record<string, { label: string; module: ModuleKey }>;
export type AlertKey = keyof typeof ALERT_CATALOG;

export const CHART_CATALOG = {
  revenue_expenses: { label: 'Receitas x despesas (6 meses)', module: 'financeiro' },
  sales_daily: { label: 'Vendas dos últimos 30 dias', module: 'vendas' },
  appointments_week: { label: 'Atendimentos da semana', module: 'agenda' },
  top_services: { label: 'Serviços com maior faturamento', module: 'vendas' },
  top_products: { label: 'Produtos mais vendidos', module: 'vendas' },
  waste_by_reason: { label: 'Perdas por motivo', module: 'desperdicios' },
  deliveries_status: { label: 'Entregas por situação', module: 'entregas' },
  work_orders_status: { label: 'Ordens de serviço por situação', module: 'ordens_servico' },
} as const satisfies Record<string, { label: string; module: ModuleKey }>;
export type ChartKey = keyof typeof CHART_CATALOG;

export const REPORT_CATALOG = {
  sales_by_period: { label: 'Vendas por período', module: 'vendas' },
  revenue_expenses: { label: 'Receitas e despesas', module: 'financeiro' },
  financial_result: { label: 'Resultado financeiro estimado', module: 'financeiro' },
  expenses_by_category: { label: 'Despesas por categoria', module: 'financeiro' },
  top_products: { label: 'Produtos mais vendidos', module: 'vendas' },
  stale_products: { label: 'Produtos parados', module: 'estoque' },
  top_services: { label: 'Serviços mais procurados', module: 'vendas' },
  recurring_customers: { label: 'Clientes recorrentes', module: 'clientes' },
  low_stock: { label: 'Estoque baixo', module: 'estoque' },
  overdue_tasks: { label: 'Tarefas atrasadas', module: 'tarefas' },
  pending_deliveries: { label: 'Entregas pendentes e atrasos', module: 'entregas' },
  waste_by_reason: { label: 'Desperdícios por motivo', module: 'desperdicios' },
  appointments_by_status: { label: 'Atendimentos por situação', module: 'agenda' },
  receivables_aging: { label: 'Recebíveis por atraso', module: 'cobrancas' },
} as const satisfies Record<string, { label: string; module: ModuleKey }>;
export type ReportKey = keyof typeof REPORT_CATALOG;

export interface StarterTip {
  title: string;
  reason: string;
  action: string;
  benefit: string;
  module?: ModuleKey;
}

/** Configuração armazenada em business_segments.config */
export interface SegmentConfig {
  modules: ModuleKey[];
  kpis: KpiKey[];
  quickActions: QuickActionKey[];
  alerts: AlertKey[];
  charts: ChartKey[];
  reports: ReportKey[];
  tips: string[]; // chaves de regras de dicas em ordem de relevância
  starterTips: StarterTip[];
  /** termos usados na interface, ex.: { sale: 'Pedido' } */
  terms?: Partial<Record<'sale' | 'sales' | 'customer' | 'customers' | 'appointment', string>>;
  /** nomes de serviços sugeridos durante o cadastro */
  suggestedServices?: { name: string; duration: number; price: number }[];
}

export interface SegmentInfo {
  key: string;
  name: string;
  icon: string;
  description: string;
  config: SegmentConfig;
}

export interface CompanyPreferences {
  /** prioridades escolhidas manualmente (segmento "Outro" ou ajuste em Configurações) */
  priorityModules?: ModuleKey[];
  favorites?: ModuleKey[];
  cardOrder?: string[];
  hiddenCards?: string[];
  kpis?: KpiKey[];
}

// Influência das dificuldades e objetivos declarados no cadastro.
const DIFFICULTY_BOOST: Partial<Record<DifficultyKey, { modules: ModuleKey[]; kpis: KpiKey[]; alerts: AlertKey[] }>> = {
  controle_financeiro: { modules: ['financeiro'], kpis: ['result_month', 'cash_balance'], alerts: ['overdue_payables'] },
  cobrancas_atrasadas: { modules: ['cobrancas'], kpis: ['overdue_receivables'], alerts: ['overdue_receivables'] },
  controle_estoque: { modules: ['estoque'], kpis: ['low_stock_count'], alerts: ['low_stock'] },
  agenda_desorganizada: { modules: ['agenda'], kpis: ['appointments_today'], alerts: ['unconfirmed_appointments'] },
  faltas_clientes: { modules: ['agenda'], kpis: ['cancellations_month'], alerts: ['unconfirmed_appointments'] },
  gestao_equipe: { modules: ['equipe', 'escalas', 'tarefas'], kpis: ['tasks_overdue'], alerts: ['overdue_tasks'] },
  precificacao: { modules: ['orcamentos'], kpis: ['estimated_margin_month'], alerts: [] },
  desperdicio: { modules: ['desperdicios'], kpis: ['waste_month'], alerts: ['expiring_products'] },
  entregas_atrasadas: { modules: ['entregas'], kpis: ['deliveries_late'], alerts: ['late_deliveries'] },
  fidelizacao: { modules: ['fidelizacao', 'clientes'], kpis: ['inactive_customers'], alerts: [] },
  documentos: { modules: ['documentos'], kpis: [], alerts: ['documents_expiring'] },
  falta_tempo: { modules: ['tarefas'], kpis: ['tasks_overdue'], alerts: ['overdue_tasks'] },
};
const GOAL_BOOST: Partial<Record<GoalKey, ModuleKey[]>> = {
  aumentar_vendas: ['vendas'],
  organizar_financeiro: ['financeiro'],
  reduzir_custos: ['financeiro', 'desperdicios'],
  fidelizar_clientes: ['fidelizacao'],
  organizar_agenda: ['agenda'],
  controlar_estoque: ['estoque'],
  organizar_equipe: ['equipe', 'escalas'],
  reduzir_desperdicio: ['desperdicios'],
  melhorar_atendimento: ['avaliacoes'],
  cumprir_prazos: ['tarefas', 'entregas'],
};

const uniq = <T,>(arr: T[]) => [...new Set(arr)];

export interface ResolvedWorkspace {
  priorityModules: ModuleKey[];  // destacados no menu, em ordem
  otherModules: ModuleKey[];     // demais módulos, acessíveis
  favorites: ModuleKey[];
  kpis: KpiKey[];
  quickActions: QuickActionKey[];
  alerts: AlertKey[];
  charts: ChartKey[];
  reports: ReportKey[];
  tips: string[];
  cardOrder: string[];
  hiddenCards: string[];
}

export const DASHBOARD_CARDS = {
  kpis: 'Indicadores',
  quick_actions: 'Ações rápidas',
  alerts: 'Alertas importantes',
  agenda: 'Próximos compromissos',
  tasks: 'Tarefas pendentes',
  tips: 'Dicas personalizadas',
  charts: 'Gráficos',
  activity: 'Atividades recentes',
} as const;
export type DashboardCard = keyof typeof DASHBOARD_CARDS;
export const DEFAULT_CARD_ORDER: DashboardCard[] = ['kpis', 'quick_actions', 'alerts', 'charts', 'agenda', 'tasks', 'tips', 'activity'];

/**
 * Resolve o espaço de trabalho de uma empresa combinando, nesta ordem:
 * regras do segmento → objetivos e dificuldades → escolhas do usuário → permissões.
 */
export function resolveWorkspace(input: {
  segment: SegmentConfig;
  goals: string[];
  difficulties: string[];
  preferences: CompanyPreferences;
  role: Role;
}): ResolvedWorkspace {
  const { segment, preferences, role } = input;
  const boosts = input.difficulties.map((d) => DIFFICULTY_BOOST[d as DifficultyKey]).filter(Boolean) as NonNullable<(typeof DIFFICULTY_BOOST)[DifficultyKey]>[];
  const goalModules = input.goals.flatMap((g) => GOAL_BOOST[g as GoalKey] ?? []);

  const base = preferences.priorityModules?.length ? preferences.priorityModules : segment.modules;
  // Os módulos do segmento mantêm a ordem; dificuldades/objetivos entram logo depois dos 3 primeiros.
  const head = base.slice(0, 3);
  const extra = uniq([...boosts.flatMap((b) => b.modules), ...goalModules]).filter((m) => !head.includes(m));
  const prioritySize = Math.max(base.length, 4);
  let priority = uniq([...head, ...extra, ...base.slice(3)]).slice(0, Math.min(prioritySize + 1, 8));

  const visible = (m: ModuleKey) => can(role, m, 'read') && !MODULES[m].fixed;
  priority = priority.filter(visible);
  const others = MODULE_KEYS.filter((m) => visible(m) && !priority.includes(m));

  const kpiAllowed = (k: KpiKey) => can(role, KPI_CATALOG[k].module, 'read');
  // prioridades escolhidas manualmente puxam o indicador e a ação principal de cada módulo
  const manual = !!preferences.priorityModules?.length;
  const firstKpiOf = (m: ModuleKey) => (Object.keys(KPI_CATALOG) as KpiKey[]).find((k) => KPI_CATALOG[k].module === m);
  const firstActionOf = (m: ModuleKey) => (Object.keys(QUICK_ACTIONS) as QuickActionKey[]).find((q) => QUICK_ACTIONS[q].module === m);
  const manualKpis = manual ? preferences.priorityModules!.map(firstKpiOf).filter(Boolean) as KpiKey[] : [];
  const manualActions = manual ? preferences.priorityModules!.map(firstActionOf).filter(Boolean) as QuickActionKey[] : [];
  const kpiBase = preferences.kpis?.length ? preferences.kpis : uniq([...manualKpis, ...segment.kpis]);
  const kpis = uniq([...kpiBase.slice(0, 4), ...boosts.flatMap((b) => b.kpis), ...kpiBase.slice(4)])
    .filter((k) => k in KPI_CATALOG && kpiAllowed(k))
    .slice(0, preferences.kpis?.length ? 12 : 6);

  const alerts = uniq([...segment.alerts, ...boosts.flatMap((b) => b.alerts)])
    .filter((a) => a in ALERT_CATALOG && can(role, ALERT_CATALOG[a].module, 'read'));
  // Alertas gerais sempre avaliados ao final, para não perder problemas fora do foco do segmento.
  const generalAlerts: AlertKey[] = ['overdue_receivables', 'overdue_payables', 'overdue_tasks', 'documents_expiring', 'low_stock', 'open_complaints'];
  for (const a of generalAlerts) if (!alerts.includes(a) && can(role, ALERT_CATALOG[a].module, 'read')) alerts.push(a);

  return {
    priorityModules: priority,
    otherModules: others,
    favorites: (preferences.favorites ?? []).filter((m) => can(role, m, 'read')),
    kpis,
    quickActions: uniq([...manualActions, ...segment.quickActions]).filter((q) => q in QUICK_ACTIONS && can(role, QUICK_ACTIONS[q].module, 'write')).slice(0, 6),
    alerts,
    charts: segment.charts.filter((c) => c in CHART_CATALOG && can(role, CHART_CATALOG[c].module, 'read')),
    reports: segment.reports.filter((r) => r in REPORT_CATALOG && can(role, REPORT_CATALOG[r].module, 'read')),
    tips: segment.tips,
    cardOrder: uniq([...(preferences.cardOrder ?? []).filter((c) => c in DASHBOARD_CARDS), ...DEFAULT_CARD_ORDER]),
    hiddenCards: (preferences.hiddenCards ?? []).filter((c) => c in DASHBOARD_CARDS),
  };
}
