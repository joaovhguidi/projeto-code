// Rótulos em português para os valores enumerados do sistema.
type Labels<T extends string> = Record<T, string>;
const keys = <T extends string>(l: Labels<T>) => Object.keys(l) as [T, ...T[]];

export const APPOINTMENT_STATUS = { agendado: 'Agendado', confirmado: 'Confirmado', concluido: 'Concluído', cancelado: 'Cancelado', falta: 'Falta' } as const;
export const SALE_STATUS = { concluida: 'Concluída', cancelada: 'Cancelada' } as const;
export const PAYMENT_METHODS = { dinheiro: 'Dinheiro', pix: 'Pix', cartao_debito: 'Cartão de débito', cartao_credito: 'Cartão de crédito', boleto: 'Boleto', transferencia: 'Transferência', a_prazo: 'A prazo (fiado)', outro: 'Outro' } as const;
export const TX_STATUS = { pendente: 'Pendente', parcial: 'Parcial', pago: 'Pago', cancelado: 'Cancelado' } as const;
export const TX_KIND = { receita: 'Receita', despesa: 'Despesa' } as const;
export const QUOTE_STATUS = { rascunho: 'Rascunho', enviado: 'Enviado', aprovado: 'Aprovado', recusado: 'Recusado', expirado: 'Expirado', convertido: 'Convertido' } as const;
export const ITEM_KIND = { servico: 'Serviço', produto: 'Produto', material: 'Material', mao_de_obra: 'Mão de obra' } as const;
export const WORK_ORDER_STATUS = { aberta: 'Aberta', em_andamento: 'Em andamento', aguardando_pecas: 'Aguardando peças', concluida: 'Concluída', entregue: 'Entregue', cancelada: 'Cancelada' } as const;
export const TASK_STATUS = { pendente: 'Pendente', em_andamento: 'Em andamento', bloqueada: 'Bloqueada', concluida: 'Concluída' } as const;
export const PRIORITY = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' } as const;
export const DELIVERY_STATUS = { aguardando: 'Aguardando', em_preparacao: 'Em preparação', saiu_para_entrega: 'Saiu para entrega', concluida: 'Concluída', problema: 'Problema', cancelada: 'Cancelada' } as const;
export const EMPLOYEE_STATUS = { ativo: 'Ativo', ferias: 'Férias', afastado: 'Afastado', desligado: 'Desligado' } as const;
export const SHIFT_KIND = { turno: 'Turno', folga: 'Folga', ferias: 'Férias', indisponivel: 'Indisponível' } as const;
export const SWAP_STATUS = { pendente: 'Pendente', aprovada: 'Aprovada', recusada: 'Recusada' } as const;
export const EQUIPMENT_STATUS = { operando: 'Operando', com_defeito: 'Com defeito', em_manutencao: 'Em manutenção', desativado: 'Desativado' } as const;
export const MAINTENANCE_TYPE = { corretiva: 'Corretiva', preventiva: 'Preventiva' } as const;
export const MAINTENANCE_STATUS = { aberta: 'Aberta', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' } as const;
export const WASTE_REASON = { vencido: 'Vencido', danificado: 'Danificado', perdido: 'Perdido/extraviado', erro_preparo: 'Erro de preparo', sobra: 'Sobra/não vendido', furto: 'Furto', outro: 'Outro' } as const;
export const FEEDBACK_TYPE = { elogio: 'Elogio', sugestao: 'Sugestão', reclamacao: 'Reclamação', avaliacao: 'Avaliação' } as const;
export const FEEDBACK_STATUS = { aberta: 'Aberta', em_analise: 'Em análise', resolvida: 'Resolvida', arquivada: 'Arquivada' } as const;
export const CAMPAIGN_AUDIENCE = { todos: 'Todos os clientes', inativos: 'Clientes inativos', recorrentes: 'Clientes recorrentes', novos: 'Clientes novos', vip: 'Clientes VIP' } as const;
export const CAMPAIGN_STATUS = { planejada: 'Planejada', ativa: 'Ativa', encerrada: 'Encerrada' } as const;
export const CONTACT_CHANNEL = { telefone: 'Telefone', whatsapp: 'WhatsApp', email: 'E-mail', presencial: 'Presencial', redes_sociais: 'Redes sociais', outro: 'Outro' } as const;
export const CONTACT_OUTCOME = { sem_resposta: 'Sem resposta', interessado: 'Interessado', retornou: 'Retornou', agendou: 'Agendou', nao_interessado: 'Não interessado' } as const;
export const COLLECTION_CHANNEL = { telefone: 'Telefone', whatsapp: 'WhatsApp', email: 'E-mail', presencial: 'Presencial', outro: 'Outro' } as const;
export const COLLECTION_OUTCOME = { sem_resposta: 'Sem resposta', prometeu_pagar: 'Prometeu pagar', negociado: 'Negociado', recusou: 'Recusou', pago: 'Informou pagamento' } as const;
export const ISSUE_CATEGORY = { equipamento: 'Equipamento', sistema: 'Sistema', processo: 'Processo', infraestrutura: 'Infraestrutura', pessoas: 'Pessoas', outro: 'Outro' } as const;
export const ISSUE_STATUS = { aberta: 'Aberta', em_andamento: 'Em andamento', resolvida: 'Resolvida', cancelada: 'Cancelada' } as const;
export const CUSTOMER_RELATIONSHIP = { novo: 'Novo', ativo: 'Ativo', vip: 'VIP', em_risco: 'Em risco', inativo: 'Inativo' } as const;
export const STOCK_MOVEMENT_TYPE = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste', venda: 'Venda', estorno_venda: 'Estorno de venda', perda: 'Perda', compra: 'Compra recebida' } as const;
export const PURCHASE_STATUS = { pedido: 'Pedido feito', recebido: 'Recebido', cancelado: 'Cancelado' } as const;
export const PET_SPECIES = { cachorro: 'Cachorro', gato: 'Gato', ave: 'Ave', roedor: 'Roedor', reptil: 'Réptil', outro: 'Outro' } as const;
export const PET_SIZE = { mini: 'Mini', pequeno: 'Pequeno', medio: 'Médio', grande: 'Grande', gigante: 'Gigante' } as const;
export const TRAINING_KIND = { treinamento: 'Treinamento', documento: 'Documento', certificado: 'Certificado' } as const;
export const DOCUMENT_CATEGORY = { contrato: 'Contrato', alvara: 'Alvará/licença', fiscal: 'Fiscal/tributário', trabalhista: 'Trabalhista', seguro: 'Seguro', certificado: 'Certificado', nota_fiscal: 'Nota fiscal', outros: 'Outros' } as const;

export const enumKeys = keys;

export const UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] as const;

