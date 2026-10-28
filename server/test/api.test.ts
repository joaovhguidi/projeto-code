import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { migrate } from '../src/db/migrate';
import { config } from '../src/config';

const app = createApp();
const H = { 'X-Nexo-Request': '1' };
async function owner(segment = 'loja_roupas') {
  const agent = request.agent(app);
  const email = `u${Date.now()}${Math.random().toString(36).slice(2, 6)}@teste.com`;
  await agent.post('/api/auth/register').set(H).send({ name: 'Dono Teste', email, password: 'senha1234' }).expect(201);
  await agent.post('/api/companies').set(H).send({ name: 'Empresa ' + email, segment_key: segment }).expect(201);
  return agent;
}

beforeAll(async () => { await migrate(config.migrationUrl, { quiet: true }); });

describe('autenticação e segurança', () => {
  it('bloqueia rotas privadas sem sessão', async () => { await request(app).get('/api/customers').expect(401); });
  it('bloqueia alterações sem cabeçalho anti-CSRF', async () => { await request(app).post('/api/auth/login').send({ email: 'a@a.com', password: 'x' }).expect(403); });
  it('rejeita senha errada', async () => { await request(app).post('/api/auth/login').set(H).send({ email: 'naoexiste@x.com', password: 'senha1234' }).expect(401); });
  it('valida campos no servidor', async () => {
    const a = await owner();
    const r = await a.post('/api/customers').set(H).send({ name: 'A', email: 'ruim', document: '111' }).expect(422);
    expect(r.body.fields).toMatchObject({ name: expect.any(String), email: expect.any(String), document: expect.any(String) });
  });
});

describe('isolamento entre empresas', () => {
  it('não permite ler, editar, excluir ou referenciar registros de outra empresa', async () => {
    const a = await owner(); const b = await owner();
    const c = (await a.post('/api/customers').set(H).send({ name: 'Cliente A' }).expect(201)).body.data;
    await b.get(`/api/customers/${c.id}`).expect(404);
    await b.put(`/api/customers/${c.id}`).set(H).send({ name: 'Invasor' }).expect(404);
    await b.delete(`/api/customers/${c.id}?permanent=1`).set(H).expect(404);
    expect((await b.get('/api/customers')).body.total).toBe(0);
    await b.post('/api/sales').set(H).send({ customer_id: c.id, payment_method: 'pix', items: [{ description: 'x', quantity: 1, unit_price: 10 }] }).expect(400);
    expect((await a.get(`/api/customers/${c.id}`).expect(200)).body.data.name).toBe('Cliente A');
  });
});

describe('vendas, estoque e financeiro', () => {
  it('venda baixa estoque, gera receita única; cancelamento estorna tudo', async () => {
    const a = await owner();
    const p = (await a.post('/api/products').set(H).send({ name: 'Camiseta', cost_price: 20, sale_price: 59.9, min_stock: 2, initial_stock: 10, unit: 'un' }).expect(201)).body.data;
    const s = (await a.post('/api/sales').set(H).send({ payment_method: 'pix', discount: 0.7, items: [{ product_id: p.id, description: 'Camiseta', quantity: 3, unit_price: 59.9 }] }).expect(201)).body.data;
    expect(s.total).toBe(179); // 3 × 59,90 − 0,70, sem erro de arredondamento
    expect((await a.get(`/api/products/${p.id}`)).body.data.stock_qty).toBe(7);
    let sum = (await a.get('/api/finance/summary')).body.data;
    expect(sum.revenue).toBe(179); expect(sum.cash.balance).toBe(179); expect(sum.result).toBe(179);
    await a.post(`/api/sales/${s.id}/cancel`).set(H).send({ reason: 'teste' }).expect(200);
    expect((await a.get(`/api/products/${p.id}`)).body.data.stock_qty).toBe(10);
    sum = (await a.get('/api/finance/summary')).body.data;
    expect(sum.revenue).toBe(0); expect(sum.cash.balance).toBe(0);
    await a.post(`/api/sales/${s.id}/cancel`).set(H).send({ reason: 'de novo' }).expect(409);
  });
  it('impede venda acima do estoque', async () => {
    const a = await owner();
    const p = (await a.post('/api/products').set(H).send({ name: 'Boné', cost_price: 5, sale_price: 30, initial_stock: 1 }).expect(201)).body.data;
    await a.post('/api/sales').set(H).send({ payment_method: 'pix', items: [{ product_id: p.id, description: 'Boné', quantity: 2, unit_price: 30 }] }).expect(409);
  });
  it('parcelas e pagamentos parciais fecham os centavos', async () => {
    const a = await owner();
    const ids = (await a.post('/api/transactions').set(H).send({ kind: 'receita', description: 'Contrato', amount: 100, installments: 3, competence_date: '2026-01-10', due_date: '2026-01-10' }).expect(201)).body.data.ids;
    const list = (await a.get('/api/transactions?from=2026-01-01&to=2026-12-31')).body;
    expect(list.data.map((t: any) => t.amount).sort()).toEqual([33.33, 33.33, 33.34]);
    await a.post(`/api/transactions/${ids[0]}/payments`).set(H).send({ amount: 10, paid_on: '2026-01-10' }).expect(201);
    const t = (await a.get(`/api/transactions/${ids[0]}`)).body.data;
    expect(t.status).toBe('parcial'); expect(t.balance).toBe(23.33);
    await a.post(`/api/transactions/${ids[0]}/payments`).set(H).send({ amount: 50, paid_on: '2026-01-10' }).expect(400);
  });
});

