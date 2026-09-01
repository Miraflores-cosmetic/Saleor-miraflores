/** Верхняя граница page size для admin list (collections / sets / products). */
export const ADMIN_LIST_MAX_LIMIT = 100;

/** Дефолтный page size списков админки (users / orders / products). */
export const ADMIN_LIST_DEFAULT_LIMIT = 20;

/** Public storefront product list defaults (keep in sync with FE PUBLIC_CATALOG_PAGE_SIZE).
 *  note: price_ / popular / sale filters load matching pool in memory — fine for small catalogs;
 *  scale path = denormalized sort keys + DB pagination. */
export const PUBLIC_PRODUCTS_DEFAULT_LIMIT = 48;
export const PUBLIC_PRODUCTS_MAX_LIMIT = 100;
