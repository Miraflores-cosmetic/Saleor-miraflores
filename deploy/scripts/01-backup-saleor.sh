#!/usr/bin/env bash
# Бэкап Saleor на VPS перед wipe. Запуск НА СЕРВЕРЕ.
#   bash deploy/scripts/01-backup-saleor.sh
set -euo pipefail
STAMP="$(date +%Y-%m-%d_%H%M)"
OUT_DIR="/root/miraflores-wipe-backup_${STAMP}"
mkdir -p "$OUT_DIR"

echo "==> backup dir: $OUT_DIR"

# nginx
if [[ -d /etc/nginx ]]; then
  tar -czf "$OUT_DIR/nginx.tgz" -C /etc nginx || true
fi

# Saleor compose project (best-effort)
for d in /root/Saleor-miraflores /root/saleor /opt/saleor /var/www/saleor; do
  if [[ -f "$d/docker-compose.yml" ]] || [[ -f "$d/compose.yml" ]]; then
    echo "Saleor project: $d"
    echo "$d" > "$OUT_DIR/saleor_path.txt"
    tar -czf "$OUT_DIR/saleor_project_config.tgz" \
      --exclude='node_modules' --exclude='.git' \
      -C "$(dirname "$d")" "$(basename "$d")" 2>/dev/null || true
    break
  fi
done

DB_CTR=$(docker ps --format '{{.Names}}' | grep -E 'saleor_db|^db$' | head -1 || true)
if [[ -z "${DB_CTR}" ]]; then
  DB_CTR=$(docker ps --format '{{.Names}}' | grep -i postgres | head -1 || true)
fi
if [[ -n "${DB_CTR}" ]]; then
  echo "DB container: $DB_CTR"
  USER=$(docker exec "$DB_CTR" printenv POSTGRES_USER 2>/dev/null || echo saleor)
  DBNAME=$(docker exec "$DB_CTR" printenv POSTGRES_DB 2>/dev/null || echo saleor)
  docker exec "$DB_CTR" pg_dump -U "$USER" -d "$DBNAME" --no-owner --no-acl -f /tmp/saleor_wipe_dump.sql
  docker cp "$DB_CTR:/tmp/saleor_wipe_dump.sql" "$OUT_DIR/saleor_dump.sql"
  ls -lh "$OUT_DIR/saleor_dump.sql"
else
  echo "WARN: no postgres container — dump skipped"
fi

# media volume (best-effort)
VOL=$(docker volume ls -q | grep -E 'media' | head -1 || true)
if [[ -n "$VOL" ]]; then
  echo "media volume: $VOL"
  docker run --rm -v "$VOL":/media -v "$OUT_DIR":/out alpine \
    tar -czf /out/saleor_media.tgz -C /media . || true
fi

ls -lah "$OUT_DIR"
echo "OK backup → $OUT_DIR"
echo "Скачай на Mac: scp -r root@HOST:$OUT_DIR ~/Downloads/"
