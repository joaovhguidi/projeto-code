# Nexo Business

Plataforma web de gestão para MEIs, microempresas e prestadores de serviço. O painel se reorganiza conforme o segmento (20 segmentos), os objetivos e as dificuldades informados no cadastro.

## Stack
- **Frontend:** React 19 + TypeScript, Vite, Tailwind CSS v4, Radix UI, TanStack Query, React Hook Form + Zod, Recharts
- **Backend:** Node.js + Express 5 + TypeScript, validação Zod (mesmos esquemas do frontend, em `shared/`)
- **Banco:** PostgreSQL 16 com Row Level Security, chaves estrangeiras compostas `(company_id, id)` e restrições de exclusão (agenda e escalas sem sobreposição)

## Como rodar
```bash
cp .env.example .env
npm install
bash scripts/setup-db.sh      # cria papéis nexo_owner/nexo_app e bancos nexo/nexo_test
npm run db:migrate            # aplica o esquema e sincroniza os segmentos
npm run dev                   # API em :3333 e web em :5173
npm test                      # testes de API (isolamento, permissões, cálculos, agenda)
```
Produção: `npm run build && npm start` (a API passa a servir o frontend compilado).

## Segurança
- Sessões em cookie httpOnly com token aleatório (hash SHA-256 no banco); senhas com bcrypt.
- A API conecta como `nexo_app`, que não é dono das tabelas: o RLS vale sempre. Cada transação define `app.company_id`.
- Permissões por função (proprietário, gerente, financeiro, colaborador) verificadas no servidor.
- Proteção CSRF por cabeçalho obrigatório, rate limit em login/cadastro, histórico de ações críticas.
- Documentos ficam em diretório privado (`STORAGE_DIR`) e só são baixados por rota autenticada.

## Novos segmentos
Edite `server/data/segments.json` (ou insira em `business_segments`) referenciando as chaves dos catálogos em `shared/src/workspace.ts`, depois rode `npm run db:migrate`. Não é preciso recompilar o frontend.

## Integrações não configuradas
- **E-mail (SMTP):** sem SMTP, a recuperação de senha informa na tela que o envio não está configurado. Em desenvolvimento, o link aparece no log do servidor.
- **Cobrança/integração bancária:** não implementada. Recebimentos são registrados manualmente.
