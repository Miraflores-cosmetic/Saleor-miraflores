# Фаза 0 — Feature Go / No-Go

**Статус Фазы 0:** Signed off (2026-08-26)

Критерии:

- **Go cutover витрины** — все строки `Must` в статусе Done или Accepted workaround.  
- **Go Фаза 1 (staging)** — ADR принят, этот файл согласован → **разрешено**.

---

## Must (блокируют продакшен-cutover)

| # | Фича | Сейчас Saleor | Jcos | Решение | Статус |
|---|------|---------------|------|---------|--------|
| M1 | Каталог + PDP + варианты + цены | GraphQL | catalog API | Перенос + ETL | Open |
| M2 | Остатки / наличие | warehouse | stock + reserve | ADAPT; МС sync rewrite | Open |
| M3 | Корзина + оформление + ЮKassa | custom checkout + Node | POST /orders | ADAPT | Open |
| M4 | Auth buyer (login/register/reset) | Saleor JWT/OTP | Jcos OTP/JWT | ADAPT; пароли → reset | Open |
| M5 | Адреса + история заказов | GraphQL | /account/* | ADAPT | Open |
| M6 | Промокоды | voucher REST | /promo | OK | Open |
| M7 | Доставка CDEK/Yandex quote | Front proxies | Jcos BFF | KEEP env | Open |
| M8 | Бесплатная доставка до ПВЗ (порог) | progress-bar page | BUILD config | Нужен источник порога | Open |
| M9 | Подарок за сумму (gratitude) | applicable-gift | BUILD | Правило discounts или endpoint | Open |
| M10 | Care stages / этапы ухода | attribute care_stage | **CatalogTag** group `care_stage` | Зафиксировано sign-off | Open |
| M11 | Медиа товаров | /media | /uploads | Copy + remap URLs | Open |
| M12 | ETL данных (сохранить БД) | dump | Prisma | Скрипт Фаза 2 | Open |
| M13 | Favorites | REST metadata | BUILD | Must до cutover | Open |
| M14 | Reviews + модерация | custom GraphQL | BUILD + admin | Must до cutover | Open |
| M15 | Quiz face + ЛК «Мой уход» | private_metadata + REST | BUILD + admin | Must до cutover | Open |

---

## Should (желательно до cutover, иначе workaround)

| # | Фича | Jcos | Workaround если не успеем | Статус |
|---|------|------|---------------------------|--------|
| S4 | Gift certificates (сайт) | OK в Jcos | Переключить на Jcos UX | Open |
| S5 | CMS: steps, quiz content, articles | BUILD / blog | Хардкод + JSON seed | Open |
| S6 | Sets / collections главная | ProductSet/Collection | Ручной seed | Open |
| S7 | Admin: pages (steps, progress-bar) | BUILD | Контент через DB seed | Open |

---

## Could (после cutover)

| # | Фича | Комментарий |
|---|------|-------------|
| C1 | 1С CommerceML import | После стабилизации каталога в Jcos |
| C2 | Saleor-like гибкие Attribute* | Не нужны для care_stage (теги); только если tags/fields не хватит |
| C3 | Dual promo+gift stacking | В Jcos сейчас XOR — решить продуктово |
| C4 | Carrier booking (этикетки СДЭК) | Сейчас quote + ручной фулфилмент |

---

## Won’t (в этом проекте)

| # | Что | Почему |
|---|-----|--------|
| W1 | Витрина на Next Jcos | Оставляем Miraflores Vite Front |
| W2 | Подключить Prisma к БД Saleor | Несовместимые схемы |
| W3 | Долгая dual-write Saleor+Jcos | Сложность и рассинхрон |
| W4 | Полный паритет Saleor Dashboard | Только нужные разделы в Jcos admin |

---

## Admin Go/No-Go (операторы)

| Операция | Jcos admin | Статус |
|----------|------------|--------|
| CRUD товары / варианты / сток / цена | `/admin/catalog`, products | OK |
| Категории / коллекции / наборы | catalog, collections, product-sets | OK |
| Заказы: статусы, mark-paid, refund | orders, orders_finance | OK |
| Промокоды / скидки | discounts, promo | OK |
| Сертификаты | certificates | OK |
| Пользователи buyer | users | OK |
| FAQ | settings | OK |
| Блог | blog | OK |
| Модерация отзывов | — | BUILD (Must) |
| Контент квиза / steps / progress-bar | — | BUILD |
| Care stage tags | CatalogTag | BUILD UI если нет |
| Staff ACL | settings/staff | OK |

---

## Sign-off Фазы 0

| Роль | Вопрос | Ответ |
|------|--------|-------|
| Product/Owner | Витрина = Miraflores Front, admin = Jcos? | **Да** (ADR-001 Accepted) |
| Product | Favorites / Reviews / Quiz — Must или Should? | **Must** |
| Product | Care stage — модель? | **CatalogTag** (group `care_stage`) |
| Tech | Пароли: только reset/OTP после ETL? | Да |
| Tech | Master данных после cutover = Jcos? | Да (ADR-001) |

→ **Фаза 1: staging Jcos** разрешена.
