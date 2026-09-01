# Migration Miraflores: Saleor → Админ панель 2.0

Документы перехода с Saleor на Nest API + Next admin **в этом монорепо** (`backend/`, `Admin/`). Ранее UI админки жил в репо Jcos.

| Документ | Содержание |
|----------|------------|
| [ADR-001](./ADR-001-leave-saleor-for-jcos.md) | Архитектурное решение |
| [API mapping](./00-api-mapping.md) | Front → Jcos / gap |
| [Feature Go/No-Go](./00-feature-go-nogo.md) | Обязательные фичи и статус |
| [Admin gap](./00-admin-gap.md) | Разделы админки Saleor vs Jcos |
| [Фаза 1 — Staging](./01-staging-jcos.md) | Local Jcos API + Admin |
| [Стратегия](./STRATEGY.md) | Local → ETL → cutover на том же VPS |
| [Фаза 2 — ETL](./02-etl.md) | Saleor dump → Jcos |
| [Фаза 4 — Front rewire](./04-front-rewire.md) | Miraflores Front → Админ панель 2.0 |
| [ETL report 2026-08-26](./etl-report-2026-08-26.md) | Каталог применён locally |

**Фаза 0:** Signed off.  
**Фаза 1:** Local Done.  
**Фаза 2–3:** CMS/каталог/квиз-контент — Done (users/orders ETL парк).  
**Текущая:** Фаза 4 — перевязка Front.
