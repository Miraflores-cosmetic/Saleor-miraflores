#!/usr/bin/env bash
# Загрузка .env и запуск синхронизации Мой Склад → Saleor.
# Для cron: */30 * * * * /path/to/moysklad-sync/run-sync.sh

cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

exec node sync.js
