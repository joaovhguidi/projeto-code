-- =====================================================================
-- Nexo Business — esquema inicial
-- Convenções:
--  * Toda tabela de dados empresariais possui company_id e UNIQUE(company_id, id).
--  * Chaves estrangeiras entre módulos são compostas (company_id, x_id), o que
--    impede no próprio banco que um registro aponte para dados de outra empresa.
--  * Row Level Security é habilitado (e forçado) em todas as tabelas com
--    company_id; a API define app.company_id a cada transação.
--  * Valores monetários usam numeric(14,2); quantidades numeric(14,3).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE FUNCTION current_company_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.company_id', true), '')::uuid $$;

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ---------------------------------------------------------------------
-- Identidade e acesso
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  email         citext NOT NULL UNIQUE,
  phone         text,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE business_segments (
  key         text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]+$'),
  name        text NOT NULL,
  icon        text NOT NULL DEFAULT 'store',
  description text NOT NULL DEFAULT '',
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order  int NOT NULL DEFAULT 100,
  active      boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE companies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  document            text,
  document_type       text CHECK (document_type IN ('cpf','cnpj')),
  phone               text,
  email               citext,
  city                text,
  state               char(2),
  segment_key         text NOT NULL REFERENCES business_segments(key),
  custom_segment      text,
  description         text,
  employees_range     text,
  main_offerings      text,
  goals               text[] NOT NULL DEFAULT '{}',
  difficulties        text[] NOT NULL DEFAULT '{}',
  timezone            text NOT NULL DEFAULT 'America/Sao_Paulo',
  opening_hours       jsonb NOT NULL DEFAULT '{}'::jsonb,
  preferences         jsonb NOT NULL DEFAULT '{}'::jsonb,
  onboarding_done     boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER companies_touch BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text NOT NULL UNIQUE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id  uuid REFERENCES companies(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  ip          text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE password_resets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Equipe (antes de company_members, que pode apontar para um funcionário)
-- ---------------------------------------------------------------------
CREATE TABLE employees (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  role_title      text,
  responsibilities text,
  phone           text,
  email           citext,
  document        text,
  hire_date       date,
  work_schedule   text,
  color           text NOT NULL DEFAULT '#0E9670',
  status          text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','ferias','afastado','desligado')),
  notes           text,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);
CREATE INDEX employees_company_idx ON employees(company_id, name);

CREATE TABLE company_members (
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('proprietario','gerente','financeiro','colaborador')),
  employee_id uuid,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id),
  FOREIGN KEY (company_id, employee_id) REFERENCES employees(company_id, id) ON DELETE SET NULL (employee_id)
);
CREATE INDEX company_members_user_idx ON company_members(user_id);

CREATE TABLE employee_trainings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  title       text NOT NULL,
  kind        text NOT NULL DEFAULT 'treinamento' CHECK (kind IN ('treinamento','documento','certificado')),
  completed_on date,
  expires_on  date,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, employee_id) REFERENCES employees(company_id, id) ON DELETE CASCADE
);

CREATE TABLE activity_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  summary     text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_company_idx ON activity_log(company_id, created_at DESC);
CREATE INDEX activity_log_entity_idx ON activity_log(company_id, entity, entity_id);

-- ---------------------------------------------------------------------
-- Clientes e cadastros relacionados
-- ---------------------------------------------------------------------
CREATE TABLE customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  phone       text,
  whatsapp    text,
  email       citext,
  document    text,
  birth_date  date,
  address     text,
  relationship text NOT NULL DEFAULT 'ativo' CHECK (relationship IN ('novo','ativo','vip','em_risco','inativo')),
  notes       text,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);
CREATE INDEX customers_company_name_idx ON customers(company_id, lower(name));

CREATE TABLE pets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  name        text NOT NULL,
  species     text NOT NULL DEFAULT 'cachorro',
  breed       text,
  size        text CHECK (size IN ('mini','pequeno','medio','grande','gigante')),
  birth_date  date,
  weight_kg   numeric(6,2) CHECK (weight_kg IS NULL OR weight_kg > 0),
  allergies   text,
  next_return date,
  notes       text,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE vehicles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  plate       text NOT NULL,
  brand       text,
  model       text NOT NULL,
  year        int CHECK (year IS NULL OR year BETWEEN 1900 AND 2100),
  color       text,
  mileage     int CHECK (mileage IS NULL OR mileage >= 0),
  notes       text,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, plate),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers(company_id, id) ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------
