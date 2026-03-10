#!/usr/bin/env node
/**
 * Сервис приёма webhook Saleor ORDER_FULFILLED / order_fulfillment_confirmation
 * и создания документа «Реализация» в Мой Склад.
 *
 * Защита от дублей: один заказ (или один fulfillment) → один документ в МС.
 * Контрагент в МС: «Интернет-магазин». Склад: «Склад МАГАЗИН».
 * В документ передаются только позиции (артикул = SKU + количество).
 * Опционально в описание можно передать ФИО/телефон/адрес из заказа.
 *
 * Переменные окружения: те же, что в .env для sync.js (MOYSKLAD_*, SALEOR_*),
 * плюс WEBHOOK_SECRET (опционально) для проверки подписи и MOYSKLAD_DEDUP_FILE для файла дедупликации.
 */

import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDemand, WAREHOUSE_NAME_MS, COUNTERPARTY_NAME_MS } from './lib/ms-api.js';
import {
  getAlreadySentDemandId,
  markAsSent,
  getIdempotencyKey,
} from './lib/idempotency.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  let content = fs.readFileSync(envPath, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
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

const LOG_PATH = process.env.MOYSKLAD_SYNC_LOG || path.join(__dirname, 'moysklad-webhook.log');

function log(message, level = 'INFO') {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${message}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch (_) {}
}

/**
 * Извлечь данные из payload Saleor.
 * Поддерживаем:
 * - notify: notify_event order_fulfillment_confirmation → payload.order, payload.physical_lines
 * - sync webhook: order, fulfillment на верхнем уровне (fulfillment.lines с orderLine.variant.sku)
 */
function parsePayload(body) {
  if (!body || typeof body !== 'object') return null;
  let order = body.order;
  let physicalLines = body.physical_lines;
  const payload = body.payload;
  if (payload && typeof payload === 'object') {
    order = order || payload.order;
    physicalLines = physicalLines || payload.physical_lines;
  }
  if (!order?.id) return null;
  if (Array.isArray(physicalLines) && physicalLines.length > 0) {
    return { order, physicalLines };
  }
  const fulfillment = body.fulfillment || payload?.fulfillment;
  const lines = fulfillment?.lines;
  if (Array.isArray(lines) && lines.length > 0) {
    const mapped = lines.map((l) => {
      const ol = l.orderLine || l;
      const variant = ol.variant || {};
      return {
        id: l.id,
        quantity: l.quantity ?? 1,
        order_line: {
          product_sku: variant.sku ?? ol.productSku ?? ol.product_sku,
          quantity: l.quantity ?? ol.quantity,
        },
      };
    });
    return { order, physicalLines: mapped };
  }
  return { order, physicalLines: [] };
}

/**
 * Собрать позиции для МС: артикул (SKU) + количество.
 * physical_lines: [ { order_line: { product_sku, ... }, quantity }, ... ]
 */
function buildPositions(physicalLines) {
  const positions = [];
  for (const line of physicalLines) {
    const orderLine = line.order_line || line;
    const sku = orderLine.product_sku ?? orderLine.product?.sku;
    const qty = line.quantity ?? orderLine.quantity ?? 1;
    if (sku) positions.push({ sku: String(sku).trim(), quantity: qty });
  }
  return positions;
}

/**
 * Краткое описание заказа для комментария в МС (ФИО, телефон, адрес).
 */
function buildDescription(order) {
  const parts = [];
  const addr = order.shipping_address || order.billing_address;
  if (addr) {
    const name = [addr.first_name, addr.last_name].filter(Boolean).join(' ');
    if (name) parts.push(name);
    if (addr.phone) parts.push(`тел: ${addr.phone}`);
    const street = [addr.street_address_1, addr.street_address_2].filter(Boolean).join(', ');
    if (street) parts.push(street);
    const city = [addr.postal_code, addr.city, addr.country].filter(Boolean).join(', ');
    if (city) parts.push(city);
  }
  if (order.email) parts.push(`Email: ${order.email}`);
  if (order.number != null) parts.push(`Заказ #${order.number}`);
  return parts.length ? parts.join(' | ') : '';
}

async function handleOrderFulfilled(req, res) {
  let body;
  try {
    body = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (ch) => (data += ch));
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });
  } catch (e) {
    log(`Webhook body parse error: ${e.message}`, 'ERROR');
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
    return;
  }

  const parsed = parsePayload(body);
  if (!parsed) {
    log('Webhook: no order in payload', 'WARN');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, skipped: 'no_order' }));
    return;
  }

  const { order, physicalLines } = parsed;
  const orderId = order.id;
  const positions = buildPositions(physicalLines);

  if (positions.length === 0) {
    log(`Webhook order ${orderId}: no physical lines with SKU`, 'WARN');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, skipped: 'no_positions' }));
    return;
  }

  const fulfillmentId = body.fulfillment?.id || null;
  const linesHash = fulfillmentId || physicalLines.map((l) => `${l.id || ''}:${l.quantity || 0}`).join(';');
  const dedupKey = getIdempotencyKey(orderId, linesHash);

  const existingId = getAlreadySentDemandId(orderId, linesHash);
  if (existingId) {
    log(`Webhook order ${orderId}: already sent to MS (demand ${existingId}), skip`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, duplicate: true, demandId: existingId }));
    return;
  }

  try {
    const description = buildDescription(order);
    const demand = await createDemand(positions, {
      storeName: WAREHOUSE_NAME_MS,
      counterpartyName: COUNTERPARTY_NAME_MS,
      description: description || undefined,
    });
    const demandId = demand.id || demand.meta?.href?.split('/').pop();
    markAsSent(orderId, demandId, linesHash);
    log(`Webhook order ${orderId}: created demand ${demandId} in MS`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, demandId }));
  } catch (e) {
    log(`Webhook order ${orderId}: ${e.message}`, 'ERROR');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

function main() {
  const port = Number(process.env.WEBHOOK_PORT) || 3300;
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && (req.url === '/webhook/order-fulfilled' || req.url === '/webhook/order-fulfilled/')) {
      return handleOrderFulfilled(req, res);
    }
    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'moysklad-order-webhook' }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  });

  server.listen(port, () => {
    log(`Webhook server listening on port ${port}, path POST /webhook/order-fulfilled`);
  });
}

try {
  main();
} catch (e) {
  log(String(e), 'ERROR');
  process.exitCode = 1;
}
