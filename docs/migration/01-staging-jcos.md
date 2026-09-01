# Фаза 1 — Staging Jcos рядом с Saleor

**Цель:** поднять Jcos API + Postgres + Admin **без отключения** прод Saleor / витрины Miraflores.  
**Выход:** доступный staging `…/api/v1` + `/admin`, smoke-check каталога и логина админа.  
**Не входит:** ETL данных (Фаза 2), BUILD фич (Фаза 3), перевязка Front (Фаза 4).

---

## Архитектура (рядом)

```
Прод (не трогаем):
  miraflores-shop.com  → Front Vite → Saleor GraphQL/REST
  Saleor Dashboard

Staging (Фаза 1):
  [локально или отдельный host/порт]
  Nest API (Miraflores backend/)  :3001  /api/v1
  Next Admin (Miraflores Admin/)  :3010  /admin  (+ BFF; витрина Next не используется)
  Postgres (отдельная БД, не Saleor)
```

---

## Варианты хостинга

| Вариант | Когда | Примечание |
|---------|-------|------------|
| **A. Local** | Dev / smoke сейчас | `localhost:3001` + `:3000/admin` |
| **B. Отдельный VPS / subdomain** | Команда + операторы | напр. `api-staging.…` + `admin-staging.…` |
| **C. Тот же VPS что Saleor** | Экономия | Другие порты / path / контейнер; **отдельный Postgres**; не ломать docker Saleor |

Рекомендация: **A (local)** до cutover. Remote staging (B/C) **не делаем** — после Фаз 2–4 поднимаем Jcos на том же VPS вместо Saleor (см. [STRATEGY.md](./STRATEGY.md)).

> Существующий деплой продукта Jcos (`scripts/deploy.env`) **не** использовать для Miraflores.

---

## Чеклист

### 1. Postgres Jcos

- [x] БД `jcos` создана (local)
- [x] `DATABASE_URL` в `backend/.env` (монорепо Miraflores)
- [x] `npx prisma migrate deploy` — schema up to date (37 migrations)
- [x] `npx prisma db seed` — админ + категории + теги + товары

### 2. Secrets / env API

- [x] Local `.env` есть (dev secrets)
- [ ] Remote: `JWT_SECRET` / pay / registration secrets ≠ дефолт
- [ ] SMTP на remote staging
- [ ] ЮKassa test shop (можно отложить)

### 3. Env Admin (Next)

- [x] `NEXT_PUBLIC_API_URL` → local API (`Admin/.env.local`)
- [ ] Remote URLs

### 4. Процессы

- [x] API local `:3001` — running
- [x] Web local `:3010` — running
- [x] `GET /api/v1/health` → OK
- [x] Login admin API → 201
- [x] Seed-каталог виден в public API
- [ ] Remote deploy (вариант B/C)

### 5. Изоляция от Saleor

- [x] Прод Front не переключён
- [x] Saleor не трогали
- [x] Отдельная БД `jcos`

---

## Критерий Done Фазы 1

1. Health API отвечает.  
2. Админ логинится.  
3. Виден seed-каталог (или создан тестовый товар с вариантом и стоком).  
4. Документ заполнен: URL staging + кто владеет доступом.  
5. Saleor прод без изменений.

| Поле | Значение |
|------|----------|
| API URL | `http://localhost:3001/api/v1` |
| Admin URL | `http://localhost:3010/admin/login` (порт 3000 занят Docker) |
| Postgres | `localhost:5432` / db `jcos` |
| Режим | **Local** (smoke 2026-08-26) |
| Дата smoke | 2026-08-26 |
| Health | `GET /health` → `{"ok":true}` |
| Catalog | `GET /catalog/products` → items (seed ~27 products) |
| Admin login | `POST /auth/admin/login` → 201 |
| Saleor | не трогали |

---

## Команды (local)

```bash
cd "/Users/ap/Projects/Miraflores 3.0"
# Postgres должен слушать; DATABASE_URL в backend/.env

cd backend && npx prisma migrate deploy && npx prisma db seed
cd .. && npm run dev:api     # :3001
# другой терминал
npm run dev:admin            # :3010
```

Проверки:

```bash
curl -s http://localhost:3001/api/v1/health
# Admin: http://localhost:3010/admin/login
# Seed: admin@jcos.local / change-me-admin (или ADMIN_SEED_*)
```

---

## Следом

После Done → **Фаза 2** (ETL dry-run) можно начинать на этой же БД staging (отдельная схема/БД предпочтительнее для повторных прогонов).