-- Fornecedores e produtos
-- ---------------------------------------------------------------------
CREATE TABLE suppliers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  contact_name  text,
  phone         text,
  email         citext,
  document      text,
  category      text,
  address       text,
  products_supplied text,
  lead_time_days int CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  quality_rating int CHECK (quality_rating BETWEEN 1 AND 5),
  reliability_rating int CHECK (reliability_rating BETWEEN 1 AND 5),
  notes         text,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);

CREATE TABLE products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku          text,
  barcode      text,
  name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  category     text,
  unit         text NOT NULL DEFAULT 'un',
  supplier_id  uuid,
  cost_price   numeric(14,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  sale_price   numeric(14,2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  stock_qty    numeric(14,3) NOT NULL DEFAULT 0,
  min_stock    numeric(14,3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  track_expiry boolean NOT NULL DEFAULT false,
  expiry_date  date,
  active       boolean NOT NULL DEFAULT true,
  notes        text,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, supplier_id) REFERENCES suppliers(company_id, id) ON DELETE SET NULL (supplier_id)
);
CREATE UNIQUE INDEX products_sku_uniq ON products(company_id, lower(sku)) WHERE sku IS NOT NULL AND archived_at IS NULL;
CREATE INDEX products_company_name_idx ON products(company_id, lower(name));

CREATE TABLE stock_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL,
  type          text NOT NULL CHECK (type IN ('entrada','saida','ajuste','venda','estorno_venda','perda','compra')),
  quantity      numeric(14,3) NOT NULL CHECK (quantity <> 0),  -- variação com sinal
  balance_after numeric(14,3) NOT NULL,
  unit_cost     numeric(14,2),
  reason        text,
  reference_type text,
  reference_id  uuid,
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, product_id) REFERENCES products(company_id, id) ON DELETE RESTRICT
);
CREATE INDEX stock_movements_product_idx ON stock_movements(company_id, product_id, created_at DESC);

CREATE TABLE supplier_quotes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL,
  product_id  uuid,
  description text NOT NULL,
  price       numeric(14,2) NOT NULL CHECK (price >= 0),
  quoted_on   date NOT NULL DEFAULT current_date,
  valid_until date,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, supplier_id) REFERENCES suppliers(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, product_id) REFERENCES products(company_id, id) ON DELETE SET NULL (product_id)
);

-- ---------------------------------------------------------------------
-- Financeiro
-- ---------------------------------------------------------------------
CREATE TABLE finance_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('receita','despesa')),
  system_key text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, kind, name)
);

CREATE TABLE financial_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('receita','despesa')),
  description   text NOT NULL CHECK (length(description) BETWEEN 2 AND 200),
  category_id   uuid,
  amount        numeric(14,2) NOT NULL CHECK (amount > 0),
  amount_paid   numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  competence_date date NOT NULL,
  due_date      date NOT NULL,
  paid_at       date,  -- data em que o valor foi quitado por completo
  status        text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','parcial','pago','cancelado')),
  payment_method text,
  customer_id   uuid,
  supplier_id   uuid,
  sale_id       uuid,
  purchase_id   uuid,
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','venda','compra','ordem_servico','desperdicio','manutencao','entrega')),
  reference_id  uuid,
  installment   text,
  notes         text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  canceled_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  CHECK (amount_paid <= amount),
  FOREIGN KEY (company_id, category_id) REFERENCES finance_categories(company_id, id) ON DELETE SET NULL (category_id),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers(company_id, id) ON DELETE SET NULL (customer_id),
  FOREIGN KEY (company_id, supplier_id) REFERENCES suppliers(company_id, id) ON DELETE SET NULL (supplier_id)
);
CREATE INDEX fin_tx_company_due_idx ON financial_transactions(company_id, due_date);
CREATE INDEX fin_tx_company_comp_idx ON financial_transactions(company_id, competence_date);
-- uma venda gera no máximo um lançamento de receita (evita receita duplicada)
CREATE UNIQUE INDEX fin_tx_sale_uniq ON financial_transactions(company_id, sale_id) WHERE sale_id IS NOT NULL;
CREATE UNIQUE INDEX fin_tx_reference_uniq ON financial_transactions(company_id, source, reference_id) WHERE reference_id IS NOT NULL;
CREATE UNIQUE INDEX fin_tx_purchase_uniq ON financial_transactions(company_id, purchase_id) WHERE purchase_id IS NOT NULL;

