# Miraflores Admin (Админ панель 2.0)

Next.js App Router: операторский UI `/admin` + BFF для витрины (`/api/cdek`, `/api/yandex-delivery`, ЮKassa webhook).

Витрина покупателя — Vite `../Front`. Nest API — `../backend`.

## Local

```bash
# из корня монорепо
cp Admin/.env.example Admin/.env.local   # если ещё нет
npm install
npm run dev:api      # :3001
npm run dev:admin    # :3010
```

- Админка: http://localhost:3010/admin/login  
- Seed: `admin@jcos.local` / `change-me-admin` (или `ADMIN_SEED_*` в backend)

Витрина Jcos под `(site)` в этом приложении **не** используется для Miraflores — только `/admin` и BFF.
