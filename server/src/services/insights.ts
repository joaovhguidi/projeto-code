import { ALERT_CATALOG, KPI_CATALOG, can, canDo, type AlertKey, type ChartKey, type KpiKey } from '@nexo/shared';
import type { Db } from '../db/pool';
import type { Ctx } from '../middleware/auth';

// ---------------------------------------------------------------------------
// Datas de referência no fuso da empresa
// ---------------------------------------------------------------------------
export async function refDates(db: Db, ctx: Ctx) {
  const r = await db.query(
    `SELECT (now() AT TIME ZONE $1)::date AS today,
            date_trunc('month', now() AT TIME ZONE $1)::date AS month_start,
            (date_trunc('month', now() AT TIME ZONE $1) - interval '1 month')::date AS prev_month_start,
            ((now() AT TIME ZONE $1) - interval '1 month')::date AS prev_month_same_day`, [ctx.company.timezone]);
  return r.rows[0] as { today: string; month_start: string; prev_month_start: string; prev_month_same_day: string };
}

/** Horários livres (em slots de 30 min) para profissionais ativos a partir de agora até o fim do dia. */
export async function freeSlotsToday(db: Db, ctx: Ctx) {
  const tz = ctx.company.timezone;
  const { today } = await refDates(db, ctx);
  const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
  const oh = (ctx.company as any).opening_hours ?? {};
  const configured = Object.keys(oh).length > 0;
  const hours = configured ? oh[String(weekday)] : { open: '08:00', close: '18:00' };
  if (!hours) return { slots: 0, configured, closed: true, employees: 0 };
  const emps = (await db.query(
    `SELECT e.id FROM employees e WHERE e.company_id = $1 AND e.archived_at IS NULL AND e.status = 'ativo'
        AND NOT EXISTS (SELECT 1 FROM shifts s WHERE s.company_id = e.company_id AND s.employee_id = e.id AND s.date = $2 AND s.kind <> 'turno')`,
    [ctx.companyId, today])).rows;
  const busy = (await db.query(
    `SELECT employee_id, starts_at, ends_at FROM appointments WHERE company_id = $1 AND status IN ('agendado','confirmado','concluido')
        AND starts_at < (($2::date + 1)::timestamp AT TIME ZONE $3) AND ends_at > ($2::date::timestamp AT TIME ZONE $3)`, [ctx.companyId, today, tz])).rows;
  const base = Number((await db.query(`SELECT extract(epoch FROM ($1::date::timestamp AT TIME ZONE $2)) * 1000 AS ms`, [today, tz])).rows[0].ms);
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let slots = 0;
  const now = Date.now();
  for (const e of emps) {
    for (let m = toMin(hours.open); m + 30 <= toMin(hours.close); m += 30) {
      const s = base + m * 60000, en = s + 30 * 60000;
      if (s < now) continue;
      if (!busy.some((b) => b.employee_id === e.id && new Date(b.starts_at).getTime() < en && new Date(b.ends_at).getTime() > s)) slots++;
    }
  }
  return { slots, configured, closed: false, employees: emps.length };
}

// ---------------------------------------------------------------------------
// Indicadores (KPIs)
// ---------------------------------------------------------------------------
export interface KpiResult {
  key: KpiKey; label: string; format: 'number' | 'currency' | 'percent';
  value: number | null; detail?: string; href?: string; tone?: 'positive' | 'negative' | 'neutral'; empty?: { message: string; action: string; href: string };
}