CREATE TABLE transaction_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL,
  amount         numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_on        date NOT NULL,
  method         text,
  notes          text,
  reversed_at    timestamptz,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, transaction_id) REFERENCES financial_transactions(company_id, id) ON DELETE CASCADE
);
CREATE INDEX tx_payments_tx_idx ON transaction_payments(company_id, transaction_id);
CREATE INDEX tx_payments_date_idx ON transaction_payments(company_id, paid_on);

CREATE TABLE collection_contacts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL,
  contacted_at   timestamptz NOT NULL DEFAULT now(),
  channel        text NOT NULL CHECK (channel IN ('telefone','whatsapp','email','presencial','outro')),
  outcome        text NOT NULL DEFAULT 'sem_resposta' CHECK (outcome IN ('sem_resposta','prometeu_pagar','negociado','recusou','pago')),
  promised_date  date,
  notes          text,
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, transaction_id) REFERENCES financial_transactions(company_id, id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- Serviços, agenda
-- ---------------------------------------------------------------------
CREATE TABLE services (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name             text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  description      text,
  category         text,
  duration_minutes int NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 1440),
  price            numeric(14,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  estimated_cost   numeric(14,2) NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  active           boolean NOT NULL DEFAULT true,
  archived_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);

CREATE TABLE appointments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid,
  employee_id uuid,
  service_id  uuid,
  pet_id      uuid,
  title       text,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado','confirmado','concluido','cancelado','falta')),
  price       numeric(14,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  notes       text,
  sale_id     uuid,
  canceled_reason text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  CHECK (ends_at > starts_at),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers(company_id, id) ON DELETE SET NULL (customer_id),
  FOREIGN KEY (company_id, employee_id) REFERENCES employees(company_id, id) ON DELETE SET NULL (employee_id),
  FOREIGN KEY (company_id, service_id) REFERENCES services(company_id, id) ON DELETE SET NULL (service_id),
  FOREIGN KEY (company_id, pet_id) REFERENCES pets(company_id, id) ON DELETE SET NULL (pet_id),
  -- impede dois atendimentos ativos sobrepostos para o mesmo profissional
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    company_id WITH =, employee_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (employee_id IS NOT NULL AND status IN ('agendado','confirmado','concluido'))
);
CREATE INDEX appointments_company_start_idx ON appointments(company_id, starts_at);

-- ---------------------------------------------------------------------
-- Vendas
-- ---------------------------------------------------------------------
CREATE TABLE company_counters (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       text NOT NULL,
  value      bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, name)
);

CREATE TABLE sales (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number         bigint NOT NULL,
  customer_id    uuid,
  employee_id    uuid,
  sold_at        timestamptz NOT NULL DEFAULT now(),
  status         text NOT NULL DEFAULT 'concluida' CHECK (status IN ('concluida','cancelada')),
  subtotal       numeric(14,2) NOT NULL CHECK (subtotal >= 0),
  discount       numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total          numeric(14,2) NOT NULL CHECK (total >= 0),
  cost_total     numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL CHECK (payment_method IN ('dinheiro','pix','cartao_debito','cartao_credito','boleto','transferencia','a_prazo','outro')),
  payment_status text NOT NULL DEFAULT 'pago' CHECK (payment_status IN ('pago','pendente')),
  due_date       date,
  source         text NOT NULL DEFAULT 'balcao' CHECK (source IN ('balcao','orcamento','ordem_servico','agendamento','pedido')),
  source_id      uuid,
  notes          text,
  cancel_reason  text,
  canceled_at    timestamptz,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  CHECK (total = subtotal - discount),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers(company_id, id) ON DELETE SET NULL (customer_id),
  FOREIGN KEY (company_id, employee_id) REFERENCES employees(company_id, id) ON DELETE SET NULL (employee_id)
);
CREATE INDEX sales_company_date_idx ON sales(company_id, sold_at DESC);

