# Wipe-деплой Miraflores 3.0 на VPS (с нуля)

**Цель:** снести Saleor-стек, поднять Nest + Next Admin + Vite Front + Postgres `miraflores`.  
**Downtime:** да. **Бэкап перед wipe — обязателен.**

## Архитектура после cutover

```
https://miraflores-shop.com/
  /                 → Vite static (/var/www/miraflores-front)
  /api/v1/          → Nest :3001
  /uploads/         → Nest
  /admin            → Next :3010
  /api/cdek|yandex… → Next BFF :3010

Postgres docker miraflores_db :5432 (localhost only)
```

## Порядок (на сервере)

### 0. Разведка
```bash
bash deploy/scripts/00-survey.sh
```

### 1. Бэкап
```bash
bash deploy/scripts/01-backup-saleor.sh
# scp бэкапа на Mac
```

### 2. Остановить Saleor
```bash
cd ~/Saleor-miraflores   # путь из survey
docker compose down      # БЕЗ -v пока dump не скачан
# после проверки бэкапа на Mac:
# docker compose down -v   # удалит postgres_data Saleor
```

### 3. Подготовить хост
- Node 20 LTS, nginx, docker, certbot (TLS уже есть — сохранить)
- `/opt/miraflores` — код монорепо
- `/var/www/miraflores-front` — `Front/dist`

### 4. Postgres
```bash
cd /opt/miraflores/deploy
cp .env.example .env   # POSTGRES_PASSWORD=...
docker compose up -d
```

### 5. Backend
```bash
cd /opt/miraflores/backend
# .env: DATABASE_URL, JWT_SECRET, ORDER_PAY_SECRET, REGISTRATION_TOKEN_SECRET,
# SMTP, YOOKASSA, CDEK, FRONTEND_PUBLIC_URL=https://miraflores-shop.com
npm ci
npx prisma migrate deploy
npm run build
# systemd: miraflores-api.service → npm run start:prod
```

### 6. Admin
```bash
cd /opt/miraflores/Admin
# NEXT_PUBLIC_API_URL=https://miraflores-shop.com/api/v1
# CDEK/Yandex/YooKassa secrets
npm ci && npm run build
# systemd: miraflores-admin.service → npm run start
```

### 7. Front
```bash
cd /opt/miraflores/Front
# VITE_API_URL=/api/v1
npm ci && npm run build
rsync -a --delete dist/ /var/www/miraflores-front/
```

### 8. Nginx
```bash
cp deploy/nginx/miraflores.conf /etc/nginx/sites-available/miraflores
ln -sfn /etc/nginx/sites-available/miraflores /etc/nginx/sites-enabled/
# отключить старый saleor site
nginx -t && systemctl reload nginx
```

### 9. Данные
- ETL из бэкап-dump → `miraflores` (локально или на сервере)
- media → `LOCAL_UPLOADS_DIR` / CDN

### 10. Smoke
```bash
curl -s https://miraflores-shop.com/api/v1/health
# админ /admin/login, витрина, ATC → checkout
```

## Рутинный деплой (после cutover)

Конфиг: скопировать `deploy/deploy.env.example` → `deploy/deploy.env`.

### Front (git push → pull → build)
```bash
cp deploy/deploy.env.example deploy/deploy.env   # один раз
chmod +x deploy/scripts/*.sh

./deploy/scripts/deploy-front.sh
# или с коммитом:
./deploy/scripts/deploy-front.sh -m "fix: gratitude tier images"
```

Скрипт: push в `Front-end-site` (ключ `id_ed25519_mira_ap` из `deploy.env`) → `git pull` на VPS → build → rsync.

> На GitHub у deploy key для `Front-end-site` должно быть **Allow write access**, иначе push: `denied to deploy key`.  
> Settings → Deploy keys → ключ mira-ap → включить write. Либо `./deploy/scripts/deploy-front.sh --rsync` без push.

> На VPS часто экспортирован `NODE_ENV=production` (из API) — перед `npm ci` в Front: `unset NODE_ENV`, иначе devDependencies (vite, `@types/*`) не установятся.

### Backend + Admin (git push → pull → build → restart)

Репозиторий: **`Miraflores-cosmetic/Back-end-site`** — монорепо `backend` + `Admin` + `packages` + `deploy` (без `Front/`).

**Первый раз (локально), если на GitHub ещё Saleor / чужая история:**

```bash
cd "/Users/ap/Projects/Miraflores 3.0"
# remote уже origin → Back-end-site
./deploy/scripts/deploy-backend.sh --force-push
# или только push без деплоя:
GIT_SSH_COMMAND='ssh -i ~/.ssh/id_ed25519_mira_ap -o IdentitiesOnly=yes' \
  git push --force-with-lease -u origin main
```

`--force-push` делает `git push --force-with-lease` (перезаписывает `origin/main`). Нужен write-access у deploy key.

**Обычный деплой (после того как Miraflores уже на origin):**

```bash
./deploy/scripts/deploy-backend.sh
./deploy/scripts/deploy-backend.sh --admin   # только Next
./deploy/scripts/deploy-backend.sh --rsync   # без GitHub (legacy)
./deploy/scripts/deploy-backend.sh -m "fix: order items table"
```

Ключ push: `FRONT_GIT_PUSH_KEY` / `id_ed25519_mira_ap` в `deploy/deploy.env` (write на deploy key).

На VPS при git-деплое: `git fetch` + `git reset --hard <SHA>`. Секреты (`backend/.env`, `deploy/deploy.env`) в `.gitignore` — на VPS не трогаются.

Если на VPS ещё нет `.git` в `/opt/miraflores` — скрипт сделает `git init` + remote. Пока удобнее `--rsync`, пока не переключите сервер на pull.

### Mixed Content (localhost в URL картинок)
1. **Front:** `uploadsUrl()` переписывает `http://127.0.0.1:3001/...` → `/uploads/...` (нужен redeploy front).
2. **БД (опционально, раз и навсегда):**
```bash
docker exec -i miraflores_db psql -U miraflores -d miraflores \
  < /opt/miraflores/deploy/scripts/fix-localhost-urls.sql
```

## Откат
1. Вернуть nginx на Saleor site  
2. `docker compose up -d` в Saleor-проекте (если volume не удаляли)  
3. Или restore из `/root/miraflores-wipe-backup_*`
