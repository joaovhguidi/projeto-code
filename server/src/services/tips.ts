import crypto from 'node:crypto';
import { can, canDo, type ModuleKey, type SegmentConfig, type StarterTip } from '@nexo/shared';
import type { Db } from '../db/pool';
import type { Ctx } from '../middleware/auth';
import { freeSlotsToday, refDates } from './insights';

/**
 * Assistente "Dicas para meu negócio".
 * Cada regra examina dados reais da empresa e só gera uma dica quando há
 * evidência. Quando não há dados suficientes, são exibidas sugestões iniciais
 * do segmento, claramente identificadas como tal.
 */
export interface Tip {
  key: string;
  fingerprint: string;
  kind: 'dados' | 'inicial';
  priority: number; // menor = mais importante (perdas financeiras primeiro)
  module: ModuleKey;
  title: string;
  reason: string;
  action: string;
  benefit: string;
  indicator?: { label: string; value: string };
  resolveHref?: string;
  detailsHref?: string;
}

const brl = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const fp = (...parts: unknown[]) => crypto.createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

type Rule = { module: ModuleKey; run: (db: Db, ctx: Ctx, today: string) => Promise<Omit<Tip, 'key' | 'kind' | 'module'> | null> };
const one = async (db: Db, sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0];

export const RULES: Record<string, Rule> = {
  overdue_receivables: { module: 'cobrancas', run: async (db, ctx, today) => {
    const x = await one(db, `SELECT count(*)::int n, coalesce(sum(amount-amount_paid),0) v, count(DISTINCT customer_id)::int c,
                                    min(due_date) oldest FROM financial_transactions WHERE company_id=$1 AND kind='receita' AND status IN ('pendente','parcial') AND due_date < $2`, [ctx.companyId, today]);
    if (!x.n) return null;
    return { fingerprint: fp(x.n, x.v), priority: 1, title: 'Confira os pagamentos vencidos e atualize as cobranças',
      reason: `Há ${x.n} recebimento${x.n > 1 ? 's' : ''} vencido${x.n > 1 ? 's' : ''}${x.c ? ` de ${x.c} cliente${x.c > 1 ? 's' : ''}` : ''}. Quanto mais tempo passa, menor a chance de receber.`,
      action: 'Entre em contato com cada cliente, registre o contato e, se ele pagou, registre o recebimento.',
      benefit: 'Dinheiro que já é seu volta para o caixa e o histórico de cobrança fica documentado.',
      indicator: { label: 'Total vencido', value: brl(x.v) }, resolveHref: '/app/cobrancas?status=atrasado', detailsHref: '/app/relatorios?r=receivables_aging' };
  } },
  overdue_payables: { module: 'financeiro', run: async (db, ctx, today) => {
    const x = await one(db, `SELECT count(*)::int n, coalesce(sum(amount-amount_paid),0) v FROM financial_transactions WHERE company_id=$1 AND kind='despesa' AND status IN ('pendente','parcial') AND due_date < $2`, [ctx.companyId, today]);
    if (!x.n) return null;
    return { fingerprint: fp(x.n, x.v), priority: 1, title: 'Existem contas a pagar vencidas',
      reason: `${x.n} conta${x.n > 1 ? 's' : ''} venceu sem registro de pagamento. Se já foram pagas, o caixa está desatualizado; se não, podem gerar juros.`,
      action: 'Registre os pagamentos já feitos ou negocie com o fornecedor.', benefit: 'Caixa fiel à realidade e menos multas.',
      indicator: { label: 'Valor vencido', value: brl(x.v) }, resolveHref: '/app/financeiro?kind=despesa&status=atrasado' };
  } },
  unconfirmed_appointments: { module: 'agenda', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n FROM appointments WHERE company_id=$1 AND status='agendado' AND starts_at BETWEEN now() AND now() + interval '48 hours'`, [ctx.companyId]);
    if (!x.n) return null;
    return { fingerprint: fp(x.n), priority: 2, title: 'Existem atendimentos agendados sem confirmação',
      reason: `${x.n} atendimento${x.n > 1 ? 's' : ''} nas próximas 48 horas ainda não foi confirmado.`,
      action: 'Revise a agenda, fale com os clientes e marque como confirmado.', benefit: 'Menor risco de faltas e horários vazios.',
      indicator: { label: 'Sem confirmação (48h)', value: String(x.n) }, resolveHref: '/app/agenda?status=agendado' };
  } },
  no_show_rate: { module: 'agenda', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int total, count(*) FILTER (WHERE status = 'falta')::int noshow, count(*) FILTER (WHERE status = 'cancelado')::int canc
                               FROM appointments WHERE company_id=$1 AND starts_at BETWEEN now() - interval '60 days' AND now()`, [ctx.companyId]);
    if (x.total < 10) return null;
    const rate = (x.noshow + x.canc) / x.total;
    if (rate < 0.1) return null;
    return { fingerprint: fp(Math.round(rate * 20)), priority: 3, title: 'Faltas e cancelamentos estão acima de 10%',
      reason: `Nos últimos 60 dias, ${x.noshow} faltas e ${x.canc} cancelamentos em ${x.total} agendamentos.`,
      action: 'Confirme os horários na véspera e combine uma política de remarcação com os clientes.', benefit: 'Mais horários aproveitados sem aumentar custos.',
      indicator: { label: 'Faltas + cancelamentos', value: pct(rate) }, resolveHref: '/app/agenda?status=agendado', detailsHref: '/app/relatorios?r=appointments_by_status' };
  } },
  idle_slots: { module: 'agenda', run: async (db, ctx) => {
    const hist = await one(db, `SELECT count(*)::int n FROM appointments WHERE company_id=$1 AND status IN ('concluido','confirmado','agendado') AND starts_at > now() - interval '56 days'`, [ctx.companyId]);
    if (hist.n < 8) return null;
    const free = await freeSlotsToday(db, ctx);
    const weak = await one(db, `SELECT extract(dow FROM starts_at AT TIME ZONE $2)::int dow, count(*)::int n FROM appointments
                                 WHERE company_id=$1 AND status IN ('concluido','confirmado','agendado') AND starts_at > now() - interval '56 days'
                                 GROUP BY 1 ORDER BY 2 ASC LIMIT 1`, [ctx.companyId, ctx.company.timezone]);
    if (!weak) return null;
    return { fingerprint: fp(weak.dow, free.slots > 8), priority: 5, title: 'Você possui horários livres durante a semana',
      reason: `Nas últimas 8 semanas, ${WEEKDAYS[weak.dow]} foi o dia com menos atendimentos (${weak.n}).${free.slots ? ` Hoje ainda há ${free.slots} intervalos livres de 30 min.` : ''}`,
      action: 'Avalie os períodos de menor procura e planeje ações de divulgação ou condições especiais para eles.', benefit: 'Melhor aproveitamento da agenda e da equipe.',
      indicator: { label: `Atendimentos às ${WEEKDAYS[weak.dow]}s (8 sem.)`, value: String(weak.n) }, resolveHref: '/app/agenda?view=semana', detailsHref: '/app/relatorios?r=appointments_by_status' };
  } },
  top_services_cost: { module: 'servicos', run: async (db, ctx) => {
    if (!canDo(ctx.role, 'viewCosts')) return null;
    const x = await one(db, `SELECT sv.name, sum(i.total) total, sv.estimated_cost, sv.price FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN services sv ON sv.id = i.service_id
                              WHERE i.company_id=$1 AND s.status='concluida' AND s.sold_at > now() - interval '90 days' GROUP BY sv.id ORDER BY 2 DESC LIMIT 1`, [ctx.companyId]);
    if (!x) return null;
    if (Number(x.estimated_cost) === 0) {
      return { fingerprint: fp(x.name, 'sem-custo'), priority: 4, title: `Informe o custo de materiais do serviço "${x.name}"`,
        reason: `"${x.name}" é o serviço que mais faturou nos últimos 90 dias, mas está sem custo estimado cadastrado.`,
        action: 'Confira os materiais usados em cada atendimento e registre o custo médio no cadastro do serviço.', benefit: 'Margem real por serviço e preços mais seguros.',
        indicator: { label: 'Faturamento em 90 dias', value: brl(x.total) }, resolveHref: '/app/servicos', detailsHref: '/app/relatorios?r=top_services' };
    }
    const margin = (x.price - x.estimated_cost) / (x.price || 1);
    return { fingerprint: fp(x.name, Math.round(margin * 10)), priority: 7, title: 'Confira os serviços com maior faturamento e compare os custos',
      reason: `"${x.name}" lidera o faturamento (${brl(x.total)} em 90 dias) com margem estimada de ${pct(margin)} sobre o preço.`,
      action: 'Compare o custo de materiais dos serviços mais vendidos e revise preços se necessário.', benefit: 'Foco nos serviços mais rentáveis.',
      indicator: { label: 'Margem estimada', value: pct(margin) }, resolveHref: '/app/servicos', detailsHref: '/app/relatorios?r=top_services' };
  } },
  inactive_customers: { module: 'clientes', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n FROM customers c WHERE c.company_id=$1 AND c.archived_at IS NULL AND
        greatest((SELECT max(sold_at) FROM sales s WHERE s.company_id=c.company_id AND s.customer_id=c.id AND s.status='concluida'),
                 (SELECT max(starts_at) FROM appointments a WHERE a.company_id=c.company_id AND a.customer_id=c.id AND a.status='concluido')) < now() - interval '90 days'`, [ctx.companyId]);
    if (x.n < 3) return null;
    return { fingerprint: fp(Math.floor(x.n / 5)), priority: 6, title: `${x.n} clientes não voltam há mais de 90 dias`,
      reason: 'São clientes que já compraram ou foram atendidos, mas não retornaram nos últimos 3 meses.',
      action: 'Use a área de Fidelização para entrar em contato e registrar os retornos.', benefit: 'Recuperar clientes costuma custar menos que conquistar novos.',
      indicator: { label: 'Clientes inativos', value: String(x.n) }, resolveHref: '/app/fidelizacao', detailsHref: '/app/clientes?inactive=1' };
  } },
  low_stock: { module: 'estoque', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n, string_agg(name, ', ') FILTER (WHERE rn <= 3) names FROM (SELECT name, row_number() OVER (ORDER BY stock_qty - min_stock) rn
                               FROM products WHERE company_id=$1 AND archived_at IS NULL AND active AND min_stock > 0 AND stock_qty <= min_stock) s`, [ctx.companyId]);
    if (!x.n) return null;
    return { fingerprint: fp(x.n, x.names), priority: 2, title: 'Alguns produtos estão abaixo do estoque mínimo',
      reason: `${x.n} produto${x.n > 1 ? 's' : ''} no limite ou abaixo do mínimo: ${x.names}${x.n > 3 ? '…' : ''}.`,
      action: 'Revise a necessidade de reposição antes de realizar novos pedidos.', benefit: 'Evita perder vendas por falta de produto.',
      indicator: { label: 'Abaixo do mínimo', value: String(x.n) }, resolveHref: '/app/estoque?status=low', detailsHref: '/app/relatorios?r=low_stock' };
  } },
  out_of_stock: { module: 'estoque', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n FROM products p WHERE company_id=$1 AND archived_at IS NULL AND active AND stock_qty <= 0
                               AND EXISTS (SELECT 1 FROM stock_movements m WHERE m.company_id = p.company_id AND m.product_id = p.id AND m.type = 'venda' AND m.created_at > now() - interval '60 days')`, [ctx.companyId]);
    if (!x.n) return null;
    return { fingerprint: fp(x.n), priority: 1, title: 'Produtos com saída recente estão em falta',
      reason: `${x.n} produto${x.n > 1 ? 's' : ''} vendido${x.n > 1 ? 's' : ''} nos últimos 60 dias está${x.n > 1 ? 'ão' : ''} com estoque zerado.`,
      action: 'Priorize a reposição desses itens com o fornecedor.', benefit: 'Evitar rupturas de estoque e vendas perdidas.',
      indicator: { label: 'Em falta', value: String(x.n) }, resolveHref: '/app/estoque?status=out' };
  } },
  stale_products: { module: 'estoque', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n, coalesce(sum(stock_qty * cost_price),0) v FROM products p WHERE company_id=$1 AND archived_at IS NULL AND active AND stock_qty > 0 AND created_at < now() - interval '60 days'
                               AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.company_id = p.company_id AND m.product_id = p.id AND m.type = 'venda' AND m.created_at > now() - interval '60 days')`, [ctx.companyId]);
    const sales = await one(db, `SELECT count(*)::int n FROM sales WHERE company_id=$1`, [ctx.companyId]);
    if (x.n < 1 || sales.n < 5) return null;
    return { fingerprint: fp(x.n), priority: 6, title: 'Analise os produtos que estão parados',
      reason: `${x.n} produto${x.n > 1 ? 's' : ''} com estoque não teve${x.n > 1 ? 'ram' : ''} nenhuma venda nos últimos 60 dias.`,
      action: 'Avalie promoções, kits ou suspender novas compras desses itens.', benefit: 'Libera capital de giro e espaço.',
      indicator: canDo(ctx.role, 'viewCosts') ? { label: 'Valor parado (custo)', value: brl(x.v) } : { label: 'Produtos parados', value: String(x.n) },
      resolveHref: '/app/relatorios?r=stale_products' };
  } },
  top_products_trend: { module: 'vendas', run: async (db, ctx) => {
    const x = await one(db, `SELECT p.name, sum(i.quantity) FILTER (WHERE s.sold_at > now() - interval '30 days') cur,
                                    sum(i.quantity) FILTER (WHERE s.sold_at BETWEEN now() - interval '60 days' AND now() - interval '30 days') prev, p.stock_qty, p.unit
                               FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN products p ON p.id = i.product_id
                              WHERE i.company_id=$1 AND s.status='concluida' AND s.sold_at > now() - interval '60 days'
                              GROUP BY p.id HAVING sum(i.quantity) FILTER (WHERE s.sold_at > now() - interval '30 days') > 0 ORDER BY 2 DESC LIMIT 1`, [ctx.companyId]);
    if (!x) return null;
    const growth = x.prev > 0 ? (x.cur - x.prev) / x.prev : null;
    return { fingerprint: fp(x.name, Math.round(x.cur)), priority: 7, title: `"${x.name}" é o produto mais procurado do mês`,
      reason: `Foram ${Number(x.cur).toLocaleString('pt-BR')} ${x.unit} vendidos nos últimos 30 dias${growth !== null ? ` (${growth >= 0 ? '+' : ''}${pct(growth)} vs. 30 dias anteriores)` : ''}. Estoque atual: ${Number(x.stock_qty).toLocaleString('pt-BR')}.`,
      action: 'Compare as vendas dos últimos meses e garanta estoque dos itens de maior procura.', benefit: 'Menos vendas perdidas nos itens que mais giram.',
      indicator: { label: 'Vendidos (30 dias)', value: Number(x.cur).toLocaleString('pt-BR') }, resolveHref: '/app/relatorios?r=top_products' };
  } },
  margin_low: { module: 'vendas', run: async (db, ctx) => {
    if (!canDo(ctx.role, 'viewCosts')) return null;
    const x = await one(db, `SELECT coalesce(sum(total),0) t, coalesce(sum(cost_total),0) c, count(*)::int n FROM sales WHERE company_id=$1 AND status='concluida' AND sold_at > now() - interval '30 days'`, [ctx.companyId]);
    if (x.n < 5 || x.c <= 0) return null;
    const m = (x.t - x.c) / x.t;
    if (m >= 0.25) return null;
    return { fingerprint: fp(Math.round(m * 20)), priority: 3, title: 'A margem bruta das vendas está baixa',
      reason: `Nos últimos 30 dias, o custo estimado dos itens vendidos representou ${pct(x.c / x.t)} do valor das vendas.`,
      action: 'Revise preços, descontos concedidos e o custo de compra dos produtos mais vendidos.', benefit: 'Mais resultado por venda sem precisar vender mais.',
      indicator: { label: 'Margem bruta estimada', value: pct(m) }, resolveHref: '/app/relatorios?r=top_products' };
  } },
  expiring_products: { module: 'estoque', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n, count(*) FILTER (WHERE expiry_date < current_date)::int expired FROM products WHERE company_id=$1 AND archived_at IS NULL AND track_expiry AND stock_qty > 0 AND expiry_date <= current_date + 15`, [ctx.companyId]);
    if (!x.n) return null;
    return { fingerprint: fp(x.n, x.expired), priority: 1, title: 'Verifique os produtos próximos do vencimento',
      reason: `${x.n} produto${x.n > 1 ? 's' : ''} em estoque vence${x.n > 1 ? 'm' : ''} em até 15 dias${x.expired ? ` (${x.expired} já vencido${x.expired > 1 ? 's' : ''})` : ''}.`,
      action: 'Planeje o uso ou a venda desses itens de forma segura e registre como perda o que não puder ser aproveitado.', benefit: 'Menos desperdício e riscos ao cliente.',
      indicator: { label: 'Vencem em 15 dias', value: String(x.n) }, resolveHref: '/app/estoque?status=expiring' };
  } },
  waste_top_reason: { module: 'desperdicios', run: async (db, ctx) => {
    const x = await one(db, `SELECT reason, count(*)::int n, sum(total_cost) v, (SELECT count(*) FROM waste_records WHERE company_id=$1 AND occurred_on > current_date - 30)::int total
                               FROM waste_records WHERE company_id=$1 AND occurred_on > current_date - 30 GROUP BY reason ORDER BY 3 DESC LIMIT 1`, [ctx.companyId]);
    if (!x || x.total < 3) return null;
    const labels: Record<string, string> = { vencido: 'produtos vencidos', danificado: 'itens danificados', perdido: 'perdas/extravios', erro_preparo: 'erros de preparo', sobra: 'sobras', furto: 'furtos', outro: 'outros motivos' };
    return { fingerprint: fp(x.reason, Math.round(x.v)), priority: 3, title: 'Revise os itens com maior volume de desperdício',
      reason: `Nos últimos 30 dias, ${labels[x.reason]} foram o principal motivo de perda (${x.n} registros, ${brl(x.v)}).`,
      action: 'Investigue as causas desse motivo específico e combine uma ação com a equipe.', benefit: 'Redução direta de custos.',
      indicator: { label: 'Custo do principal motivo', value: brl(x.v) }, resolveHref: '/app/desperdicios', detailsHref: '/app/relatorios?r=waste_by_reason' };
  } },
  waste_vs_sales: { module: 'desperdicios', run: async (db, ctx) => {
    const x = await one(db, `SELECT (SELECT coalesce(sum(total_cost),0) FROM waste_records WHERE company_id=$1 AND occurred_on > current_date - 30) w,
                                    (SELECT coalesce(sum(total),0) FROM sales WHERE company_id=$1 AND status='concluida' AND sold_at > now() - interval '30 days') s`, [ctx.companyId]);
    if (x.s <= 0 || x.w <= 0 || x.w / x.s < 0.03) return null;
    return { fingerprint: fp(Math.round((x.w / x.s) * 100)), priority: 3, title: 'Compare o uso de insumos com o volume de vendas',
      reason: `As perdas registradas nos últimos 30 dias equivalem a ${pct(x.w / x.s)} do valor vendido no período.`,
      action: 'Ajuste a produção e as compras à saída real dos itens mais vendidos.', benefit: 'Menos sobras e compras mais certeiras.',
      indicator: { label: 'Perdas / vendas', value: pct(x.w / x.s) }, resolveHref: '/app/relatorios?r=waste_by_reason' };
  } },
  supplier_lead_time: { module: 'fornecedores', run: async (db, ctx) => {
    const x = await one(db, `SELECT p.name, s.name supplier, s.lead_time_days FROM products p JOIN suppliers s ON s.id = p.supplier_id
                              WHERE p.company_id=$1 AND p.archived_at IS NULL AND p.min_stock > 0 AND p.stock_qty <= p.min_stock AND s.lead_time_days > 0 ORDER BY s.lead_time_days DESC LIMIT 1`, [ctx.companyId]);
    if (!x) return null;
    return { fingerprint: fp(x.name, x.supplier), priority: 2, title: `Faça o pedido de "${x.name}" com antecedência`,
      reason: `O produto está abaixo do mínimo e o fornecedor ${x.supplier} leva em média ${x.lead_time_days} dias para entregar.`,
      action: 'Registre o pedido de compra agora para evitar ruptura.', benefit: 'Reposição antes de faltar.',
      indicator: { label: 'Prazo do fornecedor', value: `${x.lead_time_days} dias` }, resolveHref: '/app/fornecedores' };
  } },
  late_deliveries: { module: 'entregas', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*) FILTER (WHERE status NOT IN ('concluida','cancelada') AND scheduled_for < now())::int late,
                                    count(*) FILTER (WHERE status = 'concluida' AND delivered_at > scheduled_for AND delivered_at > now() - interval '30 days')::int done_late,
                                    count(*) FILTER (WHERE status = 'concluida' AND delivered_at > now() - interval '30 days')::int done
                               FROM deliveries WHERE company_id=$1`, [ctx.companyId]);
    if (!x.late && (x.done < 5 || x.done_late / x.done < 0.15)) return null;
    return { fingerprint: fp(x.late, x.done_late), priority: 2, title: 'Monitore os atrasos nas entregas',
      reason: x.late ? `${x.late} entrega${x.late > 1 ? 's' : ''} já passou${x.late > 1 ? 'ram' : ''} do horário previsto.` : `${x.done_late} de ${x.done} entregas dos últimos 30 dias chegaram atrasadas.`,
      action: 'Avise os clientes, revise as rotas e redistribua entre os entregadores.', benefit: 'Clientes mais satisfeitos e menos reclamações.',
      indicator: { label: 'Atrasadas agora', value: String(x.late) }, resolveHref: '/app/entregas?late=1', detailsHref: '/app/relatorios?r=pending_deliveries' };
  } },
  delivery_cost: { module: 'entregas', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n, coalesce(avg(cost),0) cost, coalesce(avg(fee),0) fee FROM deliveries WHERE company_id=$1 AND status='concluida' AND delivered_at > now() - interval '30 days'`, [ctx.companyId]);
    if (x.n < 5 || x.cost <= 0) return null;
    if (x.fee >= x.cost) return { fingerprint: fp('ok', Math.round(x.cost)), priority: 8, title: 'Acompanhe os custos por entrega',
      reason: `Custo médio de ${brl(x.cost)} por entrega e taxa média cobrada de ${brl(x.fee)} nos últimos 30 dias.`,
      action: 'Organize rotas por região para reduzir o custo por entrega.', benefit: 'Mais margem em cada entrega.', indicator: { label: 'Custo médio', value: brl(x.cost) }, resolveHref: '/app/entregas' };
    return { fingerprint: fp('loss', Math.round(x.cost)), priority: 2, title: 'O custo das entregas está maior que a taxa cobrada',
      reason: `Nos últimos 30 dias, cada entrega custou em média ${brl(x.cost)}, mas a taxa média cobrada foi ${brl(x.fee)}.`,
      action: 'Revise a tabela de frete por distância e agrupe entregas da mesma região.', benefit: 'Entregas deixam de gerar prejuízo.',
      indicator: { label: 'Diferença média', value: brl(x.cost - x.fee) }, resolveHref: '/app/entregas' };
  } },
  late_work_orders: { module: 'ordens_servico', run: async (db, ctx, today) => {
    const x = await one(db, `SELECT count(*)::int n FROM work_orders WHERE company_id=$1 AND status IN ('aberta','em_andamento','aguardando_pecas') AND due_date < $2`, [ctx.companyId, today]);
    if (!x.n) return null;
    return { fingerprint: fp(x.n), priority: 2, title: 'Acompanhe os prazos das ordens de serviço',
      reason: `${x.n} OS está${x.n > 1 ? 'ão' : ''} com o prazo de entrega vencido.`,
      action: 'Atualize a previsão com o cliente e verifique se faltam peças.', benefit: 'Confiança do cliente e menos retrabalho no atendimento.',
      indicator: { label: 'OS atrasadas', value: String(x.n) }, resolveHref: '/app/ordens-servico?late=1' };
  } },
  pending_quotes: { module: 'orcamentos', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n, coalesce(sum(total),0) v FROM quotes WHERE company_id=$1 AND status='enviado' AND sent_at < now() - interval '3 days'`, [ctx.companyId]);
    if (!x.n) return null;
    return { fingerprint: fp(x.n, Math.round(x.v)), priority: 3, title: 'Existem orçamentos aguardando resposta',
      reason: `${x.n} orçamento${x.n > 1 ? 's' : ''} enviado${x.n > 1 ? 's' : ''} há mais de 3 dias sem resposta.`,
      action: 'Considere entrar em contato com os clientes para tirar dúvidas.', benefit: 'Mais propostas convertidas em vendas.',
      indicator: { label: 'Valor em aberto', value: brl(x.v) }, resolveHref: '/app/orcamentos?status=enviado' };
  } },
  hours_estimate: { module: 'ordens_servico', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n, avg(actual_hours / estimated_hours) ratio FROM work_orders
                              WHERE company_id=$1 AND estimated_hours > 0 AND actual_hours > 0 AND opened_on > current_date - 90`, [ctx.companyId]);
    if (x.n < 3 || Math.abs(x.ratio - 1) < 0.15) return null;
    const over = x.ratio > 1;
    return { fingerprint: fp(Math.round(x.ratio * 10)), priority: 4, title: 'Compare o tempo estimado e o tempo real dos serviços',
      reason: `Em ${x.n} serviços dos últimos 90 dias, o tempo real foi em média ${pct(Math.abs(x.ratio - 1))} ${over ? 'maior' : 'menor'} que o estimado.`,
      action: over ? 'Ajuste as horas estimadas nos próximos orçamentos.' : 'Seus orçamentos podem estar superestimando horas; revise para ficar mais competitivo.',
      benefit: 'Orçamentos mais precisos e prazos realistas.', indicator: { label: 'Real / estimado', value: `${x.ratio.toFixed(2).replace('.', ',')}x` }, resolveHref: '/app/ordens-servico' };
  } },
  vehicle_history: { module: 'veiculos', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n FROM work_orders WHERE company_id=$1 AND vehicle_id IS NULL AND opened_on > current_date - 60`, [ctx.companyId]);
    if (x.n < 3) return null;
    return { fingerprint: fp(x.n), priority: 8, title: 'Mantenha o histórico dos veículos',
      reason: `${x.n} ordens de serviço dos últimos 60 dias não estão vinculadas a um veículo.`,
      action: 'Cadastre os veículos e vincule-os às OS.', benefit: 'Histórico completo para revisões e garantia.', resolveHref: '/app/veiculos?novo=1' };
  } },
  preventive_due: { module: 'manutencao', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n, string_agg(name, ', ') names FROM equipment WHERE company_id=$1 AND archived_at IS NULL AND status <> 'desativado' AND next_preventive_on <= current_date + 7`, [ctx.companyId]);
    if (!x.n) return null;
    return { fingerprint: fp(x.names), priority: 4, title: 'Manutenção preventiva programada',
      reason: `${x.names} ${x.n > 1 ? 'têm' : 'tem'} manutenção preventiva prevista para os próximos 7 dias ou atrasada.`,
      action: 'Agende a manutenção para um horário de menor movimento.', benefit: 'Evita paradas inesperadas e reparos mais caros.', resolveHref: '/app/manutencao?preventive_due=1' };
  } },
  documents_expiring: { module: 'documentos', run: async (db, ctx) => {
    const restricted = canDo(ctx.role, 'restrictedDocuments') ? '' : 'AND NOT restricted';
    const x = await one(db, `SELECT count(*)::int n, string_agg(title, ', ') names FROM documents WHERE company_id=$1 AND archived_at IS NULL ${restricted} AND expires_on <= current_date + 30`, [ctx.companyId]);
    if (!x.n) return null;
    return { fingerprint: fp(x.names), priority: 2, title: 'Documentos vencidos ou perto do vencimento',
      reason: `${x.names} — vencido(s) ou vencendo em até 30 dias.`,
      action: 'Providencie a renovação e anexe a nova versão no sistema.', benefit: 'Evita multas e problemas com fiscalização.', resolveHref: '/app/documentos?expiring=1' };
  } },
  open_complaints: { module: 'avaliacoes', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n, count(*) FILTER (WHERE responsible_id IS NULL)::int noresp FROM feedbacks WHERE company_id=$1 AND type='reclamacao' AND status IN ('aberta','em_analise')`, [ctx.companyId]);
    if (!x.n) return null;
    return { fingerprint: fp(x.n, x.noresp), priority: 3, title: 'Responda às reclamações em aberto',
      reason: `${x.n} reclamação(ões) ainda sem solução${x.noresp ? `, ${x.noresp} sem responsável definido` : ''}.`,
      action: 'Defina um responsável e um prazo, e registre as providências tomadas.', benefit: 'Clientes atendidos rapidamente tendem a continuar comprando.', resolveHref: '/app/avaliacoes?type=reclamacao' };
  } },
  pending_swaps: { module: 'escalas', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n FROM shift_swap_requests WHERE company_id=$1 AND status='pendente'`, [ctx.companyId]);
    if (!x.n) return null;
    return { fingerprint: fp(x.n), priority: 5, title: 'Pedidos de troca de turno aguardando decisão',
      reason: `${x.n} solicitação(ões) de troca pendente(s).`, action: 'Aprove ou recuse para que a equipe se organize.', benefit: 'Escala clara e menos faltas.', resolveHref: '/app/escalas' };
  } },
  overdue_tasks: { module: 'tarefas', run: async (db, ctx, today) => {
    const x = await one(db, `SELECT count(*)::int n, count(*) FILTER (WHERE assignee_id IS NULL)::int noone FROM tasks WHERE company_id=$1 AND status <> 'concluida' AND due_date < $2`, [ctx.companyId, today]);
    if (!x.n) return null;
    return { fingerprint: fp(x.n), priority: 4, title: 'Há tarefas com prazo vencido',
      reason: `${x.n} tarefa(s) passaram do prazo${x.noone ? `, ${x.noone} sem responsável` : ''}.`,
      action: 'Reavalie prazos, defina responsáveis e marque as bloqueadas.', benefit: 'Equipe focada no que realmente importa.', resolveHref: '/app/tarefas?overdue=1' };
  } },
  pet_returns: { module: 'animais', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n FROM pets p WHERE p.company_id=$1 AND p.archived_at IS NULL AND p.next_return BETWEEN current_date - 14 AND current_date + 7
                               AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.company_id = p.company_id AND a.pet_id = p.id AND a.starts_at > now() - interval '1 day' AND a.status IN ('agendado','confirmado'))`, [ctx.companyId]);
    if (!x.n) return null;
    return { fingerprint: fp(x.n), priority: 3, title: 'Planeje os retornos dos animais',
      reason: `${x.n} animal(is) com retorno previsto para esta semana (ou recém-vencido) ainda sem agendamento.`,
      action: 'Entre em contato com os tutores e agende o próximo atendimento.', benefit: 'Agenda mais cheia e clientes fiéis.', resolveHref: '/app/animais?returns_due=1' };
  } },
  // regras de ausência de dados: só aparecem quando o módulo prioritário está vazio
  no_services: { module: 'servicos', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n FROM services WHERE company_id=$1 AND archived_at IS NULL`, [ctx.companyId]);
    if (x.n) return null;
    return { fingerprint: 'vazio', priority: 9, title: 'Cadastre os serviços que você oferece',
      reason: 'Nenhum serviço cadastrado. A agenda e os relatórios de faturamento por serviço dependem desse cadastro.',
      action: 'Cadastre seus serviços com preço e duração média.', benefit: 'Agendamentos mais rápidos e relatórios por serviço.', resolveHref: '/app/servicos?novo=1' };
  } },
  no_products: { module: 'estoque', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n FROM products WHERE company_id=$1 AND archived_at IS NULL`, [ctx.companyId]);
    if (x.n) return null;
    return { fingerprint: 'vazio', priority: 9, title: 'Cadastre seus produtos com estoque mínimo',
      reason: 'Nenhum produto cadastrado. Sem o cadastro, o sistema não consegue avisar sobre falta de estoque.',
      action: 'Cadastre os principais produtos, preços de compra e venda e estoque mínimo.', benefit: 'Alertas automáticos de reposição e margem por venda.', resolveHref: '/app/estoque?novo=1' };
  } },
  no_sales: { module: 'vendas', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n FROM sales WHERE company_id=$1`, [ctx.companyId]);
    if (x.n) return null;
    return { fingerprint: 'vazio', priority: 9, title: 'Registre suas vendas no sistema',
      reason: 'Nenhuma venda registrada até agora. Indicadores de faturamento, estoque e produtos mais vendidos dependem disso.',
      action: 'Use "Registrar venda" a cada venda realizada.', benefit: 'Estoque e financeiro atualizados automaticamente.', resolveHref: '/app/vendas/nova' };
  } },
  no_finance_records: { module: 'financeiro', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n FROM financial_transactions WHERE company_id=$1 AND created_at > now() - interval '30 days'`, [ctx.companyId]);
    if (x.n) return null;
    return { fingerprint: 'vazio', priority: 9, title: 'Registre receitas e despesas',
      reason: 'Nenhum lançamento financeiro nos últimos 30 dias. Sem eles, não é possível estimar o resultado do mês.',
      action: 'Lance as despesas fixas (aluguel, contas) e as receitas do período.', benefit: 'Saber quanto entra, quanto sai e quanto sobra.', resolveHref: '/app/financeiro?novo=despesa' };
  } },
  no_work_orders: { module: 'ordens_servico', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n FROM work_orders WHERE company_id=$1`, [ctx.companyId]);
    if (x.n) return null;
    return { fingerprint: 'vazio', priority: 9, title: 'Abra uma ordem de serviço para cada atendimento',
      reason: 'Nenhuma OS registrada ainda.', action: 'Use "Abrir ordem de serviço" ao receber um equipamento ou veículo.', benefit: 'Prazos, peças e valores organizados por serviço.', resolveHref: '/app/ordens-servico/nova' };
  } },
  no_quotes: { module: 'orcamentos', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n FROM quotes WHERE company_id=$1`, [ctx.companyId]);
    if (x.n) return null;
    return { fingerprint: 'vazio', priority: 9, title: 'Crie seus orçamentos pelo sistema',
      reason: 'Nenhum orçamento registrado. Pelo sistema você acompanha quais foram aprovados e converte em venda ou OS.',
      action: 'Crie um orçamento detalhando materiais e mão de obra.', benefit: 'Controle de propostas e taxa de aprovação.', resolveHref: '/app/orcamentos/novo' };
  } },
  no_deliveries: { module: 'entregas', run: async (db, ctx) => {
    const x = await one(db, `SELECT count(*)::int n FROM deliveries WHERE company_id=$1`, [ctx.companyId]);
    if (x.n) return null;
    return { fingerprint: 'vazio', priority: 9, title: 'Registre as entregas com custo e prazo',
      reason: 'Nenhuma entrega registrada ainda.', action: 'Cadastre cada entrega com horário previsto, entregador e custo.', benefit: 'Controle de atrasos e custo por entrega.', resolveHref: '/app/entregas?novo=1' };
  } },
};

