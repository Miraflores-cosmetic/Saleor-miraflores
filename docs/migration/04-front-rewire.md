# Фаза 4 — Front → Админ панель 2.0

**Статус:** Done locally (2026-08-27). Smoke: `npm run dev` (Vite) + Nest `:3001` + Next BFF `:3010`.

## Решения

- Только Nest `http://127.0.0.1:3001/api/v1` — без Saleor dual-flag.
- Бренд админки: **Админ панель 2.0**.
- Checkout: localStorage lines + `POST /catalog/cart/sync` + `POST /orders` + ЮKassa в Nest.
- Доставка: СДЭК + Яндекс ПВЗ через Next BFF `:3010` (`/api/cdek/service`, `/api/yandex-delivery`).
- Done = local Front без запросов к Saleor GraphQL/REST.

## Порядок модулей

1. Auth + me  
2. Catalog / PDP / categories / tags / collections / search  
3. Cart + checkout + YooKassa + shipping BFF  
4. Profile addresses + orders  
5. Promo / certificates / favorites / reviews / quiz-content / CMS  

## Парк (не блокирует фазу 4)

- Quiz results / ЛК «Мой уход»
- Orders ETL
- `CatalogTag.group` / полный care_stage
- MoySklad, 1С
- Фаза 5 cutover

Users/addresses ETL: `node migrate.mjs --apply --step=users` (+ `addresses`).

## Env Front

```
VITE_API_URL=/api/v1
VITE_UPLOADS_ORIGIN=http://127.0.0.1:3001
VITE_YANDEX_MAP_API_KEY=…
```

Vite proxy: `/api/v1` → `:3001`, `/api/cdek` + `/api/yandex-delivery` → `:3010`.
