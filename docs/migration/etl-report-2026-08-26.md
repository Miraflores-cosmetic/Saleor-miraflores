# ETL report — 2026-08-26 (local)

**Source:** `saleor_etl` ← `dumps/saleor_dump_2025-12-17.sql`  
**Target:** local Postgres `jcos`  
**Command:** `node scripts/etl/migrate.mjs --apply --step=catalog`

## Result (обновлено 2026-08-26 prod dump)

Источник: `dumps/saleor_dump_2026-08-26-prod.sql`

| Entity | Dump | В Jcos |
|--------|------|--------|
| Products | 69 | 69 ETL, все **active** |
| Variants | 100 | 100 |
| Media rows | 252 | 252 images (8 товаров без media) |
| Categories | 25 | 25 |
| Collections | 7 | (каталог; collections step later) |
| Reviews | 20 | schema Phase 3 |
| Pages | 46 | Phase 3 CMS |
| Users | 3114 | skip |
| Orders | 18 | skip |

Public API total ≈ seed + 69 Mira active.


## Data quality (dump)

| Issue | Count | Action |
|-------|-------|--------|
| `is_published=false` on channel `miraflores-site` | 38 / 48 | Imported as `active=false` (correct) |
| Variant `price_amount = 0` | 42 / 51 | Stored as price 0 |
| Empty SKU | 42 | Generated `saleor-v{id}` |
| warehouse_stock rows | 1 | Almost all stock=0 |
| Reviews / favorites / quiz | empty | Defer to Phase 3 + fresh dump |

**Public API** shows ~37 active products (10 Miraflores published + seed). Inactive Miraflores goods видны в `/admin`.

## Samples OK

- `gidrolat-roza` — active, VRNT-001, 100 мл, 103 ₽, tag toning  
- `enzimnyi-muss-…` — care-stage-ochishchenie-etap-1  

## Next

1. Users / addresses / orders ETL  
2. Media copy (8 files in dump — low; need prod media)  
3. Fresh **prod** `pg_dump` before trusting catalog completeness  
4. Phase 3 schema: reviews, favorites, quiz  
