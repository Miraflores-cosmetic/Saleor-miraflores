#!/usr/bin/env bash
# Fresh Saleor dump from Miraflores prod → local saleor_etl
#
# Requires working SSH to the VPS (key authorized for DEPLOY_HOST).
#
#   export DEPLOY_HOST=root@91.229.8.83
#   export DEPLOY_SSH_KEY=~/.ssh/YOUR_VPS_KEY
#   ./scripts/etl/dump-from-prod.sh
#
# Or run the remote block manually on the server, scp the file, then:
#   ./scripts/etl/restore-saleor-dump.sh dumps/saleor_dump_YYYY-MM-DD.sql
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="${DEPLOY_HOST:-root@91.229.8.83}"
KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519_mira_ap}"
STAMP="$(date +%Y-%m-%d)"
OUT="$ROOT/dumps/saleor_dump_${STAMP}.sql"
REMOTE_OUT="/tmp/saleor_dump_${STAMP}.sql"

SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes)
SCP=(scp -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes)

echo "==> test SSH $HOST (key: $KEY)"
if ! "${SSH[@]}" "$HOST" 'echo ssh_ok'; then
  echo ""
  echo "SSH failed. Ключ для GitHub (id_ed25519_mira_ap) на VPS не принят."
  echo "Запусти dump на сервере и скачай файл:"
  cat <<'MANUAL'
# --- на VPS ---
cd ~/Saleor-miraflores   # или путь к compose
DB=$(docker compose ps -q db 2>/dev/null || docker ps -qf name=saleor_db)
docker exec "$DB" pg_dump -U saleor -d saleor --no-owner --no-acl -f /tmp/saleor_dump.sql
docker cp "$DB":/tmp/saleor_dump.sql /tmp/saleor_dump.sql
ls -lh /tmp/saleor_dump.sql

# --- на Mac ---
scp root@91.229.8.83:/tmp/saleor_dump.sql \
  "/Users/ap/Projects/Miraflores 3.0/dumps/saleor_dump_$(date +%Y-%m-%d).sql"
MANUAL
  exit 1
fi

echo "==> remote pg_dump"
"${SSH[@]}" "$HOST" "STAMP='$STAMP' bash -s" <<'REMOTE'
set -euo pipefail
DB_CTR=$(docker ps --format '{{.Names}}' | grep -E 'saleor_db|^db$' | head -1 || true)
if [[ -z "${DB_CTR}" ]]; then
  DB_CTR=$(docker ps --format '{{.Names}}' | grep -i postgres | head -1 || true)
fi
echo "DB container: ${DB_CTR:?no db container}"
USER=$(docker exec "$DB_CTR" printenv POSTGRES_USER 2>/dev/null || echo saleor)
DBNAME=$(docker exec "$DB_CTR" printenv POSTGRES_DB 2>/dev/null || echo saleor)
INSIDE=/tmp/saleor_dump_inside.sql
OUT=/tmp/saleor_dump_${STAMP}.sql
docker exec "$DB_CTR" pg_dump -U "$USER" -d "$DBNAME" --no-owner --no-acl -f "$INSIDE"
docker cp "$DB_CTR:$INSIDE" "$OUT"
ls -lh "$OUT"
REMOTE

echo "==> scp → $OUT"
"${SCP[@]}" "$HOST:$REMOTE_OUT" "$OUT"
ls -lh "$OUT"

echo "==> restore local saleor_etl"
"$ROOT/scripts/etl/restore-saleor-dump.sh" "$OUT"

echo "OK: $OUT"
echo "Next: cd scripts/etl && npm run inventory && node migrate.mjs --apply --step=catalog && npm run migrate:media"
