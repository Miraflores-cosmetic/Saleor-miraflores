/**
 * Общие функции для работы с API Мой Склад.
 * Используется sync.js и webhook-server.js.
 */

const MOYSKLAD_BASE = 'https://api.moysklad.ru/api/remap/1.2';

export const WAREHOUSE_NAME_MS = 'Склад МАГАЗИН';
export const COUNTERPARTY_NAME_MS = 'Интернет-магазин';

function getEnv(name) {
  const v = process.env[name];
  if (v === undefined || v === null || v === '') throw new Error(`Не задана переменная окружения: ${name}`);
  return String(v).trim();
}

function getEnvOptional(name) {
  const v = process.env[name];
  return v != null && v !== '' ? String(v).trim() : null;
}

export function getMoyskladAuthHeaders() {
  const token = getEnvOptional('MOYSKLAD_TOKEN');
  if (token) return { Authorization: `Bearer ${token}` };
  const login = getEnv('MOYSKLAD_LOGIN');
  const password = getEnv('MOYSKLAD_PASSWORD');
  const auth = Buffer.from(`${login}:${password}`, 'utf8').toString('base64');
  return { Authorization: `Basic ${auth}` };
}

export async function moyskladFetch(pathname, options = {}) {
  const url = pathname.startsWith('http') ? pathname : `${MOYSKLAD_BASE}${pathname}`;
  const authHeaders = getMoyskladAuthHeaders();
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
      Accept: 'application/json;charset=utf-8',
      'Accept-Encoding': 'gzip',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Мой Склад API ${res.status}: ${text}`);
  }
  return res.json();
}

/** Получить первую организацию (или по имени). */
export async function getOrganization(name) {
  const path = name
    ? `/entity/organization?filter=name=${encodeURIComponent(name)}`
    : '/entity/organization?limit=1';
  const data = await moyskladFetch(path);
  const rows = data.rows || data.content || (Array.isArray(data) ? data : []);
  const first = rows[0];
  if (!first || !first.meta?.href) throw new Error('Организация в МС не найдена');
  return first;
}

/** Получить склад по имени. */
export async function getStoreByName(storeName) {
  const data = await moyskladFetch(
    `/entity/store?filter=name=${encodeURIComponent(storeName)}&limit=1`
  );
  const rows = data.rows || data.content || (Array.isArray(data) ? data : []);
  const store = rows[0];
  if (!store || !store.meta?.href) throw new Error(`Склад "${storeName}" в МС не найден`);
  return store;
}

/** Найти контрагента по имени; если нет — создать. */
export async function getOrCreateCounterparty(name = COUNTERPARTY_NAME_MS) {
  const data = await moyskladFetch(
    `/entity/counterparty?filter=name=${encodeURIComponent(name)}&limit=1`
  );
  const rows = data.rows || data.content || (Array.isArray(data) ? data : []);
  if (rows[0]?.meta?.href) return rows[0];
  const org = await getOrganization();
  const created = await moyskladFetch('/entity/counterparty', {
    method: 'POST',
    body: {
      name,
      organization: { meta: org.meta },
    },
  });
  if (!created?.meta?.href) throw new Error('Не удалось создать контрагента в МС');
  return created;
}

/**
 * Найти номенклатуру (товар или модификацию) по артикулу.
 * В API МС не у всех сущностей есть filter=article, поэтому ищем через search и сверяем article в ответе.
 * Возвращает { meta } для использования в позиции реализации.
 */
export async function findAssortmentByArticle(article) {
  if (!article || String(article).trim() === '') return null;
  const want = String(article).trim();
  const q = encodeURIComponent(want);
  const [productRes, variantRes] = await Promise.all([
    moyskladFetch(`/entity/product?search=${q}&limit=50`),
    moyskladFetch(`/entity/variant?search=${q}&limit=50`),
  ]);
  const productRows = productRes.rows || productRes.content || (Array.isArray(productRes) ? productRes : []);
  const variantRows = variantRes.rows || variantRes.content || (Array.isArray(variantRes) ? variantRes : []);
  const byArticle = (row) => (row.article != null && String(row.article).trim() === want) || (row.code != null && String(row.code).trim() === want);
  const v = variantRows.find(byArticle);
  if (v?.meta?.href) return { meta: v.meta };
  const p = productRows.find(byArticle);
  if (p?.meta?.href) return { meta: p.meta };
  return null;
}

/**
 * Создать документ «Реализация» (demand).
 * @param {Array<{ sku: string, quantity: number }>} positions - артикул (SKU) и количество
 * @param {object} options - { storeName, counterpartyName, description }
 * @returns {Promise<{ id, meta }>} созданный документ
 */
export async function createDemand(positions, options = {}) {
  const storeName = options.storeName || WAREHOUSE_NAME_MS;
  const counterpartyName = options.counterpartyName || COUNTERPARTY_NAME_MS;

  const [organization, store, agent] = await Promise.all([
    getOrganization(),
    getStoreByName(storeName),
    getOrCreateCounterparty(counterpartyName),
  ]);

  const demandPositions = [];
  for (const { sku, quantity } of positions) {
    const assortment = await findAssortmentByArticle(sku);
    if (!assortment) continue;
    demandPositions.push({
      quantity: Math.max(1, Math.floor(Number(quantity)) || 1),
      assortment: { meta: assortment.meta },
    });
  }

  if (demandPositions.length === 0) {
    throw new Error('Нет ни одной позиции с найденным в МС артикулом (SKU)');
  }

  const body = {
    organization: { meta: organization.meta },
    agent: { meta: agent.meta },
    store: { meta: store.meta },
    positions: demandPositions,
  };
  if (options.description) body.description = String(options.description).slice(0, 1000);

  const created = await moyskladFetch('/entity/demand', { method: 'POST', body });
  return created;
}