CREATE TABLE sale_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sale_id     uuid NOT NULL,
  product_id  uuid,
  service_id  uuid,
  description text NOT NULL,
  quantity    numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price  numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  discount    numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total       numeric(14,2) NOT NULL CHECK (total >= 0),
  unit_cost   numeric(14,2) NOT NULL DEFAULT 0,
  UNIQUE (company_id, id),
  CHECK (NOT (product_id IS NOT NULL AND service_id IS NOT NULL)),
  FOREIGN KEY (company_id, sale_id) REFERENCES sales(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, product_id) REFERENCES products(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, service_id) REFERENCES services(company_id, id) ON DELETE RESTRICT
);
CREATE INDEX sale_items_sale_idx ON sale_items(company_id, sale_id);

ALTER TABLE financial_transactions
  ADD FOREIGN KEY (company_id, sale_id) REFERENCES sales(company_id, id) ON DELETE RESTRICT;
ALTER TABLE appointments
  ADD FOREIGN KEY (company_id, sale_id) REFERENCES sales(company_id, id) ON DELETE SET NULL (sale_id);

-- ---------------------------------------------------------------------
-- Compras de fornecedores
-- ---------------------------------------------------------------------
CREATE TABLE purchases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id   uuid NOT NULL,
  ordered_on    date NOT NULL,
  expected_on   date,
  received_on   date,
  status        text NOT NULL DEFAULT 'pedido' CHECK (status IN ('pedido','recebido','cancelado')),
  total         numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  delivered_on_time boolean,
  notes         text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, supplier_id) REFERENCES suppliers(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE purchase_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  purchase_id uuid NOT NULL,
  product_id  uuid,
  description text NOT NULL,
  quantity    numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost   numeric(14,2) NOT NULL CHECK (unit_cost >= 0),
  total       numeric(14,2) NOT NULL CHECK (total >= 0),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, purchase_id) REFERENCES purchases(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, product_id) REFERENCES products(company_id, id) ON DELETE RESTRICT
);
ALTER TABLE financial_transactions
  ADD FOREIGN KEY (company_id, purchase_id) REFERENCES purchases(company_id, id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------
-- Orçamentos e ordens de serviço
-- ---------------------------------------------------------------------
CREATE TABLE quotes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number       bigint NOT NULL,
  customer_id  uuid,
  title        text NOT NULL,
  status       text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','enviado','aprovado','recusado','expirado','convertido')),
  issued_on    date NOT NULL,
  valid_until  date NOT NULL,
  subtotal     numeric(14,2) NOT NULL DEFAULT 0,
  discount     numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total        numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  cost_total   numeric(14,2) NOT NULL DEFAULT 0,
  estimated_hours numeric(8,2),
  terms        text,
  notes        text,
  converted_sale_id uuid,
  converted_work_order_id uuid,
  sent_at      timestamptz,
  decided_at   timestamptz,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  CHECK (valid_until >= issued_on),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers(company_id, id) ON DELETE SET NULL (customer_id),
  FOREIGN KEY (company_id, converted_sale_id) REFERENCES sales(company_id, id) ON DELETE SET NULL (converted_sale_id)
);

CREATE TABLE quote_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id    uuid NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('servico','material','mao_de_obra','produto')),
  product_id  uuid,
  service_id  uuid,
  description text NOT NULL,
  quantity    numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost   numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  unit_price  numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  discount    numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total       numeric(14,2) NOT NULL CHECK (total >= 0),
  position    int NOT NULL DEFAULT 0,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, quote_id) REFERENCES quotes(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, product_id) REFERENCES products(company_id, id) ON DELETE SET NULL (product_id),
  FOREIGN KEY (company_id, service_id) REFERENCES services(company_id, id) ON DELETE SET NULL (service_id)
);