// regras sempre avaliadas (além das do segmento) por envolverem perdas ou prazos
const UNIVERSAL = ['overdue_receivables', 'overdue_payables', 'expiring_products', 'documents_expiring', 'overdue_tasks', 'open_complaints'];

// dicas iniciais ligadas às dificuldades declaradas no cadastro
const DIFFICULTY_STARTERS: Record<string, StarterTip> = {
  controle_financeiro: { title: 'Separe as finanças pessoais das da empresa', reason: 'Você indicou dificuldade em saber quanto entra e sai.', action: 'Lance todas as receitas e despesas da empresa no Financeiro, inclusive o pró-labore.', benefit: 'Resultado do mês confiável.', module: 'financeiro' },
  cobrancas_atrasadas: { title: 'Defina datas de vencimento em toda venda a prazo', reason: 'Você indicou atrasos de pagamento.', action: 'Use a forma "A prazo" com vencimento e acompanhe em Contas a receber.', benefit: 'Atrasos identificados no primeiro dia.', module: 'cobrancas' },
  precificacao: { title: 'Calcule o preço a partir do custo', reason: 'Você indicou dificuldade em definir preços.', action: 'Informe custos nos produtos, serviços e itens de orçamento; o sistema estima a margem.', benefit: 'Preços que cobrem os custos.', module: 'orcamentos' },
  falta_tempo: { title: 'Use as ações rápidas do painel', reason: 'Você indicou falta de tempo para administrar.', action: 'Registre vendas, agendamentos e despesas direto do painel inicial.', benefit: 'Rotina administrativa em poucos minutos.', module: 'dashboard' },
  gestao_equipe: { title: 'Monte a escala da semana com antecedência', reason: 'Você indicou dificuldade em organizar a equipe.', action: 'Cadastre turnos e folgas em Escalas e copie a semana anterior.', benefit: 'Menos conflitos de horário.', module: 'escalas' },
  fidelizacao: { title: 'Contate clientes que não voltam', reason: 'Você indicou que clientes não retornam.', action: 'Veja a lista de clientes inativos em Fidelização e registre os contatos.', benefit: 'Mais retornos.', module: 'fidelizacao' },
  documentos: { title: 'Cadastre alvarás e licenças com vencimento', reason: 'Você indicou dificuldade com documentos e prazos.', action: 'Cadastre cada documento com data de vencimento em Documentos.', benefit: 'Alertas antes de vencer.', module: 'documentos' },
};

