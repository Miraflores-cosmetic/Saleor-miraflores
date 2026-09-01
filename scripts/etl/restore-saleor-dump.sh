#!/usr/bin/env bash
# Restore Saleor dump into local Postgres DB saleor_etl (ETL source).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DUMP="${1:-$ROOT/dumps/saleor_dump_2026-08-26-prod.sql}"
HOST="${PGHOST:-localhost}"
DB="${SALEOR_ETL_DB:-saleor_etl}"

if [[ ! -f "$DUMP" ]]; then
  echo "Dump not found: $DUMP" >&2
  exit 1
fi

psql -h "$HOST" -d postgres -v ON_ERROR_STOP=0 -c \
  "DO \$\$ BEGIN CREATE ROLE saleor LOGIN PASSWORD 'saleor'; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;"

dropdb -h "$HOST" --if-exists "$DB"
createdb -h "$HOST" -O saleor "$DB"
psql -h "$HOST" -d "$DB" -v ON_ERROR_STOP=0 -c \
  "CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS unaccent;" || true

# PG16+ dump may contain \restrict — strip for restore
grep -vE '^\\restrict |^\\unrestrict ' "$DUMP" | psql -h "$HOST" -d "$DB" -v ON_ERROR_STOP=0

# Dump restores as current OS user; ETL connects as role saleor
psql -h "$HOST" -d "$DB" -v ON_ERROR_STOP=0 -c "
  GRANT ALL ON SCHEMA public TO saleor;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO saleor;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO saleor;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO saleor;
"

echo "---"
psql -h "$HOST" -d "$DB" -c \
  "SELECT 'product' t, COUNT(*) n FROM product_product
   UNION ALL SELECT 'variant', COUNT(*) FROM product_productvariant
   UNION ALL SELECT 'user', COUNT(*) FROM account_user
   UNION ALL SELECT 'order', COUNT(*) FROM order_order
   ORDER BY 1;"
echo "OK: $DB ready. SALEOR_DATABASE_URL=postgresql://saleor:saleor@$HOST:5432/$DB"