CREATE TABLE work_orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number       bigint NOT NULL,
  customer_id  uuid,
  vehicle_id   uuid,
  employee_id  uuid,
  title        text NOT NULL,
  problem      text,
  diagnosis    text,
  status       text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_andamento','aguardando_pecas','concluida','entregue','cancelada')),
  opened_on    date NOT NULL,
  due_date     date,
  completed_on date,
  total        numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  cost_total   numeric(14,2) NOT NULL DEFAULT 0,
  estimated_hours numeric(8,2),
  actual_hours numeric(8,2),
  quote_id     uuid,
  sale_id      uuid,
  notes        text,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers(company_id, id) ON DELETE SET NULL (customer_id),
  FOREIGN KEY (company_id, vehicle_id) REFERENCES vehicles(company_id, id) ON DELETE SET NULL (vehicle_id),
  FOREIGN KEY (company_id, employee_id) REFERENCES employees(company_id, id) ON DELETE SET NULL (employee_id),
  FOREIGN KEY (company_id, quote_id) REFERENCES quotes(company_id, id) ON DELETE SET NULL (quote_id),
  FOREIGN KEY (company_id, sale_id) REFERENCES sales(company_id, id) ON DELETE SET NULL (sale_id)
);
ALTER TABLE quotes ADD FOREIGN KEY (company_id, converted_work_order_id)
  REFERENCES work_orders(company_id, id) ON DELETE SET NULL (converted_work_order_id);

CREATE TABLE work_order_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('servico','material','mao_de_obra','produto')),
  product_id    uuid,
  service_id    uuid,
  description   text NOT NULL,
  quantity      numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost     numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  unit_price    numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  discount      numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total         numeric(14,2) NOT NULL CHECK (total >= 0),
  position      int NOT NULL DEFAULT 0,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, work_order_id) REFERENCES work_orders(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, product_id) REFERENCES products(company_id, id) ON DELETE SET NULL (product_id),
  FOREIGN KEY (company_id, service_id) REFERENCES services(company_id, id) ON DELETE SET NULL (service_id)
);

-- ---------------------------------------------------------------------
-- Tarefas
-- ---------------------------------------------------------------------
CREATE TABLE tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title        text NOT NULL CHECK (length(title) BETWEEN 2 AND 160),
  description  text,
  assignee_id  uuid,
  priority     text NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa','media','alta','urgente')),
  status       text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','bloqueada','concluida')),
  start_date   date,
  due_date     date,
  completed_at timestamptz,
  project      text,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
  FOREIGN KEY (company_id, assignee_id) REFERENCES employees(company_id, id) ON DELETE SET NULL (assignee_id)
);
CREATE INDEX tasks_company_due_idx ON tasks(company_id, status, due_date);

CREATE TABLE task_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  task_id    uuid NOT NULL,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  body       text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, task_id) REFERENCES tasks(company_id, id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- Entregas
-- ---------------------------------------------------------------------
CREATE TABLE deliveries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number        bigint NOT NULL,
  customer_id   uuid,
  sale_id       uuid,
  recipient_name text NOT NULL,
  recipient_phone text,
  address       text NOT NULL,
  neighborhood  text,
  description   text,
  courier_id    uuid,
  scheduled_for timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','em_preparacao','saiu_para_entrega','concluida','problema','cancelada')),
  delivered_at  timestamptz,
  fee           numeric(14,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  cost          numeric(14,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  distance_km   numeric(8,2),
  notes         text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers(company_id, id) ON DELETE SET NULL (customer_id),
  FOREIGN KEY (company_id, sale_id) REFERENCES sales(company_id, id) ON DELETE SET NULL (sale_id),
  FOREIGN KEY (company_id, courier_id) REFERENCES employees(company_id, id) ON DELETE SET NULL (courier_id)
);
CREATE INDEX deliveries_company_sched_idx ON deliveries(company_id, scheduled_for);

CREATE TABLE delivery_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('status','ocorrencia')),
  status      text,
  note        text,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, delivery_id) REFERENCES deliveries(company_id, id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- Escalas
-- ---------------------------------------------------------------------
CREATE TABLE shifts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  date        date NOT NULL,
  kind        text NOT NULL DEFAULT 'turno' CHECK (kind IN ('turno','folga','ferias','indisponivel')),
  start_time  time,
  end_time    time,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  CHECK (kind <> 'turno' OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)),
  FOREIGN KEY (company_id, employee_id) REFERENCES employees(company_id, id) ON DELETE CASCADE,
  CONSTRAINT shifts_no_overlap EXCLUDE USING gist (
    company_id WITH =, employee_id WITH =,
    tsrange(date + coalesce(start_time, '00:00'), date + coalesce(end_time, '23:59:59'), '[)') WITH &&
  )
);
CREATE INDEX shifts_company_date_idx ON shifts(company_id, date);

