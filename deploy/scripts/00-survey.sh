#!/usr/bin/env bash
# Разведка VPS перед wipe. Запуск:
#   ssh root@HOST 'bash -s' < deploy/scripts/00-survey.sh
set -euo pipefail
echo "=== HOST ==="
hostname; uname -a
df -h / | tail -1
echo "=== DOCKER ==="
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo no-docker
echo "=== COMPOSE FILES ==="
find /root /home /var/www /opt /srv -maxdepth 4 \( -name 'docker-compose*.yml' -o -name 'compose*.yml' \) 2>/dev/null || true
echo "=== NGINX ==="
ls /etc/nginx/sites-enabled 2>/dev/null || true
echo "=== DIRS ==="
ls -la /root 2>/dev/null | head -30
ls -d /root/Saleor* /root/miraflores* /var/www/* /opt/* 2>/dev/null || true
echo "=== LISTEN ==="
ss -tlnp | head -40
echo "=== NODE/PM2 ==="
node -v 2>/dev/null || echo no-node
pm2 list 2>/dev/null || echo no-pm2
