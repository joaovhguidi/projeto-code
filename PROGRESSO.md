# Progresso — Nexo Business

## Pronto
- Banco PostgreSQL com RLS e FKs compostas por empresa (`server/src/db/migrations/001_init.sql`)
- API completa: auth, empresa/onboarding, usuários/permissões, todos os módulos, dashboard, alertas, dicas, relatórios, busca (`server/src/routes`, `server/src/services`)
- Pacote compartilhado: módulos, permissões, regras por segmento, validações zod (`shared/src`)
- Web: design system, layout, landing, funcionalidades, login/cadastro/recuperação, assistente de configuração, painel, dicas, clientes, animais, veículos, serviços, agenda, produtos/estoque, vendas, orçamentos

## Falta (frontend, `web/src/pages/app/`)
work-orders, finance (Finance + Receivables), deliveries, suppliers, tasks, team, shifts, maintenance, waste, feedbacks, loyalty, reports, documents, issues, settings
Depois: `npm run typecheck`, build, testes (vitest em server/test), seed de demonstração, revisão visual.

## Como rodar
bash scripts/setup-db.sh && npm run db:migrate && npm run dev
