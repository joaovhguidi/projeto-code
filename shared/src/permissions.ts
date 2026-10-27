import { MODULE_KEYS, type ModuleKey } from './modules';

export const ROLES = ['proprietario', 'gerente', 'financeiro', 'colaborador'] as const;
export type Role = (typeof ROLES)[number];
export type AccessLevel = 'none' | 'read' | 'write';

export const ROLE_LABELS: Record<Role, string> = {
  proprietario: 'Proprietário',
  gerente: 'Gerente',
  financeiro: 'Financeiro',
  colaborador: 'Colaborador',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  proprietario: 'Acesso total, incluindo usuários, permissões e exclusão de dados.',
  gerente: 'Gerencia todos os módulos operacionais e financeiros; não administra usuários.',
  financeiro: 'Financeiro, cobranças, vendas e relatórios. Consulta clientes e fornecedores.',
  colaborador: 'Rotina operacional: agenda, clientes, vendas, tarefas e entregas. Sem acesso a dados financeiros ou administrativos.',
};

const all = (level: AccessLevel) =>
  Object.fromEntries(MODULE_KEYS.map((k) => [k, level])) as Record<ModuleKey, AccessLevel>;

export const PERMISSIONS: Record<Role, Record<ModuleKey, AccessLevel>> = {
  proprietario: all('write'),
  gerente: { ...all('write'), configuracoes: 'read' },
  financeiro: {
    ...all('none'),
    dashboard: 'read', dicas: 'read', financeiro: 'write', cobrancas: 'write', vendas: 'write',
    relatorios: 'read', fornecedores: 'write', clientes: 'read', orcamentos: 'read',
    estoque: 'read', documentos: 'read', tarefas: 'write', solicitacoes: 'write',
    desperdicios: 'read', manutencao: 'read', configuracoes: 'read',
  },
  colaborador: {
    ...all('none'),
    dashboard: 'read', dicas: 'read', clientes: 'write', agenda: 'write', servicos: 'read',
    animais: 'write', veiculos: 'write', vendas: 'write', estoque: 'read', orcamentos: 'write',
    ordens_servico: 'write', entregas: 'write', tarefas: 'write', escalas: 'read',
    desperdicios: 'write', avaliacoes: 'write', fidelizacao: 'write', solicitacoes: 'write',
    manutencao: 'write', configuracoes: 'read',
  },
};

export function accessLevel(role: Role, module: ModuleKey): AccessLevel {
  return PERMISSIONS[role]?.[module] ?? 'none';
}

export function can(role: Role, module: ModuleKey, level: 'read' | 'write' = 'read'): boolean {
  const granted = accessLevel(role, module);
  if (level === 'read') return granted === 'read' || granted === 'write';
  return granted === 'write';
}

/** Ações administrativas que vão além do acesso a um módulo. */
export const ADMIN_ACTIONS = {
  manageUsers: ['proprietario'] as Role[],
  editCompany: ['proprietario', 'gerente'] as Role[],
  exportData: ['proprietario'] as Role[],
  viewActivityLog: ['proprietario', 'gerente'] as Role[],
  viewCosts: ['proprietario', 'gerente', 'financeiro'] as Role[],
  restrictedDocuments: ['proprietario', 'gerente'] as Role[],
};
export type AdminAction = keyof typeof ADMIN_ACTIONS;
export const canDo = (role: Role, action: AdminAction) => ADMIN_ACTIONS[action].includes(role);