CREATE TABLE shift_swap_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shift_id      uuid NOT NULL,
  requester_id  uuid NOT NULL,
  target_employee_id uuid,
  reason        text NOT NULL,
  status        text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','recusada')),
  decided_at    timestamptz,
  decided_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, shift_id) REFERENCES shifts(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, requester_id) REFERENCES employees(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, target_employee_id) REFERENCES employees(company_id, id) ON DELETE SET NULL (target_employee_id)
);

-- ---------------------------------------------------------------------
-- Manutenção
-- ---------------------------------------------------------------------
CREATE TABLE equipment (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         text NOT NULL,
  category     text,
  brand        text,
  model        text,
  serial       text,
  location     text,
  purchase_date date,
  status       text NOT NULL DEFAULT 'operando' CHECK (status IN ('operando','com_defeito','em_manutencao','desativado')),
  preventive_interval_days int CHECK (preventive_interval_days IS NULL OR preventive_interval_days > 0),
  next_preventive_on date,
  notes        text,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);

CREATE TABLE maintenance_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_id  uuid NOT NULL,
  type          text NOT NULL DEFAULT 'corretiva' CHECK (type IN ('corretiva','preventiva')),
  problem       text NOT NULL,
  solution      text,
  scheduled_on  date,
  completed_on  date,
  responsible   text,
  supplier_id   uuid,
  status        text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_andamento','concluida','cancelada')),
  cost          numeric(14,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, equipment_id) REFERENCES equipment(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, supplier_id) REFERENCES suppliers(company_id, id) ON DELETE SET NULL (supplier_id)
);

-- ---------------------------------------------------------------------
-- Desperdícios
-- ---------------------------------------------------------------------
CREATE TABLE waste_records (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id  uuid,
  description text NOT NULL,
  quantity    numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit        text NOT NULL DEFAULT 'un',
  unit_cost   numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  total_cost  numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  reason      text NOT NULL CHECK (reason IN ('vencido','danificado','perdido','erro_preparo','sobra','furto','outro')),
  occurred_on date NOT NULL,
  stock_movement_id uuid,
  notes       text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, product_id) REFERENCES products(company_id, id) ON DELETE SET NULL (product_id)
);
CREATE INDEX waste_company_date_idx ON waste_records(company_id, occurred_on);

-- ---------------------------------------------------------------------
-- Avaliações e reclamações
-- ---------------------------------------------------------------------
CREATE TABLE feedbacks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id  uuid,
  type         text NOT NULL CHECK (type IN ('elogio','sugestao','reclamacao','avaliacao')),
  rating       int CHECK (rating BETWEEN 1 AND 5),
  channel      text,
  title        text NOT NULL,
  description  text,
  responsible_id uuid,
  status       text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_analise','resolvida','arquivada')),
  due_date     date,
  received_on  date NOT NULL,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers(company_id, id) ON DELETE SET NULL (customer_id),
  FOREIGN KEY (company_id, responsible_id) REFERENCES employees(company_id, id) ON DELETE SET NULL (responsible_id)
);

CREATE TABLE feedback_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feedback_id uuid NOT NULL,
  description text NOT NULL,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, feedback_id) REFERENCES feedbacks(company_id, id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- Fidelização
-- ---------------------------------------------------------------------
CREATE TABLE loyalty_campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  goal        text,
  audience    text NOT NULL DEFAULT 'todos' CHECK (audience IN ('todos','inativos','recorrentes','novos','vip')),
  channel     text,
  offer       text,
  start_date  date NOT NULL,
  end_date    date,
  status      text NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada','ativa','encerrada')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE customer_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  campaign_id uuid,
  contacted_on date NOT NULL,
  channel     text NOT NULL CHECK (channel IN ('telefone','whatsapp','email','presencial','redes_sociais','outro')),
  outcome     text NOT NULL DEFAULT 'sem_resposta' CHECK (outcome IN ('sem_resposta','interessado','retornou','agendou','nao_interessado')),
  returned_on date,
  notes       text,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, campaign_id) REFERENCES loyalty_campaigns(company_id, id) ON DELETE SET NULL (campaign_id)
);

