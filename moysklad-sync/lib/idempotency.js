/**
 * Защита от дублей: храним соответствие «ключ заказа/fulfillment → id документа МС».
 * Один ключ = один документ реализации.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getStoragePath() {
  return process.env.MOYSKLAD_DEDUP_FILE || path.join(__dirname, '..', 'moysklad-fulfillments.json');
}

function readStore() {
  const p = getStoragePath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(raw);
    return typeof data === 'object' && data !== null ? data : {};
  } catch (_) {
    return {};
  }
}

function writeStore(data) {
  const p = getStoragePath();
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Ключ идемпотентности: один заказ = один документ (при полной отгрузке).
 * При частичных отгрузках можно использовать orderId + hash(physical_lines).
 */
export function getIdempotencyKey(orderId, fulfillmentIdOrLinesHash) {
  if (fulfillmentIdOrLinesHash) {
    return `${orderId}:${fulfillmentIdOrLinesHash}`;
  }
  return String(orderId);
}

/**
 * Проверить, уже отправляли ли мы этот заказ/fulfillment в МС.
 * @param {string} orderId - id заказа Saleor
 * @param {string} [fulfillmentIdOrLinesHash] - id fulfillment или хеш строк (для частичных отгрузок)
 * @returns {string | null} id документа в МС или null
 */
export function getAlreadySentDemandId(orderId, fulfillmentIdOrLinesHash) {
  const key = getIdempotencyKey(orderId, fulfillmentIdOrLinesHash);
  const store = readStore();
  const entry = store[key];
  return entry?.demandId ?? null;
}

/**
 * Сохранить привязку «заказ/fulfillment → документ МС».
 */
export function markAsSent(orderId, demandId, fulfillmentIdOrLinesHash) {
  const key = getIdempotencyKey(orderId, fulfillmentIdOrLinesHash);
  const store = readStore();
  store[key] = { demandId, at: new Date().toISOString() };
  writeStore(store);
}
