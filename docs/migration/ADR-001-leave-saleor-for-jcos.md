# ADR-001: Отказ от Saleor в пользу Jcos

- **Статус:** Accepted (sign-off 2026-08-26)  
- **Дата:** 2026-08-26  
- **Контекст:** Miraflores 3.0 (витрина Vite/React + forked Saleor + Saleor Dashboard)

### Product decisions (sign-off)

- Favorites, Reviews, Quiz — **Must** до cutover.  
- Care stages → **CatalogTag** (group `care_stage`), не отдельная сущность.

## Решение

1. **Витрина** — оставляем текущий `Miraflores 3.0/Front` (не Next-storefront Jcos).  
2. **Backend** — переходим на Jcos NestJS API (`/api/v1`, Prisma, PostgreSQL).  
3. **Админка** — Jcos Next `/admin` (не Saleor Dashboard).  
4. **Данные** — сохраняем через ETL Saleor Postgres → Jcos Postgres; дамп Saleor остаётся архивом.  
5. **Master после cutover** — Jcos. Интеграции (МойСклад, 1С) пишем в Jcos, не в Saleor.  
6. **Сиды/платежи/доставка** — переиспользуем Jcos (YooKassa, CDEK/Yandex quote, OTP, промо, сертификаты).

## Почему

- Каркас Jcos проще и масштабируемее forked Saleor.  
- Каталог, заказы, оплаты, ЛК, промо в Jcos уже реализованы и оттестированы.  
- Кастом Miraflores (квиз, отзывы, атрибуты/`care_stage`, CMS-страницы) доделываем в Jcos, а не тащим Saleor дальше.

## Последствия

| Плюс | Минус / работа |
|------|----------------|
| Единый понятный REST | Front: замена GraphQL-клиентов на REST |
| Своя админка в монорепо Jcos | Нет Saleor Attribute* — нужна модель attrs/tags |
| Проще 1С/МС sync | ETL паролей: reset/OTP |
| Меньше fork-долга Saleor | Допилить: reviews, quiz, favorites, page CMS, gift-by-subtotal |

## Не делаем

- Не подключаем Jcos Prisma к БД Saleor «как есть».  
- Не оставляем dual-write Saleor+Jcos в проде после cutover.  
- Не мигрируем витрину на Next Jcos в этой фазе (только API + admin).

## Ссылки

- Jcos: `/Users/ap/Projects/Jcos` (`docs/STRUCTURE.md`)  
- Miraflores Front: `/Users/ap/Projects/Miraflores 3.0/Front`  
- Инвентарь: `00-api-mapping.md`, `00-feature-go-nogo.md`, `00-admin-gap.md`
