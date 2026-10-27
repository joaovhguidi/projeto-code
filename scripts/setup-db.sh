#!/usr/bin/env bash
# Cria os papéis e bancos PostgreSQL usados pelo Nexo Business.
#  - nexo_owner: dono das tabelas (executa migrações)
#  - nexo_app:   papel usado pela API; NÃO é dono das tabelas, então as
#                políticas de Row Level Security sempre se aplicam a ele.
set -euo pipefail
OWNER_PASS="${NEXO_OWNER_PASSWORD:-nexo_owner_dev}"
APP_PASS="${NEXO_APP_PASSWORD:-nexo_app_dev}"
PSQL="sudo -u postgres psql -v ON_ERROR_STOP=1 -q"
if ! command -v sudo >/dev/null || [ "$(id -u)" != "0" ] && [ -n "${PGHOST:-}" ]; then PSQL="psql -v ON_ERROR_STOP=1 -q"; fi

$PSQL <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexo_owner') THEN
    CREATE ROLE nexo_owner LOGIN BYPASSRLS PASSWORD '${OWNER_PASS}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexo_app') THEN
    CREATE ROLE nexo_app LOGIN PASSWORD '${APP_PASS}' NOSUPERUSER NOBYPASSRLS;
  END IF;
END \$\$;
SQL

for DB in nexo nexo_test; do
  if ! $PSQL -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB}'" | grep -q 1; then
    $PSQL -c "CREATE DATABASE ${DB} OWNER nexo_owner"
  fi
  $PSQL -d "${DB}" -c "CREATE EXTENSION IF NOT EXISTS btree_gist; CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS pgcrypto;"
  $PSQL -d "${DB}" -c "GRANT CONNECT ON DATABASE ${DB} TO nexo_app;"
done
echo "Bancos 'nexo' e 'nexo_test' prontos. Rode: npm run db:migrate"
