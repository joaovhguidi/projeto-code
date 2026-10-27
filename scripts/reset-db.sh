#!/usr/bin/env bash
# Apaga e recria os bancos de desenvolvimento e teste (use com cuidado).
set -euo pipefail
for DB in nexo nexo_test; do sudo -u postgres psql -q -c "DROP DATABASE IF EXISTS ${DB} WITH (FORCE)"; done
bash "$(dirname "$0")/setup-db.sh"
