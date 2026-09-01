# Фаза 0 — API mapping: Miraflores Front → Jcos

Легенда статуса:

| Статус | Значение |
|--------|----------|
| **OK** | Есть в Jcos, маппится 1:1 или с тонким адаптером |
| **ADAPT** | Есть, но другая модель/контракт — нужна обёртка на Front или небольшой бэк |
| **BUILD** | Нет в Jcos — сделать до cutover витрины |
| **DROP** | Можно убрать / заменить другим UX |
| **KEEP** | Вне Jcos (прокси), перенести env как есть |

База Jcos: `http(s)://{host}/api/v1/...`  
База Saleor сейчас: GraphQL `/graphql/` + кастомный REST.

---

## 1. Auth / сессия

| Front сегодня | Jcos | Статус | Заметки |
|---------------|------|--------|---------|
| `tokenCreate` / REST login | `POST /auth/login` | ADAPT | JWT buyer; cookie/BFF опционально |
| `accountRegister` + email confirm / OTP REST | `POST /auth/register/start\|verify\|complete` | ADAPT | Уже OTP в Jcos |
| `tokenRefresh` | JWT TTL / re-login | ADAPT | Уточнить refresh в Jcos |
| `me` / `GET auth/me` | `GET /auth/me`, `GET /account/me` | OK | |
| password reset | `POST /auth/password-reset/*` | OK | |
| `accountUpdate` / password change | `PATCH /account/me`, `POST /account/me/password` | OK | |
| Staff Saleor token `VITE_SALEOR_TOKEN` | не нужен | DROP | CMS через public API / admin |

---

## 2. Каталог

| Front сегодня | Jcos | Статус | Заметки |
|---------------|------|--------|---------|
| `products` / `product(slug)` | `GET /catalog/products`, `GET /catalog/products/:slug` | ADAPT | Поля rich HTML вместо attrs |
| `category` / дерево | `GET /catalog/categories` (+ admin tree) | ADAPT | |
| `collection` / bestsellers | `GET /catalog/collections` | ADAPT | Перемапить hard-coded Saleor GIDs |
| `productVariants` + stock | variants в product DTO | OK | |
| attribute `care_stage` | `CatalogTag` group `care_stage` | BUILD | Sign-off: только теги |
| `warehouses` / quantityAvailable | `stock` / `stockReserve` на variant | ADAPT | Страна RU — упростить |
| search | `GET /search?q=` | OK | |
| `/api/products/by-care-stage/` | фильтр по CatalogTag | BUILD | |

---

## 3. Корзина / checkout / оплата

| Front сегодня | Jcos | Статус | Заметки |
|---------------|------|--------|---------|
| localStorage checkout + GraphQL checkout | `localStorage` + `POST /catalog/cart/sync` | ADAPT | Близко к Jcos-модели |
| `create-without-stock-check` | `POST /orders` | ADAPT | Политика стока: reserve; без-stock — флаг/настройка |
| `complete-without-stock-check` | pay + webhook YooKassa | ADAPT | |
| `applicable-gift` | — | BUILD | gift-by-subtotal / discount rule |
| `voucher/validate` | `POST /promo/validate` | OK | |
| gift cards Saleor | gift-certificates Jcos | ADAPT | Другая модель (баланс) |
| YooKassa Node `:3002` | Nest orders + webhook | OK | Свести на Jcos |
| CDEK / Yandex proxies | Jcos FE BFF / перенос в Nest | KEEP→ADAPT | Env уже есть в Jcos |

---

## 4. Профиль / адреса / заказы

| Front сегодня | Jcos | Статус |
|---------------|------|--------|
| addresses CRUD | ` /account/addresses` | OK |
| `me.orders` | `GET /account/orders` | ADAPT |
| order by token | `GET /account/orders/:id` | ADAPT |
| favorites REST metadata | — | BUILD |
| quiz results metadata | — | BUILD |

---

## 5. CMS / контент

| Front сегодня (Saleor Page) | Jcos | Статус | Заметки |
|-----------------------------|------|--------|---------|
| Quiz page `podbor-uhoda` + attrs | — | BUILD | Page model или JSON + admin |
| Steps `api/steps` / pageType `shagi` | — | BUILD | |
| Progress-bar `progress-bar-korziny` | — | BUILD | порог бесплатной доставки |
| FAQ pages | `GET /settings/faq` | ADAPT | |
| Articles / blog | `/blog` | ADAPT | |
| Sets `nabory` | ProductSet | ADAPT | |
| Pre-header, about, cart text | static / Page | BUILD | минимум Page CMS |
| Menus → categories | categories API | ADAPT | |

---

## 6. Отзывы

| Front сегодня | Jcos | Статус |
|---------------|------|--------|
| `product.reviews` + create (custom GraphQL) | — | BUILD |
| Dashboard moderation | — | BUILD admin |

---

## 7. Интеграции данных

| Сервис | Сейчас | После | Статус |
|--------|--------|-------|--------|
| МойСклад stock | → Saleor warehouse | → Jcos variant.stock | BUILD rewrite |
| 1С CommerceML | планировалось в Saleor | → Jcos catalog | BUILD later |
| Media `/media/` | Saleor | Jcos `/uploads/` | ADAPT copy files |

---

## 8. Порядок перевязки Front (Фаза 4)

Рекомендуемый порядок модулей:

1. Auth + `me`  
2. Catalog / PDP / categories / collections  
3. Cart sync + checkout + YooKassa  
4. Profile orders + addresses  
5. Promo / certificates  
6. Favorites, reviews, quiz, CMS pages  

Флаг на staging: `VITE_API_BACKEND=jcos|saleor` (опционально).

---

## 9. Итог gap-счётчика (оценка)

| Статус | Кол-во блоков |
|--------|----------------|
| OK | ~12 |
| ADAPT | ~18 |
| BUILD | ~12 (reviews, quiz, favorites, care_stage, pages, gift-subtotal, МС) |
| DROP | ~2 |

**Go на Фазу 1** не блокируется BUILD-списком — блокируется только решение (ADR) и staging.
