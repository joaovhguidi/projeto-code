import { canDo, type ReportKey } from '@nexo/shared';
import type { Db } from '../db/pool';
import type { Ctx } from '../middleware/auth';

export interface Column { key: string; label: string; format?: 'currency' | 'number' | 'percent' | 'date' | 'datetime' | 'text' }
export interface ReportResult {
  from: string; to: string;
  columns: Column[];
  rows: Record<string, unknown>[];
  summary?: { label: string; value: number; format: Column['format'] }[];
  chart?: { type: 'bar' | 'line' | 'pie' | 'hbar'; x: string; series: { key: string; label: string }[] };
  note?: string;
}

/** Relatórios calculados exclusivamente a partir dos dados registrados. */
export async function runReport(db: Db, ctx: Ctx, key: ReportKey, from: string, to: string, group?: string): Promise<ReportResult> {
  const C = ctx.companyId, tz = ctx.company.timezone;
  const q = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows;
  const base = { from, to };
  const costs = canDo(ctx.role, 'viewCosts');
  switch (key) {
    case 'sales_by_period': {
      const unit = group === 'mes' ? 'month' : group === 'semana' ? 'week' : 'day';
      const rows = await q(
        `SELECT to_char(date_trunc('${unit}', s.sold_at AT TIME ZONE $2), 'YYYY-MM-DD') AS period, count(*)::int AS count, sum(s.total) AS total,
                sum(s.discount) AS discount, round(avg(s.total), 2) AS avg_ticket ${costs ? ', sum(s.total - s.cost_total) AS gross_margin' : ''}
           FROM sales s WHERE s.company_id = $1 AND s.status = 'concluida' AND (s.sold_at AT TIME ZONE $2)::date BETWEEN $3 AND $4
          GROUP BY 1 ORDER BY 1`, [C, tz, from, to]);
      const total = rows.reduce((s, r) => s + Number(r.total), 0), count = rows.reduce((s, r) => s + r.count, 0);
      const byMethod = await q(`SELECT payment_method, count(*)::int n, sum(total) total FROM sales WHERE company_id=$1 AND status='concluida' AND (sold_at AT TIME ZONE $2)::date BETWEEN $3 AND $4 GROUP BY 1 ORDER BY 3 DESC`, [C, tz, from, to]);
      return { ...base,
        columns: [{ key: 'period', label: unit === 'month' ? 'Mês' : unit === 'week' ? 'Semana de' : 'Dia', format: 'date' }, { key: 'count', label: 'Vendas', format: 'number' },
          { key: 'total', label: 'Total', format: 'currency' }, { key: 'discount', label: 'Descontos', format: 'currency' }, { key: 'avg_ticket', label: 'Ticket médio', format: 'currency' },
          ...(costs ? [{ key: 'gross_margin', label: 'Margem bruta est.', format: 'currency' as const }] : [])],
        rows, chart: { type: 'bar', x: 'period', series: [{ key: 'total', label: 'Total vendido' }] },
        summary: [{ label: 'Total vendido', value: total, format: 'currency' }, { label: 'Vendas', value: count, format: 'number' }, { label: 'Ticket médio', value: count ? total / count : 0, format: 'currency' },
          ...byMethod.slice(0, 3).map((m: any) => ({ label: `Em ${({ dinheiro: 'dinheiro', pix: 'Pix', cartao_debito: 'débito', cartao_credito: 'crédito', boleto: 'boleto', transferencia: 'transferência', a_prazo: 'a prazo', outro: 'outros' } as any)[m.payment_method]}`, value: Number(m.total), format: 'currency' as const }))],
      };
    }
    case 'revenue_expenses':
    case 'financial_result': {
      const rows = await q(
        `WITH m AS (SELECT generate_series(date_trunc('month', $2::date), date_trunc('month', $3::date), interval '1 month')::date AS m)
         SELECT to_char(m.m, 'YYYY-MM-DD') AS period,
                coalesce(sum(t.amount) FILTER (WHERE t.kind='receita'),0) AS revenue, coalesce(sum(t.amount) FILTER (WHERE t.kind='despesa'),0) AS expenses,
                coalesce(sum(t.amount) FILTER (WHERE t.kind='receita'),0) - coalesce(sum(t.amount) FILTER (WHERE t.kind='despesa'),0) AS result
           FROM m LEFT JOIN financial_transactions t ON t.company_id = $1 AND t.status <> 'cancelado' AND date_trunc('month', t.competence_date) = m.m AND t.competence_date BETWEEN $2 AND $3
          GROUP BY m.m ORDER BY m.m`, [C, from, to]);
      const cash = (await q(`SELECT coalesce(sum(p.amount) FILTER (WHERE t.kind='receita'),0) AS inflow, coalesce(sum(p.amount) FILTER (WHERE t.kind='despesa'),0) AS outflow
                               FROM transaction_payments p JOIN financial_transactions t ON t.id = p.transaction_id WHERE p.company_id=$1 AND p.reversed_at IS NULL AND p.paid_on BETWEEN $2 AND $3`, [C, from, to]))[0];
      const rev = rows.reduce((s, r) => s + Number(r.revenue), 0), exp = rows.reduce((s, r) => s + Number(r.expenses), 0);
      return { ...base,
        columns: [{ key: 'period', label: 'Mês', format: 'date' }, { key: 'revenue', label: 'Receitas', format: 'currency' }, { key: 'expenses', label: 'Despesas', format: 'currency' }, { key: 'result', label: 'Resultado estimado', format: 'currency' }],
        rows, chart: { type: 'bar', x: 'period', series: [{ key: 'revenue', label: 'Receitas' }, { key: 'expenses', label: 'Despesas' }] },
        summary: [{ label: 'Faturamento (receitas)', value: rev, format: 'currency' }, { label: 'Despesas', value: exp, format: 'currency' }, { label: 'Resultado estimado', value: rev - exp, format: 'currency' },
          { label: 'Entradas de caixa', value: Number(cash.inflow), format: 'currency' }, { label: 'Saídas de caixa', value: Number(cash.outflow), format: 'currency' }],
        note: 'Faturamento e resultado consideram a data de competência dos lançamentos. Entradas e saídas de caixa consideram as datas de pagamento. O resultado é uma estimativa gerencial, não um demonstrativo contábil.',
      };
    }
    case 'expenses_by_category': {
      const rows = await q(`SELECT coalesce(c.name, 'Sem categoria') AS category, count(*)::int AS count, sum(t.amount) AS total FROM financial_transactions t LEFT JOIN finance_categories c ON c.id = t.category_id
                             WHERE t.company_id=$1 AND t.kind='despesa' AND t.status <> 'cancelado' AND t.competence_date BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 3 DESC`, [C, from, to]);
      const total = rows.reduce((s, r) => s + Number(r.total), 0);
      rows.forEach((r) => (r.share = total ? Number(r.total) / total : 0));
      return { ...base, columns: [{ key: 'category', label: 'Categoria' }, { key: 'count', label: 'Lançamentos', format: 'number' }, { key: 'total', label: 'Total', format: 'currency' }, { key: 'share', label: 'Participação', format: 'percent' }],
        rows, chart: { type: 'pie', x: 'category', series: [{ key: 'total', label: 'Total' }] }, summary: [{ label: 'Total de despesas', value: total, format: 'currency' }] };
    }
    case 'top_products': {
      const rows = await q(`SELECT p.name, p.category, sum(i.quantity) AS quantity, sum(i.total) AS total ${costs ? ', sum(i.total - i.unit_cost * i.quantity) AS margin' : ''}, p.stock_qty
                              FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN products p ON p.id = i.product_id
                             WHERE i.company_id=$1 AND s.status='concluida' AND (s.sold_at AT TIME ZONE $2)::date BETWEEN $3 AND $4 GROUP BY p.id ORDER BY 3 DESC LIMIT 50`, [C, tz, from, to]);
      return { ...base, columns: [{ key: 'name', label: 'Produto' }, { key: 'category', label: 'Categoria' }, { key: 'quantity', label: 'Qtd. vendida', format: 'number' }, { key: 'total', label: 'Faturamento', format: 'currency' },
        ...(costs ? [{ key: 'margin', label: 'Margem bruta est.', format: 'currency' as const }] : []), { key: 'stock_qty', label: 'Estoque atual', format: 'number' }],
        rows, chart: { type: 'hbar', x: 'name', series: [{ key: 'quantity', label: 'Quantidade' }] } };
    }
    case 'stale_products': {
      const rows = await q(`SELECT p.name, p.category, p.stock_qty ${costs ? ', p.stock_qty * p.cost_price AS stock_value' : ''},
                                   (SELECT max(m.created_at) FROM stock_movements m WHERE m.company_id = p.company_id AND m.product_id = p.id AND m.type = 'venda') AS last_sale_at
                              FROM products p WHERE p.company_id=$1 AND p.archived_at IS NULL AND p.active AND p.stock_qty > 0
                               AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.company_id = p.company_id AND m.product_id = p.id AND m.type = 'venda' AND (m.created_at AT TIME ZONE $2)::date BETWEEN $3 AND $4)
                             ORDER BY ${costs ? '4' : '3'} DESC NULLS LAST LIMIT 100`, [C, tz, from, to]);
      return { ...base, columns: [{ key: 'name', label: 'Produto' }, { key: 'category', label: 'Categoria' }, { key: 'stock_qty', label: 'Em estoque', format: 'number' },
        ...(costs ? [{ key: 'stock_value', label: 'Valor parado (custo)', format: 'currency' as const }] : []), { key: 'last_sale_at', label: 'Última venda', format: 'datetime' }],
        rows, note: 'Produtos com estoque que não tiveram nenhuma venda no período selecionado.' };
    }
    case 'top_services': {
      const rows = await q(`SELECT coalesce(sv.name, i.description) AS name, count(*)::int AS count, sum(i.total) AS total, round(avg(i.unit_price), 2) AS avg_price
                              ${costs ? ', sum(i.total - i.unit_cost * i.quantity) AS margin' : ''}
                              FROM sale_items i JOIN sales s ON s.id = i.sale_id LEFT JOIN services sv ON sv.id = i.service_id
                             WHERE i.company_id=$1 AND s.status='concluida' AND i.product_id IS NULL AND (s.sold_at AT TIME ZONE $2)::date BETWEEN $3 AND $4 GROUP BY 1 ORDER BY 3 DESC LIMIT 50`, [C, tz, from, to]);
      const appts = await q(`SELECT coalesce(sv.name, 'Sem serviço') AS name, count(*)::int AS n FROM appointments a LEFT JOIN services sv ON sv.id = a.service_id
                              WHERE a.company_id=$1 AND a.status IN ('agendado','confirmado','concluido') AND (a.starts_at AT TIME ZONE $2)::date BETWEEN $3 AND $4 GROUP BY 1`, [C, tz, from, to]);
      const map = new Map(appts.map((a: any) => [a.name, a.n]));
      rows.forEach((r) => (r.appointments = map.get(r.name) ?? 0));
      return { ...base, columns: [{ key: 'name', label: 'Serviço' }, { key: 'count', label: 'Vendas', format: 'number' }, { key: 'appointments', label: 'Agendamentos', format: 'number' },
        { key: 'total', label: 'Faturamento', format: 'currency' }, { key: 'avg_price', label: 'Preço médio', format: 'currency' }, ...(costs ? [{ key: 'margin', label: 'Margem est.', format: 'currency' as const }] : [])],
        rows, chart: { type: 'hbar', x: 'name', series: [{ key: 'total', label: 'Faturamento' }] } };
    }
    case 'recurring_customers': {
      const rows = await q(`WITH act AS (
          SELECT customer_id, sold_at AS at, total FROM sales WHERE company_id=$1 AND status='concluida' AND customer_id IS NOT NULL AND (sold_at AT TIME ZONE $2)::date BETWEEN $3 AND $4
          UNION ALL SELECT customer_id, starts_at, 0 FROM appointments WHERE company_id=$1 AND status='concluido' AND sale_id IS NULL AND customer_id IS NOT NULL AND (starts_at AT TIME ZONE $2)::date BETWEEN $3 AND $4)
        SELECT c.name, c.phone, count(*)::int AS visits, sum(a.total) AS total, max(a.at) AS last_at
          FROM act a JOIN customers c ON c.id = a.customer_id GROUP BY c.id HAVING count(*) >= 2 ORDER BY 3 DESC, 4 DESC LIMIT 100`, [C, tz, from, to]);
      const all = (await q(`SELECT count(DISTINCT customer_id)::int n FROM (
          SELECT customer_id FROM sales WHERE company_id=$1 AND status='concluida' AND customer_id IS NOT NULL AND (sold_at AT TIME ZONE $2)::date BETWEEN $3 AND $4
          UNION ALL SELECT customer_id FROM appointments WHERE company_id=$1 AND status='concluido' AND customer_id IS NOT NULL AND (starts_at AT TIME ZONE $2)::date BETWEEN $3 AND $4) x`, [C, tz, from, to]))[0].n;
      return { ...base, columns: [{ key: 'name', label: 'Cliente' }, { key: 'phone', label: 'Telefone' }, { key: 'visits', label: 'Compras/atendimentos', format: 'number' }, { key: 'total', label: 'Total gasto', format: 'currency' }, { key: 'last_at', label: 'Último', format: 'datetime' }],
        rows, summary: [{ label: 'Clientes atendidos', value: all, format: 'number' }, { label: 'Recorrentes (2+)', value: rows.length, format: 'number' }, { label: 'Taxa de recorrência', value: all ? rows.length / all : 0, format: 'percent' }] };
    }
    case 'low_stock': {
      const rows = await q(`SELECT p.name, p.category, p.stock_qty, p.min_stock, p.unit, s.name AS supplier, s.lead_time_days,
                                   greatest(p.min_stock * 2 - p.stock_qty, 0) AS suggested
                              FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.company_id=$1 AND p.archived_at IS NULL AND p.active AND p.min_stock > 0 AND p.stock_qty <= p.min_stock
                             ORDER BY p.stock_qty - p.min_stock`, [C]);
      return { ...base, columns: [{ key: 'name', label: 'Produto' }, { key: 'category', label: 'Categoria' }, { key: 'stock_qty', label: 'Estoque', format: 'number' }, { key: 'min_stock', label: 'Mínimo', format: 'number' },
        { key: 'suggested', label: 'Sugestão de compra', format: 'number' }, { key: 'supplier', label: 'Fornecedor' }, { key: 'lead_time_days', label: 'Prazo (dias)', format: 'number' }],
        rows, note: 'Situação atual (não depende do período). A sugestão de compra repõe até o dobro do estoque mínimo; ajuste conforme sua realidade.' };
    }
    case 'overdue_tasks': {
      const rows = await q(`SELECT t.title, t.priority, t.status, t.due_date, e.name AS assignee, ((now() AT TIME ZONE $2)::date - t.due_date) AS days_late
                              FROM tasks t LEFT JOIN employees e ON e.id = t.assignee_id WHERE t.company_id=$1 AND t.status <> 'concluida' AND t.due_date < (now() AT TIME ZONE $2)::date ORDER BY t.due_date`, [C, tz]);
      const byPerson = await q(`SELECT coalesce(e.name, 'Sem responsável') AS name, count(*)::int AS total FROM tasks t LEFT JOIN employees e ON e.id = t.assignee_id
                                 WHERE t.company_id=$1 AND t.status <> 'concluida' AND t.due_date < (now() AT TIME ZONE $2)::date GROUP BY 1 ORDER BY 2 DESC`, [C, tz]);
      return { ...base, columns: [{ key: 'title', label: 'Tarefa' }, { key: 'assignee', label: 'Responsável' }, { key: 'priority', label: 'Prioridade' }, { key: 'status', label: 'Situação' }, { key: 'due_date', label: 'Prazo', format: 'date' }, { key: 'days_late', label: 'Dias de atraso', format: 'number' }],
        rows, summary: byPerson.map((p: any) => ({ label: p.name, value: p.total, format: 'number' as const })), note: 'Situação atual das tarefas (não depende do período).' };
    }
    case 'pending_deliveries': {
      const rows = await q(`SELECT d.number, d.recipient_name, d.neighborhood, d.scheduled_for, d.status, e.name AS courier, d.delivered_at,
                                   CASE WHEN d.status = 'concluida' THEN d.delivered_at > d.scheduled_for ELSE d.scheduled_for < now() END AS late
                              FROM deliveries d LEFT JOIN employees e ON e.id = d.courier_id
                             WHERE d.company_id=$1 AND (d.status NOT IN ('concluida','cancelada') OR (d.scheduled_for AT TIME ZONE $2)::date BETWEEN $3 AND $4) ORDER BY d.scheduled_for DESC LIMIT 300`, [C, tz, from, to]);
      const done = rows.filter((r) => r.status === 'concluida');
      return { ...base, columns: [{ key: 'number', label: 'Nº', format: 'number' }, { key: 'recipient_name', label: 'Destinatário' }, { key: 'neighborhood', label: 'Bairro' }, { key: 'scheduled_for', label: 'Previsto', format: 'datetime' },
        { key: 'status', label: 'Situação' }, { key: 'courier', label: 'Entregador' }, { key: 'delivered_at', label: 'Entregue em', format: 'datetime' }],
        rows, summary: [{ label: 'Pendentes', value: rows.filter((r) => !['concluida', 'cancelada'].includes(r.status)).length, format: 'number' },
          { label: 'Concluídas no período', value: done.length, format: 'number' }, { label: 'Concluídas com atraso', value: done.filter((r) => r.late).length, format: 'number' },
          { label: 'Pontualidade', value: done.length ? done.filter((r) => !r.late).length / done.length : 0, format: 'percent' }] };
    }
    case 'waste_by_reason': {
      const rows = await q(`SELECT reason, count(*)::int AS count, sum(quantity) AS quantity, sum(total_cost) AS total FROM waste_records WHERE company_id=$1 AND occurred_on BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 4 DESC`, [C, from, to]);
      const items = await q(`SELECT coalesce(p.name, w.description) AS name, sum(w.total_cost) AS total FROM waste_records w LEFT JOIN products p ON p.id = w.product_id WHERE w.company_id=$1 AND w.occurred_on BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, [C, from, to]);
      const total = rows.reduce((s, r) => s + Number(r.total), 0);
      return { ...base, columns: [{ key: 'reason', label: 'Motivo' }, { key: 'count', label: 'Registros', format: 'number' }, { key: 'quantity', label: 'Quantidade', format: 'number' }, { key: 'total', label: 'Impacto estimado', format: 'currency' }],
        rows, chart: { type: 'pie', x: 'reason', series: [{ key: 'total', label: 'Impacto' }] },
        summary: [{ label: 'Impacto financeiro estimado', value: total, format: 'currency' }, ...items.map((i: any) => ({ label: i.name, value: Number(i.total), format: 'currency' as const }))],
        note: 'Impacto calculado pela quantidade perdida × custo unitário registrado.' };
    }
    case 'appointments_by_status': {
      const rows = await q(`SELECT coalesce(e.name, 'Sem profissional') AS employee, count(*)::int AS total,
                                   count(*) FILTER (WHERE a.status='concluido')::int AS done, count(*) FILTER (WHERE a.status IN ('agendado','confirmado'))::int AS scheduled,
                                   count(*) FILTER (WHERE a.status='cancelado')::int AS canceled, count(*) FILTER (WHERE a.status='falta')::int AS no_show,
                                   coalesce(sum(a.price) FILTER (WHERE a.status='concluido'),0) AS revenue
                              FROM appointments a LEFT JOIN employees e ON e.id = a.employee_id
                             WHERE a.company_id=$1 AND (a.starts_at AT TIME ZONE $2)::date BETWEEN $3 AND $4 GROUP BY 1 ORDER BY 2 DESC`, [C, tz, from, to]);
      const tot = (k: string) => rows.reduce((s, r) => s + Number(r[k]), 0);
      return { ...base, columns: [{ key: 'employee', label: 'Profissional' }, { key: 'total', label: 'Total', format: 'number' }, { key: 'done', label: 'Concluídos', format: 'number' }, { key: 'scheduled', label: 'A realizar', format: 'number' },
        { key: 'canceled', label: 'Cancelados', format: 'number' }, { key: 'no_show', label: 'Faltas', format: 'number' }, { key: 'revenue', label: 'Valor concluído', format: 'currency' }],
        rows, chart: { type: 'bar', x: 'employee', series: [{ key: 'done', label: 'Concluídos' }, { key: 'canceled', label: 'Cancelados' }, { key: 'no_show', label: 'Faltas' }] },
        summary: [{ label: 'Agendamentos', value: tot('total'), format: 'number' }, { label: 'Concluídos', value: tot('done'), format: 'number' },
          { label: 'Taxa de faltas', value: tot('total') ? tot('no_show') / tot('total') : 0, format: 'percent' }, { label: 'Taxa de cancelamento', value: tot('total') ? tot('canceled') / tot('total') : 0, format: 'percent' }] };
    }
    case 'receivables_aging': {
      const rows = await q(`SELECT coalesce(c.name, 'Sem cliente') AS customer, t.description, t.due_date, t.amount, t.amount_paid, (t.amount - t.amount_paid) AS balance,
                                   greatest((now() AT TIME ZONE $2)::date - t.due_date, 0) AS days_late
                              FROM financial_transactions t LEFT JOIN customers c ON c.id = t.customer_id
                             WHERE t.company_id=$1 AND t.kind='receita' AND t.status IN ('pendente','parcial') ORDER BY t.due_date`, [C, tz]);
      const bucket = (min: number, max: number) => rows.filter((r) => r.days_late >= min && r.days_late <= max).reduce((s, r) => s + Number(r.balance), 0);
      return { ...base, columns: [{ key: 'customer', label: 'Cliente' }, { key: 'description', label: 'Descrição' }, { key: 'due_date', label: 'Vencimento', format: 'date' },
        { key: 'amount', label: 'Valor', format: 'currency' }, { key: 'amount_paid', label: 'Pago', format: 'currency' }, { key: 'balance', label: 'Em aberto', format: 'currency' }, { key: 'days_late', label: 'Dias de atraso', format: 'number' }],
        rows, summary: [{ label: 'A vencer', value: bucket(0, 0), format: 'currency' }, { label: '1 a 30 dias', value: bucket(1, 30), format: 'currency' }, { label: '31 a 60 dias', value: bucket(31, 60), format: 'currency' }, { label: 'Mais de 60 dias', value: bucket(61, 1e9), format: 'currency' }],
        note: 'Posição atual dos valores a receber em aberto (não depende do período).' };
    }
  }
}