export async function computeTips(db: Db, ctx: Ctx, segment: SegmentConfig, opts: { includeHidden?: boolean } = {}) {
  const { today } = await refDates(db, ctx);
  const keys = [...new Set([...segment.tips, ...UNIVERSAL])].filter((k) => RULES[k] && can(ctx.role, RULES[k].module, 'read'));
  const tips: Tip[] = [];
  for (const [idx, key] of keys.entries()) {
    const r = await RULES[key].run(db, ctx, today);
    if (r) tips.push({ ...r, key, kind: r.fingerprint === 'vazio' ? 'inicial' : 'dados', module: RULES[key].module, priority: r.priority * 100 + idx });
  }
  const states = (await db.query(
    `SELECT DISTINCT ON (tip_key) tip_key, fingerprint, status, created_at FROM tip_states WHERE company_id = $1 ORDER BY tip_key, created_at DESC`, [ctx.companyId])).rows;
  const stateOf = new Map(states.map((s) => [s.tip_key, s]));
  const hidden = (t: Tip) => {
    const s = stateOf.get(t.key);
    if (!s) return false;
    if (s.fingerprint === t.fingerprint) return true; // mesma situação já tratada/dispensada
    // dispensada recentemente: não repetir por 14 dias mesmo que os números mudem
    return s.status === 'dispensada' && Date.now() - new Date(s.created_at).getTime() < 14 * 86400000;
  };
  let visible = tips.filter((t) => opts.includeHidden || !hidden(t));

  // Sugestões iniciais quando há poucas dicas baseadas em dados
  const dataTips = visible.filter((t) => t.kind === 'dados').length;
  if (dataTips < 3) {
    const company = ctx.company as any;
    const starters: StarterTip[] = [
      ...(company.difficulties ?? []).map((d: string) => DIFFICULTY_STARTERS[d]).filter(Boolean),
      ...segment.starterTips,
    ];
    starters.forEach((s, i) => {
      const key = `inicial:${fp(s.title)}`;
      const t: Tip = { key, fingerprint: 'inicial', kind: 'inicial', priority: 1000 + i, module: s.module ?? 'dashboard', title: s.title, reason: s.reason, action: s.action, benefit: s.benefit,
        resolveHref: s.module ? undefined : undefined };
      if (!opts.includeHidden && stateOf.has(key)) return;
      if (s.module && !can(ctx.role, s.module, 'read')) return;
      if (!visible.some((v) => v.title === t.title)) visible.push(t);
    });
  }
  visible = visible.sort((a, b) => a.priority - b.priority);
  return visible;
}