export const EMPLOYEE_RANGES = { '1': 'Só eu', '2-5': '2 a 5 pessoas', '6-10': '6 a 10 pessoas', '11-20': '11 a 20 pessoas', '21-50': '21 a 50 pessoas', '50+': 'Mais de 50 pessoas' } as const;

export const GOALS = {
  aumentar_vendas: 'Aumentar vendas',
  organizar_financeiro: 'Organizar o financeiro',
  reduzir_custos: 'Reduzir custos',
  fidelizar_clientes: 'Fidelizar clientes',
  organizar_agenda: 'Organizar a agenda',
  controlar_estoque: 'Controlar o estoque',
  organizar_equipe: 'Organizar a equipe',
  reduzir_desperdicio: 'Reduzir desperdícios',
  melhorar_atendimento: 'Melhorar o atendimento',
  cumprir_prazos: 'Cumprir prazos de entrega',
} as const;
export type GoalKey = keyof typeof GOALS;

export const DIFFICULTIES = {
  controle_financeiro: 'Não sei quanto entra e sai',
  cobrancas_atrasadas: 'Clientes que atrasam pagamentos',
  controle_estoque: 'Falta ou sobra de produtos',
  agenda_desorganizada: 'Agenda desorganizada',
  faltas_clientes: 'Clientes que faltam ou cancelam',
  gestao_equipe: 'Organizar a equipe e as escalas',
  precificacao: 'Definir preços e orçamentos',
  desperdicio: 'Perdas e desperdícios',
  entregas_atrasadas: 'Entregas e prazos atrasados',
  fidelizacao: 'Clientes que não voltam',
  documentos: 'Documentos e prazos legais',
  falta_tempo: 'Falta de tempo para administrar',
} as const;
export type DifficultyKey = keyof typeof DIFFICULTIES;
