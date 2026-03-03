#!/usr/bin/env node
/**
 * Синхронизация остатков: Мой Склад (Склад МАГАЗИН) → Saleor (склад МАГАЗИН).
 * Сопоставление по артикулу (МС) = SKU (Saleor).
 *
 * Переменные окружения:
 *   Вариант 1 — токен из раздела «Токены» (Онлайн-торговля):
 *     MOYSKLAD_TOKEN  — токен, авторизация Bearer
 *   Вариант 2 — логин + пароль приложения:
 *     MOYSKLAD_LOGIN  — логин МС (email)
 *     MOYSKLAD_PASSWORD — пароль приложения МС
 *   SALEOR_GRAPHQL_URL — https://miraflores-shop.com/graphql/
 *   SALEOR_STAFF_EMAIL — email staff-пользователя Saleor
 *   SALEOR_STAFF_PASSWORD — пароль staff-пользователя
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Подгрузить .env из папки скрипта (если не заданы переменные). */
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  let content = fs.readFileSync(envPath, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1); // BOM
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim().replace(/\r$/, '');
    let val = trimmed.slice(eq + 1).trim().replace(/\r$/, '');
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const MOYSKLAD_BASE = 'https://api.moysklad.ru/api/remap/1.2';
const WAREHOUSE_NAME_MS = 'Склад МАГАЗИН';
const SALEOR_WAREHOUSE_ID = 'V2FyZWhvdXNlOjUxNTdiNWFjLTgzMzItNDc5Ni1iYTUxLWY3YjNjNjhmNzE5YQ==';

function getEnv(name) {
  const v = process.env[name];
  if (v === undefined || v === null || v === '') throw new Error(`Не задана переменная окружения: ${name}`);
  return String(v).trim();
}

function getEnvOptional(name) {
  const v = process.env[name];
  return v != null && v !== '' ? String(v).trim() : null;
}

function getMoyskladAuthHeaders() {
  const token = getEnvOptional('MOYSKLAD_TOKEN');
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  const login = getEnv('MOYSKLAD_LOGIN');
  const password = getEnv('MOYSKLAD_PASSWORD');
  const auth = Buffer.from(`${login}:${password}`, 'utf8').toString('base64');
  return { Authorization: `Basic ${auth}` };
}

function log(message, level = 'INFO') {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${message}\n`;
  process.stdout.write(line);
  const logPath = process.env.MOYSKLAD_SYNC_LOG || path.join(process.cwd(), 'moysklad-sync.log');
  try {
    fs.appendFileSync(logPath, line);
  } catch (_) {}
}

async function moyskladFetch(pathname) {
  const url = `${MOYSKLAD_BASE}${pathname}`;
  const authHeaders = getMoyskladAuthHeaders();
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      ...authHeaders,
      Accept: 'application/json;charset=utf-8',
      'Accept-Encoding': 'gzip',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Мой Склад API ${res.status}: ${text}`);
  }
  return res.json();
}

/** Остатки по складам: массив { meta, stockByStore }. В stockByStore: { store: { name }, stock }. */
async function fetchStockByStore() {
  const data = await moyskladFetch('/report/stock/bystore');
  if (Array.isArray(data)) return data;
  return data.rows || data.content || [];
}

/** Получить артикул по ссылке на номенклатуру (entity/product или entity/variant). */
async function fetchArticle(href) {
  if (!href || typeof href !== 'string') return null;
  const fullUrl = href.startsWith('http') ? href : `${MOYSKLAD_BASE}${href}`;
  const authHeaders = getMoyskladAuthHeaders();
  const res = await fetch(fullUrl, {
    method: 'GET',
    headers: {
      ...authHeaders,
      Accept: 'application/json;charset=utf-8',
      'Accept-Encoding': 'gzip',
    },
  });
  if (!res.ok) return null;
  const entity = await res.json();
  return entity.article || entity.code || null;
}

/** Собрать карту артикул -> количество по складу "Склад МАГАЗИН". */
async function getStockMapFromMS() {
  const rows = await fetchStockByStore();
  const map = new Map();
  const limit = 15;
  for (let i = 0; i < rows.length; i += limit) {
    const chunk = rows.slice(i, i + limit);
    await Promise.all(
      chunk.map(async (row) => {
        const store = (row.stockByStore || []).find((s) => (s.store?.name || s.name) === WAREHOUSE_NAME_MS);
        if (!store) return;
        const stock = store.stock ?? store.quantity ?? 0;
        const meta = row.meta || row.assortment?.meta;
        const href = meta?.href;
        const article = href ? await fetchArticle(href) : row.article ?? row.code;
        if (article != null && article !== '') {
          const key = String(article).trim();
          map.set(key, Math.max(0, parseInt(stock, 10) || 0));
        }
      })
    );
  }
  return map;
}