const pctChange = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : null);
const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(0).replace('.', ',')}%`;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function computeKpis(db: Db, ctx: Ctx, keys: KpiKey[]): Promise<KpiResult[]> {
  const d = await refDates(db, ctx);
  const C = ctx.companyId, tz = ctx.company.timezone;
  const one = async (sql: string, params: unknown[] = [C]) => (await db.query(sql, params)).rows[0];
  const out: KpiResult[] = [];
  for (const key of keys) {
    const meta = KPI_CATALOG[key];
    if (!meta || !can(ctx.role, meta.module, 'read')) continue;
    const r: KpiResult = { key, label: meta.label, format: meta.format, value: null };
    switch (key) {
      case 'appointments_today': {
        const x = await one(`SELECT count(*) FILTER (WHERE status IN ('agendado','confirmado','concluido'))::int AS n, count(*) FILTER (WHERE status = 'confirmado')::int AS conf,
                                    count(*) FILTER (WHERE status = 'concluido')::int AS done
                               FROM appointments WHERE company_id = $1 AND (starts_at AT TIME ZONE $2)::date = $3`, [C, tz, d.today]);
        r.value = x.n; r.detail = x.n ? `${x.conf} confirmados · ${x.done} concluídos` : 'Nenhum atendimento hoje'; r.href = '/app/agenda';
        break;
      }
      case 'free_slots_today': {
        const f = await freeSlotsToday(db, ctx);
        if (!f.employees) { r.empty = { message: 'Cadastre a equipe para calcular horários livres.', action: 'Cadastrar profissional', href: '/app/equipe?novo=1' }; break; }
        r.value = f.closed ? 0 : f.slots;
        r.detail = f.closed ? 'Fechado hoje' : `Intervalos de 30 min${f.configured ? '' : ' · expediente padrão 8h–18h'}`; r.href = '/app/agenda';
        break;
      }
      case 'upcoming_appointments': {
        const x = await one(`SELECT count(*)::int AS n FROM appointments WHERE company_id = $1 AND status IN ('agendado','confirmado') AND starts_at BETWEEN now() AND now() + interval '7 days'`);
        r.value = x.n; r.href = '/app/agenda?view=semana'; break;
      }
      case 'cancellations_month': {
        const x = await one(`SELECT count(*) FILTER (WHERE status IN ('cancelado','falta'))::int AS n, count(*)::int AS total, count(*) FILTER (WHERE status = 'falta')::int AS noshow
                               FROM appointments WHERE company_id = $1 AND (starts_at AT TIME ZONE $2)::date BETWEEN $3 AND $4`, [C, tz, d.month_start, d.today]);
        r.value = x.n; r.detail = x.total ? `${((x.n / x.total) * 100).toFixed(0)}% dos agendamentos · ${x.noshow} faltas` : 'Sem agendamentos no mês';
        r.tone = x.total && x.n / x.total > 0.15 ? 'negative' : 'neutral'; r.href = '/app/agenda?status=cancelado,falta'; break;
      }
      case 'revenue_month':
      case 'expenses_month':
      case 'result_month': {
        const x = await one(`SELECT coalesce(sum(amount) FILTER (WHERE kind='receita' AND competence_date BETWEEN $2 AND $3),0) AS rev,
                                    coalesce(sum(amount) FILTER (WHERE kind='despesa' AND competence_date BETWEEN $2 AND $3),0) AS exp,
                                    coalesce(sum(amount) FILTER (WHERE kind='receita' AND competence_date BETWEEN $4 AND $5),0) AS prev_rev,
                                    coalesce(sum(amount) FILTER (WHERE kind='despesa' AND competence_date BETWEEN $4 AND $5),0) AS prev_exp,
                                    count(*)::int AS any
                               FROM financial_transactions WHERE company_id = $1 AND status <> 'cancelado'`, [C, d.month_start, d.today, d.prev_month_start, d.prev_month_same_day]);
        if (!x.any) { r.empty = { message: 'Nenhum lançamento financeiro ainda.', action: 'Lançar receita ou despesa', href: '/app/financeiro?novo=receita' }; break; }
        if (key === 'revenue_month') {
          r.value = x.rev; const ch = pctChange(x.rev, x.prev_rev);
          r.detail = ch === null ? 'Receitas do mês (competência)' : `${fmtPct(ch)} vs. mesmo período do mês anterior`; r.tone = ch === null ? 'neutral' : ch >= 0 ? 'positive' : 'negative';
        } else if (key === 'expenses_month') {
          r.value = x.exp; const ch = pctChange(x.exp, x.prev_exp);
          r.detail = ch === null ? 'Despesas do mês (competência)' : `${fmtPct(ch)} vs. mesmo período do mês anterior`; r.tone = ch !== null && ch > 0.1 ? 'negative' : 'neutral';
        } else {
          r.value = Math.round((x.rev - x.exp) * 100) / 100; r.detail = 'Receitas − despesas lançadas. Não é lucro contábil.'; r.tone = r.value >= 0 ? 'positive' : 'negative';
        }
        r.href = '/app/financeiro'; break;
      }
      case 'cash_balance': {
        const x = await one(`SELECT coalesce(sum(CASE WHEN t.kind='receita' THEN p.amount ELSE -p.amount END),0) AS bal, count(*)::int AS n
                               FROM transaction_payments p JOIN financial_transactions t ON t.id = p.transaction_id WHERE p.company_id = $1 AND p.reversed_at IS NULL`);
        if (!x.n) { r.empty = { message: 'Nenhum pagamento registrado.', action: 'Registrar recebimento', href: '/app/financeiro?novo=receita' }; break; }
        r.value = x.bal; r.detail = 'Entradas − saídas efetivamente pagas'; r.tone = x.bal >= 0 ? 'positive' : 'negative'; r.href = '/app/financeiro'; break;
      }
      case 'sales_month':
      case 'avg_ticket_month':
      case 'estimated_margin_month': {
        const x = await one(`SELECT coalesce(sum(total),0) AS total, count(*)::int AS n, coalesce(sum(cost_total),0) AS cost,
                                    (SELECT count(*)::int FROM sales WHERE company_id = $1) AS ever,
                                    coalesce((SELECT sum(total) FROM sales WHERE company_id = $1 AND status='concluida' AND (sold_at AT TIME ZONE $2)::date BETWEEN $5 AND $6),0) AS prev
                               FROM sales WHERE company_id = $1 AND status = 'concluida' AND (sold_at AT TIME ZONE $2)::date BETWEEN $3 AND $4`,
          [C, tz, d.month_start, d.today, d.prev_month_start, d.prev_month_same_day]);
        if (!x.ever) { r.empty = { message: 'Nenhuma venda registrada ainda.', action: 'Registrar primeira venda', href: '/app/vendas/nova' }; break; }
        if (key === 'sales_month') {
          r.value = x.total; const ch = pctChange(x.total, x.prev);
          r.detail = `${x.n} vendas${ch === null ? '' : ` · ${fmtPct(ch)} vs. mês anterior`}`; r.tone = ch === null ? 'neutral' : ch >= 0 ? 'positive' : 'negative';
        } else if (key === 'avg_ticket_month') {
          r.value = x.n ? Math.round((x.total / x.n) * 100) / 100 : 0; r.detail = `${x.n} vendas no mês`;
        } else {
          if (!canDo(ctx.role, 'viewCosts')) continue;
          r.value = x.total > 0 && x.cost > 0 ? (x.total - x.cost) / x.total : null;
          r.detail = x.cost > 0 ? `Custo estimado ${brl(x.cost)}` : 'Informe o custo dos produtos/serviços para estimar';
        }
        r.href = '/app/vendas'; break;
      }
      case 'sales_today':
      case 'orders_today': {
        const x = await one(`SELECT coalesce(sum(total),0) AS total, count(*)::int AS n FROM sales WHERE company_id = $1 AND status = 'concluida' AND (sold_at AT TIME ZONE $2)::date = $3`, [C, tz, d.today]);
        r.value = key === 'sales_today' ? x.total : x.n; r.detail = key === 'sales_today' ? `${x.n} vendas hoje` : `${brl(x.total)} hoje`; r.href = '/app/vendas'; break;
      }
      case 'low_stock_count':
      case 'out_of_stock_count':
      case 'expiring_products': {
        const x = await one(`SELECT count(*) FILTER (WHERE stock_qty <= min_stock AND min_stock > 0)::int AS low, count(*) FILTER (WHERE stock_qty <= 0)::int AS out,
                                    count(*) FILTER (WHERE track_expiry AND expiry_date <= current_date + 30)::int AS exp, count(*)::int AS total
                               FROM products WHERE company_id = $1 AND archived_at IS NULL AND active`);
        if (!x.total) { r.empty = { message: 'Nenhum produto cadastrado.', action: 'Cadastrar produto', href: '/app/estoque?novo=1' }; break; }
        r.value = key === 'low_stock_count' ? x.low : key === 'out_of_stock_count' ? x.out : x.exp;
        r.detail = `${x.total} produtos ativos`; r.tone = r.value ? 'negative' : 'positive';
        r.href = `/app/estoque?status=${key === 'low_stock_count' ? 'low' : key === 'out_of_stock_count' ? 'out' : 'expiring'}`; break;
      }
      case 'waste_month': {
        const x = await one(`SELECT coalesce(sum(total_cost),0) AS total, count(*)::int AS n FROM waste_records WHERE company_id = $1 AND occurred_on BETWEEN $2 AND $3`, [C, d.month_start, d.today]);
        r.value = x.total; r.detail = `${x.n} registros no mês`; r.tone = x.total > 0 ? 'negative' : 'neutral'; r.href = '/app/desperdicios'; break;
      }
      case 'receivables_open':
      case 'overdue_receivables':
      case 'payables_open': {
        const kind = key === 'payables_open' ? 'despesa' : 'receita';
        const x = await one(`SELECT coalesce(sum(amount-amount_paid),0) AS open, count(*)::int AS n,
                                    coalesce(sum(amount-amount_paid) FILTER (WHERE due_date < $3),0) AS overdue, count(*) FILTER (WHERE due_date < $3)::int AS n_overdue
                               FROM financial_transactions WHERE company_id = $1 AND kind = $2 AND status IN ('pendente','parcial')`, [C, kind, d.today]);
        if (key === 'overdue_receivables') { r.value = x.overdue; r.detail = `${x.n_overdue} recebimentos vencidos`; r.tone = x.overdue > 0 ? 'negative' : 'positive'; r.href = '/app/cobrancas?status=atrasado'; }
        else { r.value = x.open; r.detail = `${x.n} em aberto${x.n_overdue ? ` · ${x.n_overdue} vencidos` : ''}`; r.tone = x.n_overdue ? 'negative' : 'neutral'; r.href = kind === 'receita' ? '/app/cobrancas' : '/app/financeiro?kind=despesa&status=aberto'; }
        break;
      }
      case 'pending_quotes': {
        const x = await one(`SELECT count(*) FILTER (WHERE status = 'enviado')::int AS n, coalesce(sum(total) FILTER (WHERE status = 'enviado'),0) AS total, count(*)::int AS ever FROM quotes WHERE company_id = $1`);
        if (!x.ever) { r.empty = { message: 'Nenhum orçamento criado.', action: 'Criar orçamento', href: '/app/orcamentos/novo' }; break; }
        r.value = x.n; r.detail = `${brl(x.total)} em propostas enviadas`; r.href = '/app/orcamentos?status=enviado'; break;
      }
      case 'work_orders_open':
      case 'work_orders_done_month': {
        const x = await one(`SELECT count(*) FILTER (WHERE status IN ('aberta','em_andamento','aguardando_pecas'))::int AS open,
                                    count(*) FILTER (WHERE status IN ('aberta','em_andamento','aguardando_pecas') AND due_date < $2)::int AS late,
                                    count(*) FILTER (WHERE status IN ('concluida','entregue') AND completed_on >= $3)::int AS done, count(*)::int AS ever
                               FROM work_orders WHERE company_id = $1`, [C, d.today, d.month_start]);
        if (!x.ever) { r.empty = { message: 'Nenhuma ordem de serviço aberta ainda.', action: 'Abrir OS', href: '/app/ordens-servico/nova' }; break; }
        if (key === 'work_orders_open') { r.value = x.open; r.detail = x.late ? `${x.late} com prazo vencido` : 'Nenhuma atrasada'; r.tone = x.late ? 'negative' : 'positive'; r.href = '/app/ordens-servico?status=abertas'; }
        else { r.value = x.done; r.href = '/app/ordens-servico?status=concluida,entregue'; }
        break;
      }
      case 'deliveries_pending':
      case 'deliveries_late':
      case 'deliveries_done_month':
      case 'delivery_costs_month': {
        const x = await one(`SELECT count(*) FILTER (WHERE status NOT IN ('concluida','cancelada'))::int AS pending,
                                    count(*) FILTER (WHERE status NOT IN ('concluida','cancelada') AND scheduled_for < now())::int AS late,
                                    count(*) FILTER (WHERE status = 'concluida' AND (delivered_at AT TIME ZONE $2)::date >= $3)::int AS done,
                                    count(*) FILTER (WHERE status = 'concluida' AND (delivered_at AT TIME ZONE $2)::date >= $3 AND delivered_at > scheduled_for)::int AS done_late,
                                    coalesce(sum(cost) FILTER (WHERE status = 'concluida' AND (delivered_at AT TIME ZONE $2)::date >= $3),0) AS cost, count(*)::int AS ever
                               FROM deliveries WHERE company_id = $1`, [C, tz, d.month_start]);
        if (!x.ever) { r.empty = { message: 'Nenhuma entrega registrada.', action: 'Registrar entrega', href: '/app/entregas?novo=1' }; break; }
        if (key === 'deliveries_pending') { r.value = x.pending; r.href = '/app/entregas?open=1'; }
        if (key === 'deliveries_late') { r.value = x.late; r.tone = x.late ? 'negative' : 'positive'; r.href = '/app/entregas?late=1'; }
        if (key === 'deliveries_done_month') { r.value = x.done; r.detail = x.done ? `${Math.round(((x.done - x.done_late) / x.done) * 100)}% no prazo` : undefined; r.href = '/app/entregas?status=concluida'; }
        if (key === 'delivery_costs_month') { r.value = x.cost; r.detail = x.done ? `${brl(x.cost / x.done)} por entrega` : undefined; r.href = '/app/entregas'; }
        break;
      }
      case 'customers_total':
      case 'inactive_customers': {
        const x = await one(`SELECT count(*)::int AS total,
                                    count(*) FILTER (WHERE coalesce(greatest(
                                       (SELECT max(sold_at) FROM sales s WHERE s.company_id = c.company_id AND s.customer_id = c.id AND s.status='concluida'),
                                       (SELECT max(starts_at) FROM appointments a WHERE a.company_id = c.company_id AND a.customer_id = c.id AND a.status='concluido')), c.created_at) < now() - interval '90 days')::int AS inactive
                               FROM customers c WHERE c.company_id = $1 AND c.archived_at IS NULL`);
        if (!x.total) { r.empty = { message: 'Nenhum cliente cadastrado.', action: 'Cadastrar cliente', href: '/app/clientes?novo=1' }; break; }
        r.value = key === 'customers_total' ? x.total : x.inactive;
        r.detail = key === 'customers_total' ? `${x.inactive} sem retorno há 90 dias` : 'Sem compra ou atendimento há 90 dias';
        r.href = key === 'customers_total' ? '/app/clientes' : '/app/clientes?inactive=1'; break;
      }
      case 'tasks_overdue': {
        const x = await one(`SELECT count(*) FILTER (WHERE due_date < $2)::int AS late, count(*)::int AS open FROM tasks WHERE company_id = $1 AND status <> 'concluida'`, [C, d.today]);
        r.value = x.late; r.detail = `${x.open} tarefas em aberto`; r.tone = x.late ? 'negative' : 'positive'; r.href = '/app/tarefas?overdue=1'; break;
      }
      case 'open_issues': {
        const x = await one(`SELECT count(*)::int AS n, count(*) FILTER (WHERE priority IN ('alta','urgente'))::int AS hi FROM issues WHERE company_id = $1 AND status IN ('aberta','em_andamento')`);
        r.value = x.n; r.detail = `${x.hi} de prioridade alta/urgente`; r.href = '/app/solicitacoes'; break;
      }
      case 'open_complaints': {
        const x = await one(`SELECT count(*)::int AS n FROM feedbacks WHERE company_id = $1 AND type = 'reclamacao' AND status IN ('aberta','em_analise')`);
        r.value = x.n; r.tone = x.n ? 'negative' : 'positive'; r.href = '/app/avaliacoes?type=reclamacao'; break;
      }
      case 'pets_total': {
        const x = await one(`SELECT count(*)::int AS n, count(*) FILTER (WHERE next_return <= current_date + 7)::int AS ret FROM pets WHERE company_id = $1 AND archived_at IS NULL`);
        r.value = x.n; r.detail = `${x.ret} com retorno previsto em até 7 dias`; r.href = '/app/animais'; break;
      }
    }
    out.push(r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------
export interface AlertItem { key: AlertKey; severity: 'critical' | 'warning' | 'info'; title: string; description: string; href: string; count: number }

export async function computeAlerts(db: Db, ctx: Ctx, keys: AlertKey[]): Promise<AlertItem[]> {
  const d = await refDates(db, ctx);
  const C = ctx.companyId;
  const q = async (sql: string, params: unknown[] = [C]) => (await db.query(sql, params)).rows[0];
  const out: AlertItem[] = [];
  const push = (a: AlertItem) => { if (a.count > 0) out.push(a); };
  for (const key of keys) {
    if (!can(ctx.role, ALERT_CATALOG[key].module, 'read')) continue;
    switch (key) {
      case 'overdue_receivables': {
        const x = await q(`SELECT count(*)::int n, coalesce(sum(amount-amount_paid),0) v FROM financial_transactions WHERE company_id=$1 AND kind='receita' AND status IN ('pendente','parcial') AND due_date < $2`, [C, d.today]);
        push({ key, severity: 'critical', count: x.n, title: `${x.n} recebimento${x.n > 1 ? 's' : ''} em atraso`, description: `${brl(x.v)} vencidos e não recebidos.`, href: '/app/cobrancas?status=atrasado' });
        break;
      }
      case 'overdue_payables': {
        const x = await q(`SELECT count(*)::int n, coalesce(sum(amount-amount_paid),0) v FROM financial_transactions WHERE company_id=$1 AND kind='despesa' AND status IN ('pendente','parcial') AND due_date < $2`, [C, d.today]);
        push({ key, severity: 'critical', count: x.n, title: `${x.n} conta${x.n > 1 ? 's' : ''} a pagar vencida${x.n > 1 ? 's' : ''}`, description: `${brl(x.v)} em atraso — evite juros e multas.`, href: '/app/financeiro?kind=despesa&status=atrasado' });
        break;
      }
      case 'low_stock': {
        const x = await q(`SELECT count(*)::int n, string_agg(name, ', ' ORDER BY stock_qty - min_stock) FILTER (WHERE rn <= 3) names FROM (
                             SELECT name, stock_qty, min_stock, row_number() OVER (ORDER BY stock_qty - min_stock) rn FROM products
                              WHERE company_id=$1 AND archived_at IS NULL AND active AND min_stock > 0 AND stock_qty <= min_stock) s`);
        push({ key, severity: 'warning', count: x.n, title: `${x.n} produto${x.n > 1 ? 's' : ''} com estoque baixo`, description: x.names ?? '', href: '/app/estoque?status=low' });
        break;
      }
      case 'expiring_products': {
        const x = await q(`SELECT count(*) FILTER (WHERE expiry_date < current_date)::int expired, count(*) FILTER (WHERE expiry_date BETWEEN current_date AND current_date + 15)::int soon
                             FROM products WHERE company_id=$1 AND archived_at IS NULL AND track_expiry AND stock_qty > 0`);
        push({ key, severity: x.expired ? 'critical' : 'warning', count: x.expired + x.soon, title: 'Produtos vencidos ou perto do vencimento',
          description: `${x.expired} vencido${x.expired === 1 ? '' : 's'} em estoque · ${x.soon} vencem em até 15 dias.`, href: '/app/estoque?status=expiring' });
        break;
      }
      case 'unconfirmed_appointments': {
        const x = await q(`SELECT count(*)::int n FROM appointments WHERE company_id=$1 AND status='agendado' AND starts_at BETWEEN now() AND now() + interval '48 hours'`);
        push({ key, severity: 'warning', count: x.n, title: `${x.n} agendamento${x.n > 1 ? 's' : ''} sem confirmação`, description: 'Nas próximas 48 horas. Confirme para reduzir faltas.', href: '/app/agenda?status=agendado' });
        break;
      }
      case 'overdue_tasks': {
        const x = await q(`SELECT count(*)::int n FROM tasks WHERE company_id=$1 AND status <> 'concluida' AND due_date < $2`, [C, d.today]);
        push({ key, severity: 'warning', count: x.n, title: `${x.n} tarefa${x.n > 1 ? 's' : ''} atrasada${x.n > 1 ? 's' : ''}`, description: 'Prazo vencido sem conclusão.', href: '/app/tarefas?overdue=1' });
        break;
      }
      case 'late_deliveries': {
        const x = await q(`SELECT count(*)::int n FROM deliveries WHERE company_id=$1 AND status NOT IN ('concluida','cancelada') AND scheduled_for < now()`);
        push({ key, severity: 'critical', count: x.n, title: `${x.n} entrega${x.n > 1 ? 's' : ''} atrasada${x.n > 1 ? 's' : ''}`, description: 'Horário previsto já passou.', href: '/app/entregas?late=1' });
        break;
      }
      case 'late_work_orders': {
        const x = await q(`SELECT count(*)::int n FROM work_orders WHERE company_id=$1 AND status IN ('aberta','em_andamento','aguardando_pecas') AND due_date < $2`, [C, d.today]);
        push({ key, severity: 'critical', count: x.n, title: `${x.n} OS com prazo vencido`, description: 'Avise o cliente e reprograme a entrega.', href: '/app/ordens-servico?late=1' });
        break;
      }
      case 'expiring_quotes': {
        const x = await q(`SELECT count(*)::int n FROM quotes WHERE company_id=$1 AND status='enviado' AND valid_until BETWEEN $2 AND $2::date + 3`, [C, d.today]);
        push({ key, severity: 'info', count: x.n, title: `${x.n} orçamento${x.n > 1 ? 's' : ''} expira${x.n > 1 ? 'm' : ''} em até 3 dias`, description: 'Faça contato com o cliente antes do vencimento.', href: '/app/orcamentos?status=enviado' });
        break;
      }
      case 'documents_expiring': {
        const restricted = canDo(ctx.role, 'restrictedDocuments') ? '' : 'AND NOT restricted';
        const x = await q(`SELECT count(*) FILTER (WHERE expires_on < current_date)::int expired, count(*) FILTER (WHERE expires_on BETWEEN current_date AND current_date + 30)::int soon
                             FROM documents WHERE company_id=$1 AND archived_at IS NULL ${restricted}`);
        push({ key, severity: x.expired ? 'critical' : 'warning', count: x.expired + x.soon, title: 'Documentos vencidos ou a vencer', description: `${x.expired} vencido(s) · ${x.soon} vencem em 30 dias.`, href: '/app/documentos?expiring=1' });
        break;
      }
      case 'preventive_due': {
        const x = await q(`SELECT count(*)::int n FROM equipment WHERE company_id=$1 AND archived_at IS NULL AND status <> 'desativado' AND next_preventive_on <= current_date + 7`);
        push({ key, severity: 'info', count: x.n, title: `${x.n} manutenção(ões) preventiva(s) próxima(s)`, description: 'Programada para os próximos 7 dias ou atrasada.', href: '/app/manutencao?preventive_due=1' });
        break;
      }
      case 'open_complaints': {
        const x = await q(`SELECT count(*)::int n FROM feedbacks WHERE company_id=$1 AND type='reclamacao' AND status IN ('aberta','em_analise')`);
        push({ key, severity: 'warning', count: x.n, title: `${x.n} reclamação(ões) sem solução`, description: 'Defina responsável e prazo para cada uma.', href: '/app/avaliacoes?type=reclamacao&status=aberta,em_analise' });
        break;
      }
      case 'pending_swaps': {
        const x = await q(`SELECT count(*)::int n FROM shift_swap_requests WHERE company_id=$1 AND status='pendente'`);
        push({ key, severity: 'info', count: x.n, title: `${x.n} pedido(s) de troca de turno`, description: 'Aguardando aprovação.', href: '/app/escalas' });
        break;
      }
    }
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ---------------------------------------------------------------------------
// Gráficos do painel
// ---------------------------------------------------------------------------
export async function computeChart(db: Db, ctx: Ctx, key: ChartKey) {
  const C = ctx.companyId, tz = ctx.company.timezone;
  const d = await refDates(db, ctx);
  const rows = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows;
  switch (key) {
    case 'revenue_expenses': {
      const data = await rows(
        `WITH m AS (SELECT generate_series(date_trunc('month', $2::date) - interval '5 months', date_trunc('month', $2::date), interval '1 month')::date AS m)
         SELECT to_char(m.m, 'YYYY-MM') AS month, coalesce(sum(t.amount) FILTER (WHERE t.kind='receita'),0) AS receitas,
                coalesce(sum(t.amount) FILTER (WHERE t.kind='despesa'),0) AS despesas
           FROM m LEFT JOIN financial_transactions t ON t.company_id = $1 AND t.status <> 'cancelado' AND date_trunc('month', t.competence_date) = m.m
          GROUP BY m.m ORDER BY m.m`, [C, d.today]);
      return { key, type: 'bar', data, hasData: data.some((r) => r.receitas > 0 || r.despesas > 0), empty: { message: 'Lance receitas e despesas para acompanhar a evolução mensal.', action: 'Lançar no financeiro', href: '/app/financeiro?novo=receita' } };
    }
    case 'sales_daily': {
      const data = await rows(
        `WITH days AS (SELECT generate_series($2::date - 29, $2::date, interval '1 day')::date AS d)
         SELECT d AS date, coalesce(sum(s.total),0) AS total, count(s.id)::int AS count
           FROM days LEFT JOIN sales s ON s.company_id = $1 AND s.status = 'concluida' AND (s.sold_at AT TIME ZONE $3)::date = days.d
          GROUP BY d ORDER BY d`, [C, d.today, tz]);
      return { key, type: 'area', data, hasData: data.some((r) => r.count > 0), empty: { message: 'Registre vendas para ver a evolução diária.', action: 'Registrar venda', href: '/app/vendas/nova' } };
    }
    case 'appointments_week': {
      const data = await rows(
        `WITH days AS (SELECT generate_series(date_trunc('week', $2::date)::date, date_trunc('week', $2::date)::date + 6, interval '1 day')::date AS d)
         SELECT d AS date, count(a.id) FILTER (WHERE a.status IN ('agendado','confirmado'))::int AS agendados,
                count(a.id) FILTER (WHERE a.status = 'concluido')::int AS concluidos, count(a.id) FILTER (WHERE a.status IN ('cancelado','falta'))::int AS cancelados
           FROM days LEFT JOIN appointments a ON a.company_id = $1 AND (a.starts_at AT TIME ZONE $3)::date = days.d
          GROUP BY d ORDER BY d`, [C, d.today, tz]);
      return { key, type: 'stacked', data, hasData: data.some((r) => r.agendados + r.concluidos + r.cancelados > 0), empty: { message: 'Nenhum atendimento nesta semana.', action: 'Agendar atendimento', href: '/app/agenda?novo=1' } };
    }
    case 'top_services': {
      const data = await rows(
        `SELECT coalesce(sv.name, i.description) AS name, sum(i.total) AS total, sum(i.quantity) AS quantity
           FROM sale_items i JOIN sales s ON s.id = i.sale_id LEFT JOIN services sv ON sv.id = i.service_id
          WHERE i.company_id = $1 AND s.status = 'concluida' AND i.product_id IS NULL AND s.sold_at > now() - interval '90 days'
          GROUP BY 1 ORDER BY 2 DESC LIMIT 6`, [C]);
      return { key, type: 'hbar', data, hasData: data.length > 0, empty: { message: 'Registre vendas de serviços para ver o ranking.', action: 'Registrar venda', href: '/app/vendas/nova' } };
    }
    case 'top_products': {
      const data = await rows(
        `SELECT p.name, sum(i.quantity) AS quantity, sum(i.total) AS total FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN products p ON p.id = i.product_id
          WHERE i.company_id = $1 AND s.status = 'concluida' AND s.sold_at > now() - interval '90 days'
          GROUP BY p.name ORDER BY 2 DESC LIMIT 6`, [C]);
      return { key, type: 'hbar-qty', data, hasData: data.length > 0, empty: { message: 'Registre vendas de produtos para ver os mais vendidos.', action: 'Registrar venda', href: '/app/vendas/nova' } };
    }
    case 'waste_by_reason': {
      const data = await rows(`SELECT reason AS name, sum(total_cost) AS total, count(*)::int AS count FROM waste_records WHERE company_id = $1 AND occurred_on > current_date - 90 GROUP BY reason ORDER BY 2 DESC`, [C]);
      return { key, type: 'pie', data, hasData: data.length > 0, empty: { message: 'Nenhuma perda registrada nos últimos 90 dias.', action: 'Registrar perda', href: '/app/desperdicios?novo=1' } };
    }
    case 'deliveries_status': {
      const data = await rows(`SELECT status AS name, count(*)::int AS total FROM deliveries WHERE company_id = $1 AND (status NOT IN ('concluida','cancelada') OR scheduled_for > now() - interval '30 days') GROUP BY status ORDER BY 2 DESC`, [C]);
      return { key, type: 'pie', data, hasData: data.length > 0, empty: { message: 'Nenhuma entrega nos últimos 30 dias.', action: 'Nova entrega', href: '/app/entregas?novo=1' } };
    }
    case 'work_orders_status': {
      const data = await rows(`SELECT status AS name, count(*)::int AS total FROM work_orders WHERE company_id = $1 AND (status IN ('aberta','em_andamento','aguardando_pecas') OR opened_on > current_date - 30) GROUP BY status ORDER BY 2 DESC`, [C]);
      return { key, type: 'pie', data, hasData: data.length > 0, empty: { message: 'Nenhuma ordem de serviço recente.', action: 'Abrir OS', href: '/app/ordens-servico/nova' } };
    }
  }
}