describe('agenda', () => {
  it('impede conflito de horário para o mesmo profissional', async () => {
    const a = await owner('barbearia');
    const emp = (await a.get('/api/staff/options')).body.data[0].id;
    await a.post('/api/appointments').set(H).send({ title: 'A', employee_id: emp, starts_at: '2030-01-07T13:00:00Z', ends_at: '2030-01-07T13:30:00Z' }).expect(201);
    await a.post('/api/appointments').set(H).send({ title: 'B', employee_id: emp, starts_at: '2030-01-07T13:15:00Z', ends_at: '2030-01-07T13:45:00Z' }).expect(409);
  });
});

describe('permissões e personalização', () => {
  it('colaborador não acessa financeiro nem gerencia usuários', async () => {
    const a = await owner();
    const email = `col${Date.now()}@teste.com`;
    await a.post('/api/company/members').set(H).send({ name: 'Colab', email, password: 'senha1234', role: 'colaborador' }).expect(201);
    const c = request.agent(app);
    await c.post('/api/auth/login').set(H).send({ email, password: 'senha1234' }).expect(200);
    await c.get('/api/finance/summary').expect(403);
    await c.get('/api/transactions').expect(403);
    await c.post('/api/company/members').set(H).send({ name: 'X', email: 'x@x.com', password: 'senha1234', role: 'proprietario' }).expect(403);
    await c.get('/api/customers').expect(200);
    const me = (await c.get('/api/auth/me')).body.data;
    expect(me.workspace.kpis.some((k: string) => ['revenue_month', 'result_month'].includes(k))).toBe(false);
  });
  it('painel muda conforme o segmento', async () => {
    const barber = (await (await owner('barbearia')).get('/api/auth/me')).body.data.workspace;
    const shop = (await (await owner('loja_roupas')).get('/api/auth/me')).body.data.workspace;
    expect(barber.priorityModules[0]).toBe('agenda');
    expect(shop.priorityModules[0]).toBe('estoque');
    expect(barber.kpis).not.toEqual(shop.kpis);
  });
  it('dicas não inventam dados e respeitam dispensa', async () => {
    const a = await owner();
    const tips = (await a.get('/api/tips')).body.data;
    expect(tips.every((t: any) => t.kind === 'inicial' || t.indicator || t.fingerprint)).toBe(true);
    const t = tips[0];
    await a.post('/api/tips/state').set(H).send({ key: t.key, fingerprint: t.fingerprint, title: t.title, status: 'dispensada' }).expect(201);
    expect((await a.get('/api/tips')).body.data.find((x: any) => x.key === t.key)).toBeUndefined();
  });
});