-- ---------------------------------------------------------------------
-- Documentos
-- ---------------------------------------------------------------------
CREATE TABLE documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title        text NOT NULL,
  category     text NOT NULL DEFAULT 'outros',
  description  text,
  issued_on    date,
  expires_on   date,
  responsible  text,
  restricted   boolean NOT NULL DEFAULT true,
  current_version int NOT NULL DEFAULT 0,
  archived_at  timestamptz,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);

CREATE TABLE document_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id  uuid NOT NULL,
  version      int NOT NULL,
  storage_key  text NOT NULL,
  file_name    text NOT NULL,
  mime_type    text NOT NULL,
  size_bytes   bigint NOT NULL,
  sha256       text NOT NULL,
  uploaded_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (document_id, version),
  FOREIGN KEY (company_id, document_id) REFERENCES documents(company_id, id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- Central de solicitações e problemas
-- ---------------------------------------------------------------------
CREATE TABLE issues (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title        text NOT NULL,
  category     text NOT NULL CHECK (category IN ('equipamento','sistema','processo','infraestrutura','pessoas','outro')),
  description  text,
  priority     text NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa','media','alta','urgente')),
  responsible_id uuid,
  status       text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_andamento','resolvida','cancelada')),
  due_date     date,
  resolved_at  timestamptz,
  equipment_id uuid,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, responsible_id) REFERENCES employees(company_id, id) ON DELETE SET NULL (responsible_id),
  FOREIGN KEY (company_id, equipment_id) REFERENCES equipment(company_id, id) ON DELETE SET NULL (equipment_id)
);

CREATE TABLE issue_updates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  issue_id   uuid NOT NULL,
  body       text NOT NULL,
  status     text,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, issue_id) REFERENCES issues(company_id, id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- Dicas (estado das recomendações por empresa)
-- ---------------------------------------------------------------------
CREATE TABLE tip_states (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tip_key     text NOT NULL,
  fingerprint text NOT NULL,         -- muda quando o dado que originou a dica muda
  status      text NOT NULL CHECK (status IN ('concluida','dispensada')),
  title       text NOT NULL,
  snapshot    jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);
CREATE INDEX tip_states_company_idx ON tip_states(company_id, tip_key, created_at DESC);

-- ---------------------------------------------------------------------
-- Gatilhos de updated_at
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns
           WHERE table_schema = 'public' AND column_name = 'updated_at'
             AND table_name NOT IN ('companies','business_segments')
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t || '_touch', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Row Level Security: isolamento por empresa
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c.table_name FROM information_schema.columns c
           JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
           WHERE c.table_schema = 'public' AND c.column_name = 'company_id'
             AND tb.table_type = 'BASE TABLE'
             AND c.table_name NOT IN ('company_members','sessions')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY company_isolation ON %I USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id())', t);
  END LOOP;
END $$;

-- A tabela companies usa o próprio id. A criação ocorre durante o cadastro,
-- quando a API já definiu app.company_id com o id gerado para a nova empresa.
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
CREATE POLICY company_self ON companies USING (id = current_company_id()) WITH CHECK (id = current_company_id());

-- company_members: o usuário enxerga as próprias associações (para escolher a
-- empresa ativa) e as da empresa atual (para gestão da equipe).
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_members FORCE ROW LEVEL SECURITY;
CREATE POLICY members_scope ON company_members
  USING (company_id = current_company_id() OR user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (company_id = current_company_id());

-- Permissões para o papel da aplicação (sem ser dono => RLS sempre aplicado)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexo_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO nexo_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexo_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexo_app';
    EXECUTE 'REVOKE UPDATE, DELETE ON activity_log FROM nexo_app';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON business_segments FROM nexo_app';
  END IF;
END $$;

-- Lista as empresas às quais o usuário autenticado pertence. Executa como dono
-- (BYPASSRLS) porém filtra estritamente por app.user_id.
CREATE FUNCTION list_user_companies()
RETURNS TABLE (company_id uuid, name text, segment_key text, role text, onboarding_done boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, c.segment_key, m.role, c.onboarding_done
    FROM company_members m JOIN companies c ON c.id = m.company_id
   WHERE m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
     AND m.active
   ORDER BY c.created_at
$$;
REVOKE ALL ON FUNCTION list_user_companies() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexo_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION list_user_companies() TO nexo_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexo_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nexo_app';
  END IF;
END $$;
