# Стратегия миграции (обновлено 2026-08-27)

**Админ панель 2.0** = Nest API (`backend/`) + Next admin (`Admin/`) в монорепо Miraflores 3.0 (замена Saleor Dashboard).  
Витрина = Vite `Front/` → только API Админ панели 2.0. Источник UI раньше жил в репо Jcos; канон теперь `Admin/`.

## Порядок

```
Фаза 0 ✅  ADR + Must/Should
Фаза 1 ✅  Local API :3001, Admin :3010
Фаза 2 ✅  ETL каталог/медиа/CMS/users (local); orders ETL — парк
Фаза 3 ✅  reviews, favorites, quiz content, CMS, gratitude, home sets…
Фаза 4 ✅  Перевязка Miraflores Front → API Админ панели 2.0 (без Saleor)
Фаза 5  ▶  Cutover на том же VPS
```

## Фаза 4 (кратко)

См. [04-front-rewire.md](./04-front-rewire.md).

- Hard cut: только `VITE_API_URL` → Nest `/api/v1`
- Checkout = localStorage + cart/sync + POST /orders + ЮKassa Nest
- CDEK / Яндекс Delivery → BFF Next `:3010`
- Парк: quiz results, users/orders ETL, CatalogTag.group

## Cutover (Фаза 5) — тот же VPS

1. Финальный `pg_dump` Saleor + медиа.  
2. Финальный ETL → Postgres на VPS.  
3. Nginx: Front → `/api/v1`; `/admin` → Next `Admin/` (Админ панель 2.0); CDEK/Yandex BFF.  
4. Остановить Saleor.  
5. DNS/TLS без смены домена витрины.

До Фазы 5 прод Saleor **не трогаем**.

## Local сейчас

| Сервис | URL |
|--------|-----|
| API (`backend/`, jcos-api) | http://localhost:3001/api/v1 |
| Админ + BFF (`Admin/`) | http://localhost:3010/admin/login |
| Miraflores Front | http://localhost:5173 (→ API + BFF) |
| Источник ETL | dump `dumps/saleor_dump_*.sql` |

```bash
npm run dev:api     # :3001
npm run dev:admin   # :3010
```
