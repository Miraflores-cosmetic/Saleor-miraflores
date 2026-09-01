# Фаза 2 — ETL Saleor → Jcos (local)

**Цель:** перенести данные в локальный Postgres Jcos, отчёт о дырах, идемпотентный повтор.  
**Не входит:** деплой на VPS, перевязка Front, BUILD API (кроме минимальных полей для маппинга).

---

## Источник правды

| Источник | Статус |
|----------|--------|
| Local `saleor_db` (docker) | Пустой каталог — **не использовать** |
| `dumps/saleor_dump_2025-12-17.sql` | Базовый снимок (~48 products, ~3100 users) |
| Прод Saleor | Перед финальным прогоном — новый dump |

Восстановление для ETL:

```bash
./scripts/etl/restore-saleor-dump.sh
# → DATABASE saleor_etl на localhost Postgres
```

---

## Инвентарь dump (2025-12-17)

| Entity | Rows (dump) | → Jcos |
|--------|-------------|--------|
| product_product | 48 | Product |
| product_productvariant | 51 | ProductVariant |
| product_category | 38 | Category (tree) |
| product_collection | 2 | Collection |
| product_productmedia | 8 | ProductImage (+ copy files) |
| product_productreview | 0 в restored dump* | Review (**после** схемы Фазы 3); сверить со свежим prod dump |
| account_user | 3100 | User (пароль **не** переносим → reset/OTP) |
| account_address | 1396 | UserAddress |
| order_order / lines | 5 / 5 | Order / OrderItem |
| attribute care_stage | 5 values | CatalogTag slug `care-stage-*` |
| page_page | 5 | CmsPage / seed JSON (Фаза 3) |
| favorites (metadata/REST) | TBD на свежем dump | Favorite (**после** схемы) |
| `account_user.metadata.quiz_face_latest` | в dump 2025-12 — часто 0; на проде есть | `UserQuizResult` (`--step=quiz`) |

### Care stages (зафиксировано)

Attribute `care_stage` → `CatalogTag`:

| Saleor slug | Tag slug |
|-------------|----------|
| ochishchenie-etap-1 | `care-stage-ochishchenie-etap-1` |
| tonizatsiia-etap-2 | `care-stage-tonizatsiia-etap-2` |
| sos-ukhod-etap-30 | `care-stage-sos-ukhod-etap-30` |
| pitanie-i-uvlazhnenie-etap-31 | `care-stage-pitanie-i-uvlazhnenie-etap-31` |
| vse-etapy-ukhoda | `care-stage-vse-etapy-ukhoda` |
| + hair stages (pered-mytem-golovy, …) | тот же префикс `care-stage-*` |

Фаза 3: поле `CatalogTag.group = 'care_stage'` (сейчас достаточно префикса slug).

**Риск:** 42/51 variants без SKU в dump — ETL генерирует `{productSlug}-{variantId}` или из volume.

### Rich attrs → HTML поля Product

| Saleor attr | Jcos field |
|-------------|------------|
| short_description / product_card_description | shortDescription |
| action_effect / description blocks | descriptionHtml |
| how_to_use | applicationHtml |
| ingredients | compositionHtml |
| storage | storageHtml |
| miraflores_note / important_note | extraHtml (склейка) |

---

## Порядок ETL (скрипт)

1. **inventory** — counts + orphans (dry-run, без записи в Jcos)  
2. **categories** — дерево parent  
3. **care_stage tags**  
4. **products + variants + prices/stock**  
5. **media** — copy `/media` → `backend/.data/local-uploads`  
6. **collections**  
7. **users** — email, phone, name; `passwordHash=null`; metadata → JSON staging  
8. **addresses**  
9. **orders** — snapshot lines; map status  
10. **id map** — таблица/файл `saleorId → jcosId`  
11. *(после Фазы 3 schema)* reviews, favorites, CMS pages  
12. **quiz** — `metadata.quiz_face_latest` → `UserQuizResult` (`--step=quiz`, после users)  

Флаг: `--dry-run` (default) / `--apply`.

Идемпотентность: upsert по `slug` / `sku` / `email`; внешний ключ в `MigrationMap` или metadata.

### Quiz ETL (`--step=quiz`)

Источник: Saleor `account_user.metadata.quiz_face_latest` (JSON object или JSON-строка).

Целевая модель: Prisma `UserQuizResult` (один ряд на buyer).

| Поле Saleor payload | Jcos |
|---------------------|------|
| `version` (default 1) | `version` |
| `zone` (`face`) | `zone` |
| `answers` | `answers` JSON |
| `result.priority` / `result.blockKeys` | `result` JSON |
| `completedAt` ISO | `completedAt` |

Привязка юзера: `MigrationMap` (`User` / `UserUuid`) → fallback `User.email`.  
Идемпотентность: upsert по `userId`.  
Невалидный / не-`face` payload — skip + счётчик.

```bash
node scripts/etl/migrate.mjs --apply --step=users
node scripts/etl/migrate.mjs --apply --step=quiz
# dry-run:
node scripts/etl/migrate.mjs --step=quiz
```

---

## Пароли

Saleor `pbkdf2_sha256` ≠ Jcos bcrypt.  
После ETL: все buyer → «забыли пароль» / OTP. Staff admin — только seed Jcos (`admin@jcos.local`), не импорт Saleor staff.

---

## Чеклист Done Фазы 2

- [x] `saleor_etl` БД восстановлена из dump  
- [x] `npm run inventory` — отчёт OK (48 products, 3100 users, care_stage tags)  
- [x] `--apply --step=catalog` — tags + categories + products/variants  
- [x] Все ETL-товары **active=true** (игнор `is_published`; остатки 0 сохраняем)  
- [x] `--apply --step=media` — скачивание с prod GraphQL → Jcos `/uploads`  
- [x] users / addresses — `--step=users` + `--step=addresses` (пароль null → reset)  
- [ ] orders ETL — парк  
- [ ] quiz ETL — `--step=quiz` (после users; нужен свежий prod dump с `quiz_face_latest`)  
- [ ] отчёт [`etl-report-2026-08-26.md`](./etl-report-2026-08-26.md)  
- [ ] свежий prod dump / полный media sync для 11 товаров без фото  
- [ ] (cutover) финальный dump + media с VPS  

---

## Скрипты

| Path | Назначение |
|------|------------|
| `scripts/etl/restore-saleor-dump.sh` | createdb + restore |
| `scripts/etl/inventory.mjs` | counts + care_stage sample |
| `scripts/etl/migrate.mjs` | apply pipeline (итеративно) |
| `scripts/etl/.env.example` | SALEOR_DATABASE_URL, JCOS_DATABASE_URL |

---

## Следом

После стабильного каталога+юзеров → **Фаза 3** (схема reviews/favorites/quiz) → догон ETL шагов 11 → Фаза 4 Front.
