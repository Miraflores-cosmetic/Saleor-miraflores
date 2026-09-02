# Deploy — Miraflores 3.0

Прод: **https://miraflores-shop.com**  
VPS: `root@91.229.8.83` · код: `/opt/miraflores` · static Front: `/var/www/miraflores-front`

См. также [structure.md](./structure.md).

---

## Архитектура на сервере

```
https://miraflores-shop.com/
  /                 → Vite static (/var/www/miraflores-front)
  /api/v1/          → Nest miraflores-api :3001
  /api/v1/1c/exchange → Nest (обмен 1С, Basic Auth)
  /uploads/         → Nest (локальные файлы)
  /admin            → Next miraflores-admin :3010
  /api/cdek|yandex… → Next BFF :3010
  /api/yookassa/…   → Next BFF :3010

Postgres docker miraflores_db :5432 (только localhost)
systemd: miraflores-api, miraflores-admin
nginx: deploy/nginx/miraflores.conf
```

---

## Репозитории и ключи

| Что | GitHub | SSH-ключ (файл) | fingerprint |
|-----|--------|-----------------|-------------|
| Front (Vite) | [Front-end-site](https://github.com/Miraflores-cosmetic/Front-end-site) | `~/.ssh/id_ed25519_deploy_front` (**mira-ap**) | `SHA256:0KU4WY20…` |
| Backend + Admin + packages | [Back-miraflores](https://github.com/Miraflores-cosmetic/Back-miraflores) | `~/.ssh/id_ed25519_deploy` (**mira-ssh**) | `SHA256:GMNL1Nj+…` |
| SSH на VPS | — | `~/.ssh/id_ed25519_mira_ap` | `SHA256:s3mOKq3…` |

`Front/` — **отдельный** git внутри папки. Корень монорепо (`backend`, `Admin`, `packages`, `deploy`) → `Back-miraflores`. `Front/` в mono `.gitignore`.

У deploy keys на GitHub нужно **Allow write access**.

---

## Локальный конфиг деплоя

```bash
cp deploy/deploy.env.example deploy/deploy.env
# правьте ключи / Yandex Map key при необходимости
chmod +x deploy/scripts/*.sh
```

`deploy/deploy.env` **не коммитится**. Секреты на VPS (`backend/.env`, `Admin/.env.local`) скрипты не затирают.

---

## Рутинный деплой

### Front

```bash
./deploy/scripts/deploy-front.sh
./deploy/scripts/deploy-front.sh -m "описание коммита"
./deploy/scripts/deploy-front.sh --rsync          # без GitHub
./deploy/scripts/deploy-front.sh --skip-push      # SHA уже на GitHub
```

Скрипт: push (mira-ap) → на VPS `git reset --hard` / rsync → `npm ci` → `build` → rsync в `/var/www/miraflores-front`.

Перед `npm ci` на сервере скрипт делает `unset NODE_ENV` (иначе не ставятся vite / types).

### Backend + Admin

```bash
./deploy/scripts/deploy-backend.sh                 # api + admin
./deploy/scripts/deploy-backend.sh --api
./deploy/scripts/deploy-backend.sh --admin
./deploy/scripts/deploy-backend.sh --rsync         # без GitHub (часто удобнее)
./deploy/scripts/deploy-backend.sh --skip-push
./deploy/scripts/deploy-backend.sh -m "описание"
./deploy/scripts/deploy-backend.sh --force-push    # только если надо перезаписать origin/main
```

Скрипт: push (mira-ssh) или rsync → на VPS `npm ci` → build packages → prisma migrate (если `--api`) → build api/admin → `systemctl restart`.

Health:

```bash
curl -sf https://miraflores-shop.com/api/v1/health
# на VPS:
systemctl status miraflores-api miraflores-admin
journalctl -u miraflores-api -n 50 --no-pager
```

---

## Ручной push (без скрипта)

```bash
# бэк
cd "/Users/ap/Projects/Miraflores 3.0"
export GIT_SSH_COMMAND='ssh -i ~/.ssh/id_ed25519_deploy -o IdentitiesOnly=yes'
git push origin main

# фронт
cd "/Users/ap/Projects/Miraflores 3.0/Front"
export GIT_SSH_COMMAND='ssh -i ~/.ssh/id_ed25519_deploy_front -o IdentitiesOnly=yes'
git push origin main
```

---

## Секреты на VPS (не в git)

| Файл | Назначение |
|------|------------|
| `/opt/miraflores/backend/.env` | DB, JWT, SMTP, ЮKassa, CDEK, uploads, `FRONTEND_PUBLIC_URL`, `ONEC_LOGIN` / `ONEC_PASSWORD` |
| `/opt/miraflores/Admin/.env.local` | `NEXT_PUBLIC_*`, Yandex Delivery, CDEK, webhook secret |
| `/opt/miraflores/Front/.env` | пишет скрипт деплоя (`VITE_API_URL=/api/v1`, Yandex Map) |
| `/opt/miraflores/deploy/.env` | пароль Postgres для docker-compose |

Обязательные для почты staff/заказов: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `FRONTEND_PUBLIC_URL`.

Проверка приглашений сотрудников:

```bash
journalctl -u miraflores-api --since "3 hours ago" --no-pager \
  | grep -iE "staff_created|Staff admin welcome|SMTP not configured"
```

Успех: `Staff admin welcome email sent to …`

---

## Mixed Content (картинки с localhost)

1. Front: `uploadsUrl()` переписывает `http://127.0.0.1:3001/...` → `/uploads/...` (нужен redeploy front).
2. Опционально в БД:

```bash
docker exec -i miraflores_db psql -U miraflores -d miraflores \
  < /opt/miraflores/deploy/scripts/fix-localhost-urls.sql
```

---

## Первичный wipe / поднять с нуля

Одноразовые скрипты (Saleor → Miraflores уже сделан на проде; ниже — на случай нового хоста):

1. `deploy/scripts/00-survey.sh` — разведка
2. `deploy/scripts/01-backup-saleor.sh` — бэкап
3. Postgres: `deploy/docker-compose.yml` → `miraflores_db`
4. systemd: `deploy/systemd/miraflores-*.service`
5. nginx: `deploy/nginx/miraflores.conf`
6. `npm ci` + prisma migrate + build + restart (или `./deploy/scripts/deploy-backend.sh --rsync` + `deploy-front.sh --rsync`)

Smoke: health API, `/admin/login`, витрина, checkout.