async function saleorTokenCreate(graphqlUrl, email, password) {
  const res = await fetch(graphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `mutation TokenCreate($email: String!, $password: String!) {
        tokenCreate(email: $email, password: $password) {
          token
          errors { code message }
        }
      }`,
      variables: { email, password },
    }),
  });
  const json = await res.json();
  const err = json?.errors?.[0] || json?.data?.tokenCreate?.errors?.[0];
  if (err) {
    const msg = err.message || JSON.stringify(err);
    if (/valid credentials|invalid|credential/i.test(msg)) {
      throw new Error('Saleor: неверный email или пароль. Проверьте SALEOR_STAFF_EMAIL и SALEOR_STAFF_PASSWORD в .env и что этот пользователь есть в админке Saleor (Staff).');
    }
    throw new Error(msg);
  }
  const token = json?.data?.tokenCreate?.token;
  if (!token) throw new Error('Saleor: не получен token');
  return token;
}

async function saleorStocksUpdate(graphqlUrl, token, sku, quantity) {
  const res = await fetch(graphqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: `mutation ProductVariantStocksUpdate($sku: String!, $stocks: [StockInput!]!) {
        productVariantStocksUpdate(sku: $sku, stocks: $stocks) {
          productVariant { id }
          errors { code message }
        }
      }`,
      variables: {
        sku,
        stocks: [{ warehouse: SALEOR_WAREHOUSE_ID, quantity }],
      },
    }),
  });
  const json = await res.json();
  const err = json?.errors?.[0] || json?.data?.productVariantStocksUpdate?.errors?.[0];
  if (err) throw new Error(err.message || JSON.stringify(err));
  return json?.data?.productVariantStocksUpdate?.productVariant != null;
}

async function run() {
  const start = Date.now();
  log('Старт синхронизации Мой Склад → Saleor');

  const graphqlUrl = getEnv('SALEOR_GRAPHQL_URL').replace(/\/?$/, '/');
  const email = getEnv('SALEOR_STAFF_EMAIL');
  const password = getEnv('SALEOR_STAFF_PASSWORD');

  log(`Saleor: ${graphqlUrl}, email: ${email}`);

  let token;
  try {
    token = await saleorTokenCreate(graphqlUrl, email, password);
  } catch (e) {
    log(`Saleor auth: ${e.message}`, 'ERROR');
    process.exitCode = 1;
    return;
  }

  const msToken = getEnvOptional('MOYSKLAD_TOKEN');
  if (!msToken && (!getEnvOptional('MOYSKLAD_LOGIN') || !getEnvOptional('MOYSKLAD_PASSWORD'))) {
    log('Задайте MOYSKLAD_TOKEN (токен из раздела Токены) либо MOYSKLAD_LOGIN и MOYSKLAD_PASSWORD', 'ERROR');
    process.exitCode = 1;
    return;
  }
  log(msToken ? 'Мой Склад: авторизация по токену (Bearer)' : `Мой Склад: логин ${getEnv('MOYSKLAD_LOGIN')}`);

  let stockMap;
  try {
    stockMap = await getStockMapFromMS();
    log(`Мой Склад: получено ${stockMap.size} позиций по складу "${WAREHOUSE_NAME_MS}"`);
  } catch (e) {
    log(`Мой Склад: ${e.message}`, 'ERROR');
    process.exitCode = 1;
    return;
  }

  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const [sku, quantity] of stockMap) {
    if (sku === '' || sku == null) {
      skipped++;
      continue;
    }
    try {
      const ok = await saleorStocksUpdate(graphqlUrl, token, sku, quantity);
      if (ok) updated++;
      else skipped++;
    } catch (e) {
      skipped++;
      errors.push({ sku, message: e.message });
    }
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  log(`Готово за ${duration}s: обновлено ${updated}, пропущено ${skipped}`);
  if (errors.length) log(`Пропущено ${errors.length} SKU (нет в Saleor или ошибка)`, 'WARN');
  log('Конец синхронизации');
}

run().catch((e) => {
  log(String(e), 'ERROR');
  process.exitCode = 1;
});
