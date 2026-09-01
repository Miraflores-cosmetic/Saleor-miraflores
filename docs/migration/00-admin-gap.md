# Фаза 0 — Admin gap: Saleor Dashboard vs Jcos `/admin`

## Решение

Операторы переходят на **Jcos Next admin** (`/admin`). Saleor Dashboard после cutover не используется.

---

## Что уже есть в Jcos

| Раздел Jcos | Path | Покрывает из Saleor |
|-------------|------|---------------------|
| Дашборд | `/admin` | Базовая аналитика (не полный Saleor) |
| Каталог | `/admin/catalog`, `/products` | Products, variants, images, stock, price |
| Категории / теги | catalog | Categories; зоны ≈ CatalogTag |
| Коллекции | `/admin/collections` | Collections |
| Наборы | `/admin/product-sets` | Sets / nabory |
| Пользователи | `/admin/users` | Customers |
| Заказы | `/admin/orders` | Orders + fulfillment |
| Оплата/возвраты | orders_finance ACL | mark-paid, refund |
| Скидки / промо | `/admin/discounts`, `/promo` | Vouchers / promotions (упрощённо) |
| Сертификаты | `/admin/certificates` | Gift cards (другая модель) |
| Блог | `/admin/blog` | Pages-статьи (частично) |
| FAQ / staff | `/admin/settings` | Site settings / staff |

---

## Чего не хватает для Miraflores (допилить в Jcos)

| Раздел / возможность | Зачем | Приоритет |
|----------------------|-------|-----------|
| **Отзывы** — список, approve/reject, edit | ProductReview на витрине | **Must** |
| **Квиз-контент** — ключи текстов/медиа | Страница подбора ухода | **Must** (вместе с quiz API) |
| **Pages CMS** — steps, progress-bar, pre-header, about/cart text | Сейчас Saleor Pages | Must для порога доставки / шагов |
| **Care stage** | Этапы ухода, фильтры | **Must** → `CatalogTag` group `care_stage` |
| **Favorites** | Избранное на витрине | **Must** |
| **Подарки за сумму** | Правила gratitude / gift variants | Must |
| **Модерация quiz results** (опционально) | ЛК «Мой уход» | Could |
| **Склады / зоны доставки** Saleor-style | Упростить до stock на variant | DROP сложных зон |
| **Apps / Plugins / Webhooks Saleor** | — | DROP; свои интеграции |
| **Translations Saleor** | — | Could later |
| **Channels multi** | Один магазин | DROP |

---

## Моделирование (ваш акцент)

Saleor: ProductType + Attribute + AttributeValue + assignments.  
Jcos сегодня: фиксированные HTML-поля + volume/SKU + shades + CatalogTag.

**Зафиксировано sign-off (до ETL):**

1. **Care stages** → `CatalogTag` group `care_stage` (ETL: Saleor attribute values → tags).  
2. **Объём** → уже `ProductVariant.volumeMl` / name.  
3. **Произвольные attrs карточки** (если нужны) → JSON `attributes` на Product *или* лёгкая таблица `ProductField` (ключ/значение) — не полный Saleor Attribute graph в MVP.  
4. Контент квиза/steps → `CmsPage` / `CmsKeyValue` (slug + JSON/HTML), админка «Контент».

---

## ACL

Использовать существующие `AdminSectionId` Jcos.  
Новые разделы (reviews, cms, quiz) → добавить в `@jcos/admin-sections` при реализации.

---

## Чеклист обучения операторов (Фаза 5)

- [ ] Создать товар с 2 вариантами и фото  
- [ ] Выставить сток и цену  
- [ ] Провести тестовый заказ: оплата → packing → ship  
- [ ] Выписать промокод / сертификат  
- [ ] (когда будет) Одобрить отзыв  
- [ ] (когда будет) Править progress-bar / quiz ключ  
