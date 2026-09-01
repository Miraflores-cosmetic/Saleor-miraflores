# Miraflores stack (local)

| Слой | Имя | URL / DSN |
|------|-----|-----------|
| Front | `miraflores-front` | http://localhost:5173 |
| Admin | `miraflores-admin` | http://localhost:3010 |
| API | `miraflores-api` | http://localhost:3001/api/v1 |
| Postgres | DB/role `miraflores` | `postgresql://miraflores:***@localhost:5432/miraflores` |

Saleor (`saleor_etl`) — только источник ETL, не runtime витрины/админки.

SQL RLS-функции `jcos_rls_*` — legacy identifiers внутри Postgres; не путать с продуктом Jcos.

ETL-покупатели без `passwordHash` входят через «Забыли пароль» (первичная установка пароля).
