# Яндекс Доставка — полный код для копирования 1:1 (Vspomni Front)

Этот файл **сгенерирован из текущего репозитория** и содержит:

1. **Прокси и расчёт** — всё, от чего зависит `POST /api/yandex-delivery` (route, клиент, типы, хелперы посылки и id ПВЗ).
2. **Фронт ПВЗ/курьер** — справочник `geo_id`, стор ПВЗ, список/карта ПВЗ, карта курьера, метаданные адреса Saleor (см. вторую часть файла после заголовка «Дополнительно»).

Модалка адреса и блок checkout в этом файле **не включены** (очень большие) — их проще скопировать из репозитория целиком: `src/components/modals/AddressModal.tsx`, `src/components/checkout/OrderDelivery.tsx`.

## Как перенести в другой Next.js-проект

1. Скопируйте файлы ниже **в те же пути** относительно `src/` (или поправьте импорты `@/...` в `tsconfig.json` → `paths`).
2. Убедитесь, что на сервере (и в `.env.local` для dev) заданы переменные из раздела **Env**.
3. Фронт должен вызывать `fetch('/api/yandex-delivery', { method: 'POST', body: JSON.stringify({...}) })` как в `src/lib/api/yandexDelivery.ts`.

## Импорты

- `route.ts` импортирует `@/lib/yandexPickupPointId`, `@/lib/yandexShipmentEstimate`.
- `yandexDelivery.ts` импортирует `@/types/yandexDelivery`.

## Env (имена как в коде; значения не коммитьте)

| Переменная | Обязательность | Назначение |
|------------|----------------|------------|
| `YANDEX_DELIVERY_TOKEN` | **да** | Bearer для Platform (`b2b-authproxy`) и Cargo (`b2b.taxi.yandex.net`) |
| `YANDEX_DELIVERY_PLATFORM_URL` | нет | По умолчанию `https://b2b-authproxy.taxi.yandex.net` |
| `YANDEX_PLATFORM_MERCHANT_ID` | для `warehouses-list` | `merchant_id` для API Platform (не путать с «ID клиента» в ЛК) |
| `YANDEX_PLATFORM_SOURCE_STATION_ID` | для Platform pricing | `station_id` склада из `warehouses/list` → `source.platform_station_id` |
| `YANDEX_DELIVERY_WAREHOUSE_LAT` | рекомендуется | Широта склада отправителя (Cargo) |
| `YANDEX_DELIVERY_WAREHOUSE_LNG` | рекомендуется | Долгота |
| `YANDEX_DELIVERY_WAREHOUSE_FULLNAME` | рекомендуется | Полный адрес строкой |
| `YANDEX_DELIVERY_WAREHOUSE_ID` | рекомендуется | `point_id` пункта отправления в сети Яндекса (Cargo) |

---

## `src/app/api/yandex-delivery/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import {
  isHyphenatedUuidPointId,
  isLikelyYandexPlatformStationId,
} from '@/lib/yandexPickupPointId'
import {
  capYandexNddPvzPackageDims,
  resolveYandexShipmentPackage,
  toYandexPricingCalculatorDimsCm,
} from '@/lib/yandexShipmentEstimate'

const YANDEX_API_BASE = 'https://b2b.taxi.yandex.net'
const YANDEX_PLATFORM_API_BASE = process.env.YANDEX_DELIVERY_PLATFORM_URL || 'https://b2b-authproxy.taxi.yandex.net'
const CARGO_PATH = '/b2b/cargo/integration/v2'
const PLATFORM_PICKUP_LIST_PATH = '/api/b2b/platform/pickup-points/list'
const PLATFORM_PRICING_CALCULATOR_PATH = '/api/b2b/platform/pricing-calculator'
const PLATFORM_WAREHOUSES_LIST_PATH = '/api/b2b/platform/warehouses/list'

/** Запятая после города: «Россия, Москва улица …» → «Россия, Москва, улица …» (рекомендации Яндекса по полному адресу). */
function normalizeRuAddressForYandex(fullname: string): string {
  const s = fullname.trim()
  return s
    .replace(/^Россия,\s*Москва\s+(?!,)/i, 'Россия, Москва, ')
    .replace(/^Россия,\s*Санкт-Петербург\s+(?!,)/i, 'Россия, Санкт-Петербург, ')
}

/** Для Platform pricing-calculator в примерах доки адрес без префикса «Россия,». */
function addressForPlatformPricing(full: string): string {
  return full.replace(/^Россия,\s*/i, '').trim() || full.trim()
}

/**
 * Парсинг pricing_total из pricing-calculator (пример из доки: "225.7 RUB" — рубли с десятыми).
 * @see https://yandex.com/support/delivery-profile/ru/api/other-day/ref/1.-Podgotovka-zayavki/apib2bplatformpricing-calculator-post
 */
function parsePricingTotalRub(s: string | undefined): number {
  if (!s || typeof s !== 'string') return NaN
  const m = s.replace(/\s/g, '').match(/^([\d.,]+)/)
  if (!m) return NaN
  return parseFloat(m[1].replace(',', '.'))
}

function getToken(): string {
  const token = process.env.YANDEX_DELIVERY_TOKEN
  if (!token?.trim()) {
    throw new Error('YANDEX_DELIVERY_TOKEN is not set')
  }
  return token.trim()
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

/** Из ответа API Яндекса достаём текст ошибки для пользователя (доставка) */
function yandexErrorToMessage(resStatus: number, err: Record<string, unknown>): string {
  const raw =
    typeof err.error === 'string'
      ? err.error
      : typeof err.message === 'string'
        ? err.message
        : typeof err.code === 'string'
          ? err.code
          : typeof err.description === 'string'
            ? err.description
            : ''
  const lower = raw.toLowerCase()
  // Ответ API: "Метод оплаты не доступен" — в ЛК доставки Яндекса не подключена оплата для B2B такси
  if (lower.includes('метод оплаты') || lower.includes('payment') && lower.includes('method')) {
    return 'В личном кабинете доставки Яндекса (dostavka.yandex.ru) подключите способ оплаты для B2B такси: Настройки → Оплата / привязка счёта.'
  }
  if (resStatus === 401 || resStatus === 403 || lower.includes('access denied') || lower.includes('forbidden') || lower.includes('unauthorized')) {
    return 'Доступ к API доставки Яндекса запрещён. Проверьте YANDEX_DELIVERY_TOKEN: токен должен быть из личного кабинета dostavka.yandex.ru (B2B такси), не OAuth.'
  }
  if (resStatus === 404 || lower.includes('not found')) {
    return 'Сервис расчёта доставки не найден. Проверьте подключение B2B такси в dostavka.yandex.ru.'
  }
  if (lower.includes('invalid') && lower.includes('token')) {
    return 'Неверный токен доставки Яндекса. Укажите корректный YANDEX_DELIVERY_TOKEN из dostavka.yandex.ru.'
  }
  if (raw) return raw
  if (resStatus === 502 || resStatus === 503) return 'Сервис доставки Яндекса временно недоступен. Попробуйте позже.'
  return 'Ошибка расчёта доставки Яндекса. Попробуйте позже или измените адрес.'
}

/** Ошибки Platform API (NDD): не подменяем 404 текстом про «B2B такси» — это другой контур. */
function yandexPlatformErrorToMessage(
  resStatus: number,
  err: Record<string, unknown>,
  responseText: string,
): string {
  const raw =
    typeof err.message === 'string'
      ? err.message
      : typeof err.error === 'string'
        ? err.error
        : typeof err.code === 'string'
          ? err.code
          : ''
  if (/merchant not found/i.test(raw)) {
    return (
      'Яндекс: Merchant not found — значение в YANDEX_PLATFORM_MERCHANT_ID не является merchant_id в API «доставка в другой день». ' +
      'ID клиента в ЛК часто другой идентификатор. Запросите у поддержки Яндекса поле merchant_id для POST .../platform/warehouses/list.'
    )
  }
  if (/source station is invalid/i.test(raw)) {
    return (
      'Platform API: source.platform_station_id не принят (склад не найден в платформе). ' +
      'Укажите station_id из ответа POST .../platform/warehouses/list для вашего склада, либо совпадающий с point_id отправления в Cargo (YANDEX_DELIVERY_WAREHOUSE_ID). ' +
      raw
    )
  }
  if (raw && !/^parse error/i.test(raw)) return raw
  if (resStatus === 400) {
    return (
      'Platform API: неверный запрос (400). Проверьте filter.merchant_id и тело запроса. ' +
      (responseText || '').slice(0, 500)
    )
  }
  if (resStatus === 404) {
    return (
      'Platform API (доставка в другой день): метод недоступен или не найден (404). ' +
      'Часто у токена нет доступа к API складов/мерчанта, либо неверный merchant_id, либо склад не создан в платформе. ' +
      'Уточните в поддержке Яндекса доступ к POST .../platform/warehouses/list. Ответ: ' +
      (responseText || '').slice(0, 400)
    )
  }
  if (resStatus === 401 || resStatus === 403) {
    return 'Доступ к Platform API запрещён. Проверьте токен в dostavka.yandex.ru → Интеграция.'
  }
  return raw || responseText.slice(0, 300) || `Platform API HTTP ${resStatus}`
}

/** Запрос к B2B Platform API (ПВЗ и т.д.) — другой хост */
async function yandexPlatformRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = getToken()
  const url = `${YANDEX_PLATFORM_API_BASE}${path}`
  const res = await fetch(url, {
    method: options.method || 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept-Language': 'ru',
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    let err: Record<string, unknown>
    try {
      err = JSON.parse(text) as Record<string, unknown>
    } catch {
      err = { message: text || res.statusText }
    }
    console.error('Yandex Platform API raw error:', res.status, path, text)
    const userMsg = yandexPlatformErrorToMessage(res.status, err, text)
    throw new Error(userMsg)
  }
  return text ? (JSON.parse(text) as T) : ({} as T)
}

async function yandexRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = getToken()
  const url = `${YANDEX_API_BASE}${path}`
  const res = await fetch(url, {
    method: options.method || 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept-Language': 'ru',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    let err: Record<string, unknown>
    try {
      err = JSON.parse(text) as Record<string, unknown>
    } catch {
      err = { message: text || res.statusText }
    }
    console.error('Yandex Delivery API raw error:', res.status, text)
    const userMsg = yandexErrorToMessage(res.status, err)
    throw new Error(userMsg)
  }
  return text ? (JSON.parse(text) as T) : ({} as T)
}

// Геокодирование адреса через Nominatim (бесплатно)
async function geocodeAddress(fullname: string): Promise<[number, number] | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q', fullname)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'VspomniStore/1.0' },
    })
    const data = await res.json()
    if (Array.isArray(data) && data[0]) {
      const lon = parseFloat(data[0].lon)
      const lat = parseFloat(data[0].lat)
      if (Number.isFinite(lon) && Number.isFinite(lat)) return [lon, lat]
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Точка отправления (ПВЗ/склад в ЛК Яндекса).
 * Для сценария ПВЗ→ПВЗ в offers/calculate у точки id:1 должен быть point_id из pickup-points/list.
 */
/**
 * Дефолтный ПВЗ/склад СПб (Ватутина). Поддержка Яндекса: старый пункт мог закрыться —
 * обновите YANDEX_DELIVERY_WAREHOUSE_ID + координаты из актуального pickup-points/list.
 */
const DEFAULT_SPB_WAREHOUSE_POINT_ID = '019c55f8c0d972ea9b59302a85430825'

/** Полный адрес (страна, город, улица, дом) — иначе Cargo может вернуть пустой offers (ответ поддержки). */
const DEFAULT_SPB_WAREHOUSE_ADDRESS =
  'Россия, Санкт-Петербург, улица Ватутина, дом 8/7Д'

function getWarehousePoint(): { coordinates?: [number, number]; fullname: string; point_id?: string } {
  const lat = process.env.YANDEX_DELIVERY_WAREHOUSE_LAT
  const lng = process.env.YANDEX_DELIVERY_WAREHOUSE_LNG
  const fullname =
    process.env.YANDEX_DELIVERY_WAREHOUSE_FULLNAME?.trim() ||
    DEFAULT_SPB_WAREHOUSE_ADDRESS
  const envId = process.env.YANDEX_DELIVERY_WAREHOUSE_ID?.trim()
  const warehousePointId = envId || DEFAULT_SPB_WAREHOUSE_POINT_ID

  if (lat && lng) {
    const lon = parseFloat(lng)
    const latN = parseFloat(lat)
    if (Number.isFinite(lon) && Number.isFinite(latN)) {
      return {
        coordinates: [lon, latN],
        fullname,
        point_id: warehousePointId,
      }
    }
  }
  return {
    coordinates: [30.379738, 59.962021],
    fullname: DEFAULT_SPB_WAREHOUSE_ADDRESS,
    point_id: warehousePointId,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('--- Yandex Delivery API Request ---', JSON.stringify(body, null, 2))
    const action = body.action as string

    if (action === 'calculate') {
      const { to, mode } = body as {
        to: {
          city: string
          street?: string
          building?: string
          fullname?: string
          coordinates?: [number, number]
          /** id пункта из pickup-points/list — иначе нельзя вешать type=pvz на точку */
          yandex_point_id?: string
          yandexPointId?: string
        }
        mode?: 'door' | 'pvz'
        shipment?: {
          total_weight_g?: number
          length_cm?: number
          width_cm?: number
          height_cm?: number
        }
        shipment_lines?: Array<{
          quantity?: number
          weight_kg?: number
          length_mm?: number
          width_mm?: number
          height_mm?: number
        }>
      }
      const pkgResolved = resolveYandexShipmentPackage(body)
      const yandexDropoffPointId = (
        to.yandex_point_id ||
        to.yandexPointId ||
        ''
      ).trim()
      const fullname =
        to.fullname ||
        [to.city, to.street, to.building].filter(Boolean).join(', ')

      const cityInput = to.city || ''
      const cityNorm = cityInput
        .trim()
        .replace(/^(МОСКВА|Москва).*$/i, 'Москва')
        .replace(/^(САНКТ-ПЕТЕРБУРГ|Санкт-Петербург).*$/i, 'Санкт-Петербург')

      let fullnameForGeocode =
        fullname
          .replace(/\s*,\s*/g, ', ')
          .replace(/^МОСКВА\b/i, 'Москва')
          .replace(/^САНКТ-ПЕТЕРБУРГ\b/i, 'Санкт-Петербург')

      console.log('--- Geocoding target ---', { fullnameForGeocode, cityNorm })

      // Если координаты уже переданы с фронта (например, для ПВЗ), используем их напрямую
      let coordinates: [number, number] | null = null
      if (Array.isArray(to.coordinates) && to.coordinates.length === 2) {
        const lon = Number(to.coordinates[0])
        const lat = Number(to.coordinates[1])
        if (Number.isFinite(lon) && Number.isFinite(lat)) {
          coordinates = [lon, lat]
        }
      }

      if (!coordinates) {
        coordinates = await geocodeAddress(fullnameForGeocode || fullname)
      }
      if (!coordinates && fullnameForGeocode && cityNorm) {
        const streetPart = (to.street || to.building || fullnameForGeocode)
          .replace(new RegExp(`^${cityNorm}\\s+`, 'i'), '')
          .trim()
        const shortAddress = streetPart ? `${cityNorm}, ${streetPart}` : cityNorm
        coordinates = await geocodeAddress(shortAddress)
      }
      if (!coordinates && fullnameForGeocode) {
        const withCountry = fullnameForGeocode.startsWith('Россия')
          ? fullnameForGeocode
          : `Россия, ${fullnameForGeocode}`
        coordinates = await geocodeAddress(withCountry)
      }
      if (!coordinates) {
        return json({
          error: 'Не удалось определить координаты адреса. Проверьте город и улицу.',
          offers: [],
        }, 200)
      }
      const warehouse = getWarehousePoint()
      const dropoffFullname =
        cityNorm && (to.street || to.building)
          ? `${cityNorm}, ${(to.street || '')
            .replace(new RegExp(`^${cityNorm}\\s+`, 'i'), '')
            .trim() || to.building}`
          : fullname
      // Поддержка Яндекса: адрес до двери/ПВЗ — полностью (страна + город + улица + дом), иначе пустой offers
      let dropoffFullnameForApi =
        dropoffFullname.trim() && !/^россия\b/i.test(dropoffFullname.trim())
          ? `Россия, ${dropoffFullname.trim()}`
          : dropoffFullname
      dropoffFullnameForApi = normalizeRuAddressForYandex(dropoffFullnameForApi)
      // type=pvz только вместе с point_id из сети Яндекса; иначе — расчёт «до двери» по координатам
      const useYandexPvzDropoff =
        mode === 'pvz' && Boolean(yandexDropoffPointId)

      const pkg = useYandexPvzDropoff
        ? capYandexNddPvzPackageDims(pkgResolved)
        : pkgResolved

      /** dx=длина, dy=высота, dz=ширина (см) — как в Platform 1.01; Cargo size в метрах */
      const physicalCm = toYandexPricingCalculatorDimsCm(
        pkg.dxCm,
        pkg.dyCm,
        pkg.dzCm,
      )
      const platformWeightG = Math.max(1, Math.round(pkg.totalWeightG))
      const { dx: platDx, dy: platDy, dz: platDz } = physicalCm

      if (useYandexPvzDropoff && isHyphenatedUuidPointId(yandexDropoffPointId)) {
        console.warn(
          '[Yandex] В запросе point_id пункта доставки в формате UUID. Для offers/calculate обычно нужен `id` из pickup-points/list (hex без дефисов) или operator_station_id. Пересохраните адрес, снова выбрав ПВЗ в модалке.',
        )
      }

      const route_points = [
        {
          id: 1,
          fullname: normalizeRuAddressForYandex(warehouse.fullname),
          coordinates: warehouse.coordinates,
          ...(warehouse.point_id ? { point_id: warehouse.point_id } : {})
        },
        {
          id: 2,
          coordinates,
          fullname: dropoffFullnameForApi,
          ...(useYandexPvzDropoff
            ? { type: 'pvz', point_id: yandexDropoffPointId }
            : {}),
        },
      ]
      const items = [
        {
          size: {
            length: physicalCm.dx / 100,
            width: physicalCm.dz / 100,
            height: physicalCm.dy / 100,
          },
          weight: Math.max(0.001, pkg.totalWeightG / 1000),
          quantity: 1,
          pickup_point: 1,
          dropoff_point: 2,
        },
      ]
      // ПВЗ→ПВЗ (NDD): только ndd + skip_door_to_door.
      // До двери: НЕ форсировать ndd/delivery_type — иначе Cargo часто отдаёт пустой offers
      // на межгороде (СПб→МСК и т.д.); сначала даём API выбрать cargo/courier/express/ndd.
      const requirements: Record<string, unknown> = useYandexPvzDropoff
        ? {
            taxi_classes: ['ndd'],
            skip_door_to_door: true,
            ndd: true,
            delivery_type: 'ndd',
          }
        : {
            taxi_classes: ['cargo', 'courier', 'express', 'ndd'],
            skip_door_to_door: false,
          }

      /**
       * «Доставка в другой день» в ЛК = Platform API, не Cargo v2.
       * POST .../api/b2b/platform/pricing-calculator, tariff: self_pickup (до ПВЗ).
       * source.platform_station_id — склад в платформе (разд. 6 доки, warehouses/list).
       */
      const platformSourceStationId =
        process.env.YANDEX_PLATFORM_SOURCE_STATION_ID?.trim()
      if (useYandexPvzDropoff && platformSourceStationId) {
        try {
          type PricingDest =
            | { platform_station_id: string }
            | { address: string }
          const destinationPrimary: PricingDest =
            isLikelyYandexPlatformStationId(yandexDropoffPointId)
              ? { platform_station_id: yandexDropoffPointId }
              : { address: dropoffFullnameForApi }

          const warehousePointId = warehouse.point_id?.trim() || ''
          const fallbackSourceId =
            warehousePointId &&
            isLikelyYandexPlatformStationId(warehousePointId) &&
            warehousePointId !== platformSourceStationId
              ? warehousePointId
              : ''

          const buildPricingBody = (
            sourceStationId: string,
            destination: PricingDest,
          ) => ({
            source: { platform_station_id: sourceStationId },
            destination,
            tariff: 'self_pickup' as const,
            total_weight: platformWeightG,
            total_assessed_price: 0,
            client_price: 0,
            payment_method: 'already_paid' as const,
            places: [
              {
                physical_dims: {
                  weight_gross: platformWeightG,
                  dx: platDx,
                  dy: platDy,
                  dz: platDz,
                },
              },
            ],
          })

          let sourceId = platformSourceStationId
          let dest: PricingDest = destinationPrimary
          let ndd: { pricing_total?: string; delivery_days?: number } | undefined
          const maxPricingAttempts = 5
          for (let attempt = 0; attempt < maxPricingAttempts; attempt++) {
            try {
              ndd = await yandexPlatformRequest<{
                pricing_total?: string
                delivery_days?: number
              }>(PLATFORM_PRICING_CALCULATOR_PATH, {
                body: buildPricingBody(sourceId, dest),
              })
              if (attempt > 0) {
                console.log(
                  '[Yandex Platform] pricing-calculator успех после ретрая',
                  { sourceId: sourceId.slice(0, 12) + '…', destKind: 'platform_station_id' in dest ? 'id' : 'address' },
                )
              }
              break
            } catch (pricingErr) {
              const msg =
                pricingErr instanceof Error
                  ? pricingErr.message
                  : String(pricingErr)
              let adjusted = false
              if (/source station is invalid/i.test(msg) && fallbackSourceId) {
                if (sourceId !== fallbackSourceId) {
                  sourceId = fallbackSourceId
                  adjusted = true
                }
              }
              if (
                !adjusted &&
                /no_station|station id for point|cant get station/i.test(
                  msg,
                ) &&
                'platform_station_id' in dest
              ) {
                dest = { address: dropoffFullnameForApi }
                adjusted = true
              }
              if (!adjusted) {
                throw pricingErr
              }
            }
          }
          if (!ndd) {
            throw new Error('Platform pricing-calculator: не удалось получить ответ')
          }
          console.log(
            '--- Yandex Platform NDD pricing-calculator (full) ---',
            JSON.stringify(ndd, null, 2),
          )
          const rub = parsePricingTotalRub(ndd.pricing_total)
          const rubCheckout = Number.isFinite(rub) ? Math.round(rub) : NaN
          if (Number.isFinite(rubCheckout) && rubCheckout > 0) {
            return json({
              offers: [
                {
                  price: {
                    total_price: String(rubCheckout),
                    total_price_with_vat: String(rubCheckout),
                    base_price: String(rubCheckout),
                    currency: 'RUB',
                  },
                  taxi_class: 'ndd_self_pickup',
                  description: 'platform/pricing-calculator',
                  payload: 'ndd-platform-pricing',
                  offer_ttl: '',
                },
              ],
              delivery_days: ndd.delivery_days,
              _pricing_source: 'yandex_platform_ndd',
            })
          }
        } catch (nddErr) {
          console.warn(
            'Platform pricing-calculator (NDD ПВЗ) не удался, переходим к Cargo offers/calculate:',
            nddErr,
          )
        }
      } else if (!useYandexPvzDropoff && platformSourceStationId) {
        /**
         * Доставка до двери (межгород): по доке 1.01 тариф `time_interval`, не Cargo offers/calculate.
         * @see https://yandex.com/support/delivery-profile/ru/api/other-day/ref/1.-Podgotovka-zayavki/apib2bplatformpricing-calculator-post
         */
        try {
          const doorAddress = addressForPlatformPricing(dropoffFullnameForApi)
          const warehousePointId = warehouse.point_id?.trim() || ''
          const fallbackSourceId =
            warehousePointId &&
            isLikelyYandexPlatformStationId(warehousePointId) &&
            warehousePointId !== platformSourceStationId
              ? warehousePointId
              : ''

          const buildDoorPricingBody = (sourceStationId: string) => ({
            source: { platform_station_id: sourceStationId },
            destination: { address: doorAddress },
            tariff: 'time_interval' as const,
            total_weight: platformWeightG,
            total_assessed_price: 0,
            client_price: 0,
            payment_method: 'already_paid' as const,
            places: [
              {
                physical_dims: {
                  weight_gross: platformWeightG,
                  dx: platDx,
                  dy: platDy,
                  dz: platDz,
                },
              },
            ],
          })

          let sourceId = platformSourceStationId
          let doorPricing: { pricing_total?: string; delivery_days?: number } | undefined
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              doorPricing = await yandexPlatformRequest<{
                pricing_total?: string
                delivery_days?: number
              }>(PLATFORM_PRICING_CALCULATOR_PATH, {
                body: buildDoorPricingBody(sourceId),
              })
              break
            } catch (pricingErr) {
              const msg =
                pricingErr instanceof Error
                  ? pricingErr.message
                  : String(pricingErr)
              if (/source station is invalid/i.test(msg) && fallbackSourceId && sourceId !== fallbackSourceId) {
                sourceId = fallbackSourceId
                continue
              }
              throw pricingErr
            }
          }
          if (doorPricing) {
            console.log(
              '--- Yandex Platform door pricing-calculator (time_interval) ---',
              JSON.stringify(doorPricing, null, 2),
            )
            const rub = parsePricingTotalRub(doorPricing.pricing_total)
            const rubCheckout = Number.isFinite(rub) ? Math.round(rub) : NaN
            if (Number.isFinite(rubCheckout) && rubCheckout > 0) {
              return json({
                offers: [
                  {
                    price: {
                      total_price: String(rubCheckout),
                      total_price_with_vat: String(rubCheckout),
                      base_price: String(rubCheckout),
                      currency: 'RUB',
                    },
                    taxi_class: 'platform_time_interval',
                    description: 'platform/pricing-calculator (door)',
                    payload: 'platform-door-pricing',
                    offer_ttl: '',
                  },
                ],
                delivery_days: doorPricing.delivery_days,
                _pricing_source: 'yandex_platform_door',
              })
            }
          }
        } catch (doorErr) {
          console.warn(
            'Platform pricing-calculator (до двери, time_interval) не удался, пробуем Cargo offers/calculate:',
            doorErr,
          )
        }
      } else if (useYandexPvzDropoff && !platformSourceStationId) {
        console.log(
          '[Yandex NDD] Для расчёта «в другой день» до ПВЗ задайте YANDEX_PLATFORM_SOURCE_STATION_ID — platform_station_id склада из POST .../warehouses/list (док: 1.01 pricing-calculator). Сейчас используется только Cargo v2.',
        )
      } else if (!useYandexPvzDropoff && !platformSourceStationId) {
        console.log(
          '[Yandex door] Для межгорода до двери задайте YANDEX_PLATFORM_SOURCE_STATION_ID (station_id склада из POST .../warehouses/list). ' +
            'Иначе расчёт идёт через Cargo offers/calculate — на многих маршрутах он возвращает пустой offers.',
        )
      }

      const calculatePayload = { items, route_points, requirements }
      console.log(
        '--- Yandex offers/calculate OUT (route_points + requirements) ---',
        JSON.stringify(calculatePayload, null, 2),
      )

      let result = await yandexRequest<{ offers: any[]; error_messages?: any[] }>(
        `${CARGO_PATH}/offers/calculate`,
        { body: calculatePayload }
      )

      // Полное тело ответа (в т.ч. error_messages / коды estimating.*) — для отладки пустых offers
      console.log(
        '--- Yandex Delivery Offers Result (full JSON, first offers/calculate) ---',
        JSON.stringify(result, null, 2),
      )

      // Ретраи при пустых offers (door): разные профили — межгород часто даёт только cargo/ndd.
      if (!result.offers?.length && !useYandexPvzDropoff) {
        const doorRetries: Array<Record<string, unknown>> = [
          { taxi_classes: ['cargo'], skip_door_to_door: false },
          { taxi_classes: ['ndd'], skip_door_to_door: false, ndd: true, delivery_type: 'ndd' },
          { taxi_classes: ['courier', 'express'], skip_door_to_door: false },
          { taxi_classes: ['cargo', 'courier', 'express', 'ndd'], skip_door_to_door: false, ndd: true, delivery_type: 'ndd' },
        ]
        for (let i = 0; i < doorRetries.length && !result.offers?.length; i++) {
          const req = { ...requirements, ...doorRetries[i] }
          console.log(
            `--- Yandex door retry ${i + 1}/${doorRetries.length} requirements ---`,
            JSON.stringify(req),
          )
          result = await yandexRequest<{ offers: any[]; error_messages?: any[] }>(
            `${CARGO_PATH}/offers/calculate`,
            { body: { items, route_points, requirements: req } },
          )
          console.log(
            `--- Yandex door retry ${i + 1} result ---`,
            JSON.stringify(result, null, 2),
          )
        }
      }

      // ПВЗ: если пусто — явный NDD (как раньше).
      if (!result.offers?.length && useYandexPvzDropoff) {
        console.log('No offers found (PVZ), retrying with explicit NDD requirements...')
        requirements.taxi_classes = ['ndd']
        requirements.ndd = true
        requirements.delivery_type = 'ndd'

        result = await yandexRequest<{ offers: any[]; error_messages?: any[] }>(
          `${CARGO_PATH}/offers/calculate`,
          { body: { items, route_points, requirements } },
        )
        console.log('--- Yandex Delivery Explicit NDD Result ---', JSON.stringify(result, null, 2))
      }

      if (!result.offers?.length && !useYandexPvzDropoff) {
        const req = {
          ...requirements,
          taxi_classes: ['courier', 'express'],
          skip_door_to_door: false,
        }
        delete (req as { ndd?: unknown }).ndd
        delete (req as { delivery_type?: unknown }).delivery_type

        result = await yandexRequest<{ offers: any[]; error_messages?: any[] }>(
          `${CARGO_PATH}/offers/calculate`,
          { body: { items, route_points, requirements: req } },
        )
        console.log('--- Yandex Delivery Courier-only Fallback ---', JSON.stringify(result, null, 2))
      }

      if (!result.offers?.length) {
        console.warn('Yandex offers/calculate returned empty offers after all retries', {
          dropoffFullname: dropoffFullnameForApi,
          coordinates,
          warehouseCoords: warehouse.coordinates,
          warehouse_point_id: warehouse.point_id ?? null,
          dropoff_point_id: yandexDropoffPointId || null,
          lastError: result.error_messages,
        })
        return json({
          ...result,
          error:
            'По этому маршруту Cargo offers/calculate не вернул тарифы. ' +
            'Для курьера до двери (межгород) нужен Platform API pricing-calculator с тарифом time_interval и переменная YANDEX_PLATFORM_SOURCE_STATION_ID (station_id склада из warehouses/list). ' +
            'Для ПВЗ — tariff self_pickup и тот же station_id. Уточните в поддержке Яндекс Доставки, если расчёт пустой.',
          offers: result.offers || [],
        }, 200)
      }
      return json(result)
    }

    if (action === 'list-pickup-points') {
      const filters = body as {
        geo_id?: number
        type?: 'pickup_point' | 'terminal' | 'warehouse'
        longitude?: { from: number; to: number }
        latitude?: { from: number; to: number }
      }
      const requestBody: Record<string, unknown> = {}
      if (filters.geo_id != null) requestBody.geo_id = filters.geo_id
      if (filters.type) requestBody.type = filters.type
      if (filters.longitude) requestBody.longitude = filters.longitude
      if (filters.latitude) requestBody.latitude = filters.latitude
      const result = await yandexPlatformRequest<{ points: unknown[] }>(
        PLATFORM_PICKUP_LIST_PATH,
        { body: Object.keys(requestBody).length ? requestBody : {} }
      )
      return json(result)
    }

    if (action === 'warehouses-list') {
      const { merchant_id } = body as { merchant_id?: string }
      const mid =
        merchant_id?.trim() ||
        process.env.YANDEX_PLATFORM_MERCHANT_ID?.trim()
      // API Яндекса требует ключ filter; часто нужен filter.merchant_id (см. доку 6.02)
      const requestBody = {
        filter: mid ? { merchant_id: mid } : {},
      }
      const result = await yandexPlatformRequest<{
        warehouses?: Array<{
          station_id?: string
          name?: string
          location?: unknown
          client_warehouse_id?: string
        }>
      }>(PLATFORM_WAREHOUSES_LIST_PATH, { body: requestBody })
      return json(result)
    }

    return json({
      error:
        'Unknown action. Use action: "calculate" | "list-pickup-points" | "warehouses-list"',
    }, 400)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('Yandex Delivery API error:', message)
    // Сообщение уже может быть нашим пользовательским (из yandexErrorToMessage)
    if (message.startsWith('YANDEX_DELIVERY_TOKEN') || message.includes('dostavka.yandex') || message.includes('Проверьте') || message.includes('токен')) {
      return json({ error: message }, 400)
    }
    try {
      const err = JSON.parse(message) as Record<string, unknown>
      const msg =
        typeof err.error === 'string'
          ? err.error
          : typeof err.message === 'string'
            ? err.message
            : typeof err.code === 'string'
              ? err.code
              : message
      return json({ error: msg }, 400)
    } catch {
      if (
        /merchant not found/i.test(message) ||
        message.includes('YANDEX_PLATFORM_MERCHANT_ID')
      ) {
        return json({ error: message }, 400)
      }
      return json({ error: message }, 500)
    }
  }
}

```

## `src/lib/api/yandexDelivery.ts`

```typescript
import type {
  YandexCalculateResponse,
  YandexCalculatedOffer,
  YandexPickupPointsResponse,
  YandexPickupPoint,
} from '@/types/yandexDelivery'

const API_BASE = '/api/yandex-delivery'

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = (data as { error?: string }).error || res.statusText
    throw new Error(msg)
  }
  return data as T
}

/** Рассчитать стоимость доставки Яндекса
 *  Используется как для доставки «до двери», так и для доставки до ПВЗ.
 *  Если передать coordinates, то сервер возьмёт их напрямую и не будет геокодировать адрес.
 *  Параметр mode позволяет подсказать бэкенду тип доставки (door | pvz).
 */
export type YandexCalculateShipmentLine = {
  quantity: number
  weightKg?: number
  lengthMm?: number
  widthMm?: number
  heightMm?: number
}

export async function calculateDelivery(params: {
  city: string
  street?: string
  building?: string
  fullname?: string
  coordinates?: [number, number] // [долгота, широта]
  mode?: 'door' | 'pvz'
  /** id пункта из списка ПВЗ Яндекса — для mode=pvz в API */
  yandexPointId?: string
  /** Линии корзины — вес/габариты в Cargo и Platform pricing-calculator */
  shipmentLines?: YandexCalculateShipmentLine[]
}): Promise<YandexCalculateResponse> {
  return post<YandexCalculateResponse>({
    action: 'calculate',
    mode: params.mode,
    to: {
      city: params.city,
      street: params.street,
      building: params.building,
      fullname: params.fullname,
      coordinates: params.coordinates,
      ...(params.yandexPointId?.trim()
        ? { yandex_point_id: params.yandexPointId.trim() }
        : {}),
    },
    ...(params.shipmentLines?.length
      ? {
          shipment_lines: params.shipmentLines.map((l) => ({
            quantity: l.quantity,
            ...(l.weightKg != null ? { weight_kg: l.weightKg } : {}),
            ...(l.lengthMm != null ? { length_mm: l.lengthMm } : {}),
            ...(l.widthMm != null ? { width_mm: l.widthMm } : {}),
            ...(l.heightMm != null ? { height_mm: l.heightMm } : {}),
          })),
        }
      : {}),
  })
}

/** Парсинг цены из ответа Яндекса (в т.ч. с запятой как десятичным разделителем) */
export function parseYandexOfferPrice(raw: string | undefined): number {
  if (raw == null || raw === '') return 0
  const normalized = String(raw).replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : 0
}

/** Получить самый дешёвый оффер из ответа расчёта */
export function getCheapestOffer(offers: YandexCalculatedOffer[]): YandexCalculatedOffer | null {
  if (!offers?.length) return null
  return offers.reduce((min, o) => {
    const price = parseYandexOfferPrice(o.price?.total_price)
    const minPrice = parseYandexOfferPrice(min.price?.total_price)
    return price < minPrice ? o : min
  })
}

/** Список ПВЗ Яндекса (пункты выдачи и постаматы). Опционально: geo_id, type. */
export async function getPickupPoints(params?: {
  geo_id?: number
  type?: 'pickup_point' | 'terminal' | 'warehouse'
}): Promise<YandexPickupPointsResponse> {
  return post<YandexPickupPointsResponse>({
    action: 'list-pickup-points',
    ...params,
  })
}

/** Склады платформы NDD — в ответе у каждого склада `station_id` для YANDEX_PLATFORM_SOURCE_STATION_ID */
export async function getYandexWarehousesList(params?: {
  merchant_id?: string
}): Promise<{ warehouses?: unknown[] }> {
  return post<{ warehouses?: unknown[] }>({
    action: 'warehouses-list',
    ...(params?.merchant_id?.trim()
      ? { merchant_id: params.merchant_id.trim() }
      : {}),
  })
}

export type { YandexPickupPoint }

```

## `src/lib/yandexPickupPointId.ts`

```typescript
import type { YandexPickupPoint } from '@/types/yandexDelivery'

const HYPHENATED_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isHyphenatedUuidPointId(s: string): boolean {
  return HYPHENATED_UUID_RE.test(s.trim())
}

/**
 * ID пункта для Platform pricing-calculator `destination.platform_station_id`:
 * UUID с дефисами или 24–32 hex (ULID / id из pickup-points/list).
 * Числовой `operator_station_id` (например 10030280672) сюда не подходит — в calculator передавать `destination.address`.
 */
export function isLikelyYandexPlatformStationId(s: string): boolean {
  const t = s.trim()
  if (HYPHENATED_UUID_RE.test(t)) return true
  return /^[0-9a-f]{24,32}$/i.test(t)
}

/** 32 hex без дефисов: может быть и platform id Яндекса, и компактный UUID v4 */
function isCompactUuidV4(s: string): boolean {
  if (!/^[0-9a-f]{32}$/i.test(s)) return false
  const n = parseInt(s[12], 16)
  return Number.isFinite(n) && (n & 0xf) === 4
}

function operatorId(pvz: YandexPickupPoint): string {
  return (pvz.operator_station_id || pvz.operatorStationId || '').trim()
}

/**
 * Идентификатор для Cargo offers/calculate: route_points[].point_id + type=pvz.
 * Док: поле `id` из pickup-points/list (обычно длинная hex без дефисов).
 * Если `id` — UUID, в расчёт часто нужен `operator_station_id` (см. ответ list).
 */
export function yandexPointIdForCargoOffers(pvz: YandexPickupPoint): string {
  const id = (pvz.id || '').trim()
  const op = operatorId(pvz)

  if (HYPHENATED_UUID_RE.test(id) && op) {
    return op
  }
  if (isCompactUuidV4(id) && op) {
    return op
  }
  return id || op
}

```

## `src/lib/yandexShipmentEstimate.ts`

```typescript
/**
 * Оценка веса и габаритов для Яндекс Cargo / Platform pricing-calculator.
 * Товары без веса/размеров — консервативные дефолты (как «типичный флакон»).
 */

export type YandexShipmentLineInput = {
  quantity: number
  weightKg?: number
  lengthMm?: number
  widthMm?: number
  heightMm?: number
}

const DEFAULT_UNIT_G = 200
const DEFAULT_MM = { l: 80, w: 55, h: 45 }
const MIN_SIDE_CM = 8
const MAX_SIDE_CM = 150
const MIN_TOTAL_G = 100
const MAX_TOTAL_G = 50_000
/** Макс. одна сторона «стопки» одинаковых коробок, мм (защита от нереалистичных башен) */
const MAX_STACKED_EDGE_MM = 1200

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/**
 * Одна SKU: стопка qty штук вдоль самого короткого ребра (типичная укладка).
 * Возвращает три стороны параллелепипеда в мм (не отсортированы).
 */
function stackedBoxMm(
  lengthMm: number,
  widthMm: number,
  heightMm: number,
  qty: number,
): [number, number, number] {
  const q = Math.max(1, Math.floor(qty))
  const [a, b, c] = [lengthMm, widthMm, heightMm].sort((x, y) => x - y)
  const stackedShort = Math.min(a * q, MAX_STACKED_EDGE_MM)
  return [stackedShort, b, c]
}

/** Суммарный вес (г) и одно место (см) из линий корзины */
export function estimateYandexShipmentPackage(
  lines: YandexShipmentLineInput[],
): { totalWeightG: number; dxCm: number; dyCm: number; dzCm: number } {
  const valid = lines.filter((l) => l.quantity > 0)
  if (valid.length === 0) {
    return {
      totalWeightG: 2000,
      dxCm: 30,
      dyCm: 20,
      dzCm: 20,
    }
  }

  let totalWeightG = 0
  let totalVolMm3 = 0

  for (const line of valid) {
    const q = Math.floor(line.quantity)
    const wKg =
      line.weightKg != null && line.weightKg > 0 ? line.weightKg : undefined
    const g = wKg != null ? Math.round(wKg * 1000 * q) : DEFAULT_UNIT_G * q
    totalWeightG += g

    const l =
      line.lengthMm != null && line.lengthMm > 0
        ? line.lengthMm
        : DEFAULT_MM.l
    const w =
      line.widthMm != null && line.widthMm > 0 ? line.widthMm : DEFAULT_MM.w
    const h =
      line.heightMm != null && line.heightMm > 0 ? line.heightMm : DEFAULT_MM.h
    totalVolMm3 += l * w * h * q
  }

  totalWeightG = clamp(totalWeightG, MIN_TOTAL_G, MAX_TOTAL_G)

  // Одна позиция в корзине: явная стопка (не «куб из ∛объёма», который маскирует длину)
  if (valid.length === 1) {
    const line = valid[0]
    const q = Math.max(1, Math.floor(line.quantity))
    const l =
      line.lengthMm != null && line.lengthMm > 0
        ? line.lengthMm
        : DEFAULT_MM.l
    const w =
      line.widthMm != null && line.widthMm > 0 ? line.widthMm : DEFAULT_MM.w
    const h =
      line.heightMm != null && line.heightMm > 0 ? line.heightMm : DEFAULT_MM.h
    const edgesMm = stackedBoxMm(l, w, h, q)
    const [d0, d1, d2] = [...edgesMm].sort((x, y) => x - y)
    const toCm = (mm: number) => Math.round((mm / 10) * 10) / 10
    return {
      totalWeightG,
      dxCm: toCm(d2),
      dyCm: toCm(d1),
      dzCm: toCm(d0),
    }
  }

  const volCm3 = Math.max(1, totalVolMm3 / 1000)
  const side = Math.cbrt(volCm3)
  const base = clamp(side, MIN_SIDE_CM, MAX_SIDE_CM)
  const dxCm = clamp(base * 1.12, MIN_SIDE_CM, MAX_SIDE_CM)
  const dyCm = clamp(base * 0.98, MIN_SIDE_CM, MAX_SIDE_CM)
  const dzCm = clamp(base * 0.9, MIN_SIDE_CM, MAX_SIDE_CM)

  return {
    totalWeightG,
    dxCm: Math.round(dxCm * 10) / 10,
    dyCm: Math.round(dyCm * 10) / 10,
    dzCm: Math.round(dzCm * 10) / 10,
  }
}

/** Тело POST /api/yandex-delivery (calculate): явная посылка или линии корзины */
export type YandexShipmentRequestBody = {
  shipment?: {
    total_weight_g?: number
    length_cm?: number
    width_cm?: number
    height_cm?: number
  }
  shipment_lines?: Array<{
    quantity?: number
    weight_kg?: number
    length_mm?: number
    width_mm?: number
    height_mm?: number
  }>
}

/**
 * В ЛК «ПВЗ → ПВЗ» (NDD) верхняя доступная ячейка габаритов часто 32×25×15 см
 * (любая ориентация посылки). Запросы с большим боксом дают более дорогой тариф.
 */
const NDD_PVZ_MAX_CM_ASC = [15, 25, 32] as const

/**
 * Platform pricing-calculator / PlacePhysicalDimensions (док 1.01):
 * dx — длина, dy — высота, dz — ширина (см, целые).
 * Три стороны короба без привязки к осям → сортируем: мин = «высота» (тонкая грань),
 * макс = «длина», средняя = «ширина». Объём dx·dy·dz не меняется.
 * @see https://yandex.com/support/delivery-profile/ru/api/other-day/ref/1.-Podgotovka-zayavki/apib2bplatformpricing-calculator-post
 */
export function toYandexPricingCalculatorDimsCm(
  sideACm: number,
  sideBCm: number,
  sideCCm: number,
): { dx: number; dy: number; dz: number } {
  const [a, b, c] = [sideACm, sideBCm, sideCCm]
    .map((n) => Math.max(1, Math.round(Number(n) || 1)))
    .sort((x, y) => x - y)
  return {
    dy: a,
    dz: b,
    dx: c,
  }
}

/**
 * Уменьшает dx/dy/dz с сохранением пропорций, пока короб не помещается в лимит ЛК.
 * Вес не трогаем — в ЛК выбирается отдельно.
 */
export function capYandexNddPvzPackageDims(pkg: {
  totalWeightG: number
  dxCm: number
  dyCm: number
  dzCm: number
}): { totalWeightG: number; dxCm: number; dyCm: number; dzCm: number } {
  const maxAsc = NDD_PVZ_MAX_CM_ASC
  const sidesAsc = [pkg.dxCm, pkg.dyCm, pkg.dzCm].sort((a, b) => a - b)
  if (
    sidesAsc[0] <= maxAsc[0] &&
    sidesAsc[1] <= maxAsc[1] &&
    sidesAsc[2] <= maxAsc[2]
  ) {
    return pkg
  }
  const scale = Math.min(
    maxAsc[0] / sidesAsc[0],
    maxAsc[1] / sidesAsc[1],
    maxAsc[2] / sidesAsc[2],
  )
  const round1 = (n: number) => Math.round(n * 10) / 10
  return {
    totalWeightG: pkg.totalWeightG,
    dxCm: round1(pkg.dxCm * scale),
    dyCm: round1(pkg.dyCm * scale),
    dzCm: round1(pkg.dzCm * scale),
  }
}

export function resolveYandexShipmentPackage(
  body: YandexShipmentRequestBody,
): { totalWeightG: number; dxCm: number; dyCm: number; dzCm: number } {
  const s = body.shipment
  if (
    s &&
    typeof s.total_weight_g === 'number' &&
    Number.isFinite(s.total_weight_g) &&
    s.total_weight_g > 0 &&
    typeof s.length_cm === 'number' &&
    Number.isFinite(s.length_cm) &&
    s.length_cm > 0 &&
    typeof s.width_cm === 'number' &&
    Number.isFinite(s.width_cm) &&
    s.width_cm > 0 &&
    typeof s.height_cm === 'number' &&
    Number.isFinite(s.height_cm) &&
    s.height_cm > 0
  ) {
    return {
      totalWeightG: clamp(Math.round(s.total_weight_g), MIN_TOTAL_G, MAX_TOTAL_G),
      dxCm: clamp(s.length_cm, MIN_SIDE_CM, MAX_SIDE_CM),
      dyCm: clamp(s.width_cm, MIN_SIDE_CM, MAX_SIDE_CM),
      dzCm: clamp(s.height_cm, MIN_SIDE_CM, MAX_SIDE_CM),
    }
  }

  const lines = body.shipment_lines
  if (Array.isArray(lines) && lines.length > 0) {
    return estimateYandexShipmentPackage(
      lines.map((r) => ({
        quantity: Math.max(0, Math.floor(Number(r.quantity) || 0)),
        weightKg: r.weight_kg,
        lengthMm: r.length_mm,
        widthMm: r.width_mm,
        heightMm: r.height_mm,
      })),
    )
  }

  return estimateYandexShipmentPackage([])
}

```

## `src/types/yandexDelivery.ts`

```typescript
// Типы для API Яндекс Доставки (b2b.taxi.yandex.net)

export interface YandexRoutePoint {
  id: number
  coordinates: [number, number] // [долгота, широта]
  fullname: string
  country: string
  city: string
  street?: string
  building?: string
  porch?: string
  sfloor?: string
  sflat?: string
}

export interface YandexCargoItem {
  size: { length: number; width: number; height: number }
  weight: number
  quantity: number
  pickup_point: number
  dropoff_point: number
}

export interface YandexOfferRequirements {
  taxi_classes: string[]
  cargo_type?: string
  cargo_loaders?: number
  pro_courier?: boolean
  cargo_options?: string[]
  skip_door_to_door?: boolean
  due?: string
  rental_duration?: number
}

export interface YandexCalculateRequest {
  items: YandexCargoItem[]
  route_points: YandexRoutePoint[]
  requirements: YandexOfferRequirements
}

export interface YandexCalculatedOfferPrice {
  total_price: string
  total_price_with_vat: string
  base_price: string
  currency: string
  surge_ratio?: number
}

export interface YandexCalculatedOffer {
  price: YandexCalculatedOfferPrice
  taxi_class: string
  description?: string
  payload: string
  offer_ttl: string
  pickup_interval?: { from: string; to: string }
  delivery_interval?: { from: string; to: string }
}

export interface YandexCalculateResponse {
  offers: YandexCalculatedOffer[]
}

export interface YandexClaimCreateRequest {
  offer_payload: string
  route_points: YandexRoutePoint[]
  recipient_name: string
  recipient_phone: string
  comment?: string
}

export interface YandexClaimCreateResponse {
  id: string
  status?: string
}

// ——— Список ПВЗ (API b2b/platform/pickup-points/list) ———

export interface YandexPickupPointAddress {
  geoId?: number
  country?: string
  region?: string
  subRegion?: string
  /** API может отдавать в snake_case */
  sub_region?: string
  locality?: string
  street?: string
  house?: string
  full_address?: string
  postal_code?: string
  comment?: string
  /** Встречаются в ответах platform/pickup-points */
  district?: string
  area?: string
  borough?: string
  dependent_locality?: string
}

export interface YandexPickupPoint {
  id: string
  operator_station_id?: string
  /** camelCase, если прокси/API нормализует ключи */
  operatorStationId?: string
  name: string
  type: 'pickup_point' | 'terminal' | 'warehouse'
  position?: { latitude: number; longitude: number }
  address?: YandexPickupPointAddress
  instruction?: string
  payment_methods?: string[]
  available_for_dropoff?: boolean
}

export interface YandexPickupPointsResponse {
  points: YandexPickupPoint[]
}

```



---

# Дополнительно: ПВЗ/курьер на фронте (как в Vspomni)

Ниже — модули для списка ПВЗ по `geo_id`, карты, курьерской карты и метаданных адреса Saleor.  
**Модалка адреса** (`src/components/modals/AddressModal.tsx`) и **checkout** (`src/components/checkout/OrderDelivery.tsx`) большие — копируйте их из репозитория целиком или свяжите импорты с этими файлами.

## `src/lib/yandexCityGeo.ts`

```typescript
/**
 * geo_id для POST .../platform/pickup-points/list — иначе приходит весь РФ (очень долго).
 * @see https://yandex.ru/support/delivery-profile/ru/api/other-day/ref/2.-Tochki-samoprivoza-i-PVZ/apib2bplatformpickup-pointslist-post
 */

/** Каноническое отображаемое имя → geo_id */
export const YANDEX_CITY_GEO_ID: Record<string, number> = {
  Москва: 213,
  'Санкт-Петербург': 2,
  Новосибирск: 65,
  Екатеринбург: 54,
  Казань: 43,
  'Нижний Новгород': 47,
  Челябинск: 56,
  Самара: 51,
  Омск: 66,
  'Ростов-на-Дону': 39,
  Уфа: 172,
  Красноярск: 62,
  Воронеж: 193,
  Пермь: 50,
  Волгоград: 38,
  Краснодар: 35,
  Саратов: 194,
  Тюмень: 55,
  Тольятти: 240,
  Ижевск: 44,
  Барнаул: 197,
  Иркутск: 63,
  Ульяновск: 195,
  Хабаровск: 76,
  Ярославль: 16,
  Владивосток: 75,
  Махачкала: 28,
  Томск: 67,
  Оренбург: 48,
  Кемерово: 64,
  Новокузнецк: 237,
  Рязань: 11,
  Астрахань: 37,
  Пенза: 49,
  Липецк: 9,
  Киров: 46,
  Чебоксары: 45,
  Калининград: 22,
  Тула: 15,
  Сочи: 239,
  Курск: 8,
  Ставрополь: 12,
  Тверь: 14,
  Магнитогорск: 235,
  Иваново: 5,
  Брянск: 191,
  Белгород: 4,
  Сургут: 973,
  Владимир: 192,
  Архангельск: 20,
  Чита: 68,
  Смоленск: 10,
  Калуга: 6,
  Саранск: 42,
  'Набережные Челны': 372,
}

const PRIORITY_CITIES_FIRST = ['Москва', 'Санкт-Петербург'] as const

function normalizeCityKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
}

/** Синонимы (нормализованные) → ключ из YANDEX_CITY_GEO_ID */
const ALIAS_TO_CANONICAL: Record<string, keyof typeof YANDEX_CITY_GEO_ID> = {
  спб: 'Санкт-Петербург',
  питер: 'Санкт-Петербург',
  'с-пб': 'Санкт-Петербург',
  'st petersburg': 'Санкт-Петербург',
  'saint petersburg': 'Санкт-Петербург',
}

/** Города для выпадающего списка: Москва, СПб, далее по алфавиту */
export function orderedYandexPvzCityNames(): string[] {
  const all = Object.keys(YANDEX_CITY_GEO_ID)
  const priSet = new Set<string>(PRIORITY_CITIES_FIRST)
  const pri = PRIORITY_CITIES_FIRST.filter((p) => all.includes(p))
  const rest = all.filter((c) => !priSet.has(c)).sort((a, b) => a.localeCompare(b, 'ru'))
  return [...pri, ...rest]
}

export function resolveYandexGeoId(cityName: string): number | undefined {
  if (!cityName?.trim()) return undefined
  const norm = normalizeCityKey(cityName)
  const viaAlias = ALIAS_TO_CANONICAL[norm]
  if (viaAlias) return YANDEX_CITY_GEO_ID[viaAlias]

  const found = Object.entries(YANDEX_CITY_GEO_ID).find(
    ([displayName]) => normalizeCityKey(displayName) === norm,
  )
  return found ? found[1] : undefined
}

/** Подпись города из справочника для UI и запроса ПВЗ; неизвестный город → Москва */
export function catalogDisplayCityForUserCity(userCity: string): string {
  const id = resolveYandexGeoId(userCity)
  if (id == null) return 'Москва'
  const pair = Object.entries(YANDEX_CITY_GEO_ID).find(([, g]) => g === id)
  return pair ? pair[0] : 'Москва'
}

```

## `src/stores/useYandexPvz.ts`

```typescript
import { create } from 'zustand'
import { getPickupPoints } from '@/lib/api/yandexDelivery'
import type { YandexPickupPoint } from '@/types/yandexDelivery'
import { resolveYandexGeoId } from '@/lib/yandexCityGeo'

let fetchSeq = 0

interface YandexPvzState {
  points: YandexPickupPoint[]
  /** Кэш по geo_id или "all" при полной выгрузке */
  pointsCache: Record<string, YandexPickupPoint[]>
  loading: boolean
  error: string | null
  /** Загрузка ПВЗ только для города (быстро). Без geo_id — полный список (долго, только fallback). */
  fetchPickupPointsForCity: (cityName: string) => Promise<void>
  clearYandexPvzCache: () => void
}

export const useYandexPvzStore = create<YandexPvzState>()((set, get) => ({
  points: [],
  pointsCache: {},
  loading: false,
  error: null,

  clearYandexPvzCache: () =>
    set({ points: [], pointsCache: {}, error: null, loading: false }),

  fetchPickupPointsForCity: async (cityName: string) => {
    const geoId = resolveYandexGeoId(cityName)
    const cacheKey = geoId != null ? `geo:${geoId}` : 'all'

    const state = get()
    const cached = state.pointsCache[cacheKey]
    if (cached && cached.length > 0) {
      set({ points: cached, loading: false, error: null })
      return
    }

    const seq = ++fetchSeq
    set({ loading: true, error: null })
    try {
      const res =
        geoId != null
          ? await getPickupPoints({ geo_id: geoId })
          : await getPickupPoints()

      if (seq !== fetchSeq) return

      if (geoId == null) {
        console.warn(
          '[Yandex PVZ] Город не найден в справочнике geo_id — загружен полный список ПВЗ (может занять минуту). Добавьте город в lib/yandexCityGeo.ts',
          cityName,
        )
      }

      const pts = res.points ?? []
      set((s) => ({
        points: pts,
        pointsCache: { ...s.pointsCache, [cacheKey]: pts },
        loading: false,
        error: null,
      }))
    } catch (e) {
      if (seq !== fetchSeq) return
      const message = e instanceof Error ? e.message : 'Не удалось загрузить ПВЗ'
      set({ error: message, loading: false })
    }
  },
}))

```

## `src/components/ui/YandexPvzList.tsx`

```tsx
'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Search, MapPin, Loader2, ChevronDown } from 'lucide-react'
import type { YandexPickupPoint } from '@/types/yandexDelivery'
import YandexPvzMap from './YandexPvzMap'
import { useYandexPvzStore } from '@/stores/useYandexPvz'
import {
  orderedYandexPvzCityNames,
  catalogDisplayCityForUserCity,
} from '@/lib/yandexCityGeo'

export interface YandexPvzListProps {
  onChoose: (point: YandexPickupPoint) => void
  defaultCity?: string
}

export default function YandexPvzList({ onChoose, defaultCity = 'Москва' }: YandexPvzListProps) {
  const { points, loading, error, fetchPickupPointsForCity } = useYandexPvzStore()
  const cities = useMemo(() => orderedYandexPvzCityNames(), [])
  const prevDefaultCity = useRef(defaultCity)
  const [pickedCity, setPickedCity] = useState(() =>
    catalogDisplayCityForUserCity(defaultCity),
  )
  const [citySearchQuery, setCitySearchQuery] = useState('')
  const [showCityDropdown, setShowCityDropdown] = useState(false)
  const [pvzSearchQuery, setPvzSearchQuery] = useState('')

  useEffect(() => {
    if (prevDefaultCity.current !== defaultCity) {
      prevDefaultCity.current = defaultCity
      setPickedCity(catalogDisplayCityForUserCity(defaultCity))
    }
  }, [defaultCity])

  useEffect(() => {
    if (pickedCity) void fetchPickupPointsForCity(pickedCity)
  }, [pickedCity, fetchPickupPointsForCity])

  const filteredCities = useMemo(() => {
    if (!citySearchQuery.trim()) return cities.slice(0, 50)
    const q = citySearchQuery.toLowerCase().trim()
    return cities.filter((c) => c.toLowerCase().includes(q)).slice(0, 50)
  }, [cities, citySearchQuery])

  const pvzInCity = useMemo(() => {
    if (!pickedCity) return []
    const byLabel = points.filter(
      (p) => (p.address?.locality || p.address?.region || '') === pickedCity,
    )
    if (byLabel.length > 0) return byLabel
    return points
  }, [points, pickedCity])

  const filteredPvz = useMemo(() => {
    if (!pvzSearchQuery.trim()) return pvzInCity
    const q = pvzSearchQuery.toLowerCase()
    return pvzInCity.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.address?.full_address || '').toLowerCase().includes(q) ||
        (p.instruction || '').toLowerCase().includes(q),
    )
  }, [pvzInCity, pvzSearchQuery])

  const handleCitySelect = useCallback((city: string) => {
    setPickedCity(city)
    setCitySearchQuery('')
    setShowCityDropdown(false)
    setPvzSearchQuery('')
  }, [])

  const handlePvzSelect = useCallback(
    (pvz: YandexPickupPoint) => {
      onChoose(pvz)
    },
    [onChoose],
  )

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.yandex-pvz-city-dropdown')) setShowCityDropdown(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const showBlockingLoader = loading && points.length === 0 && !error

  if (showBlockingLoader) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-black/60">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Загрузка пунктов выдачи Яндекса...</span>
      </div>
    )
  }

  if (error && points.length === 0) {
    return (
      <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
        {error}
      </div>
    )
  }

  if (!loading && !error && !points.length) {
    return (
      <div className="p-4 rounded-xl border border-black/10 text-black/60 text-sm">
        Список ПВЗ пуст. Проверьте настройки доставки Яндекса.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {error && points.length > 0 && (
        <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          {error}
        </div>
      )}
      {loading && points.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-black/50">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          Обновление списка для выбранного города…
        </div>
      )}

      <div className="yandex-pvz-city-dropdown relative flex flex-col">
        <label className="text-sm font-medium mb-2 flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Город
        </label>
        <button
          type="button"
          onClick={() => setShowCityDropdown(!showCityDropdown)}
          className="w-full h-12 px-4 rounded-xl border border-black/10 text-base outline-none transition focus:border-black/30 flex items-center justify-between bg-white"
        >
          <span className={pickedCity ? 'text-black' : 'text-black/40'}>
            {pickedCity || 'Выберите город'}
          </span>
          <ChevronDown
            className={`w-5 h-5 text-black/40 transition-transform ${showCityDropdown ? 'rotate-180' : ''}`}
          />
        </button>
        {showCityDropdown && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-black/10 rounded-xl shadow-lg max-h-80 overflow-hidden">
            <div className="p-2 border-b border-black/5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                <input
                  type="text"
                  value={citySearchQuery}
                  onChange={(e) => setCitySearchQuery(e.target.value)}
                  placeholder="Поиск города..."
                  className="w-full h-10 pl-9 pr-4 rounded-lg border border-black/10 text-sm outline-none focus:border-black/30"
                  autoFocus
                />
              </div>
            </div>
            <div className="overflow-y-auto max-h-60">
              {filteredCities.length === 0 ? (
                <div className="p-4 text-center text-black/50 text-sm">Город не найден</div>
              ) : (
                filteredCities.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => handleCitySelect(city)}
                    className={`w-full px-4 py-3 text-left hover:bg-black/5 transition ${
                      pickedCity === city ? 'bg-black/5 font-medium' : ''
                    }`}
                  >
                    {city}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {pickedCity && (
        <>
          <YandexPvzMap points={pvzInCity} onSelect={onChoose} />
          <div className="flex flex-col">
            <label className="text-sm font-medium mb-2 flex items-center gap-2">
              <Search className="w-4 h-4" />
              Поиск пункта выдачи
            </label>
            <input
              type="text"
              value={pvzSearchQuery}
              onChange={(e) => setPvzSearchQuery(e.target.value)}
              placeholder="Адрес или название ПВЗ"
              className="h-12 px-4 rounded-xl border border-black/10 text-base outline-none transition focus:border-black/30"
            />
          </div>
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            <div className="text-xs text-black/40">Найдено: {filteredPvz.length}</div>
            {filteredPvz.length === 0 ? (
              <div className="text-center py-6 text-black/50 text-sm">
                В этом городе пункты не найдены или измените поиск.
              </div>
            ) : (
              filteredPvz.map((pvz) => (
                <button
                  key={pvz.id}
                  type="button"
                  onClick={() => handlePvzSelect(pvz)}
                  className="text-left p-4 border border-black/10 rounded-xl hover:border-black/30 hover:bg-gray-50/50 transition group"
                >
                  <div className="font-semibold mb-1 group-hover:text-black/80">
                    {pvz.name || 'ПВЗ Яндекса'}
                  </div>
                  <div className="text-sm text-black/60 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    {pvz.address?.full_address ||
                      [pvz.address?.street, pvz.address?.house].filter(Boolean).join(', ') ||
                      '—'}
                  </div>
                  {pvz.instruction && (
                    <div className="text-xs text-black/40 mt-1">{pvz.instruction}</div>
                  )}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

```

## `src/components/ui/YandexPvzMap.tsx`

```tsx
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import type { YandexPickupPoint } from '@/types/yandexDelivery'

declare global {
  interface Window {
    ymaps: any
    selectYandexPvz?: (id: string) => void
  }
}

const YANDEX_MAP_API_KEY = process.env.NEXT_PUBLIC_YANDEX_MAP_API_KEY || ''

export interface YandexPvzMapProps {
  points: YandexPickupPoint[]
  onSelect: (point: YandexPickupPoint) => void
  /** Центр карты [широта, долгота]; если не задан — по точкам или Москва */
  center?: [number, number]
}

export default function YandexPvzMap({
  points,
  onSelect,
  center,
}: YandexPvzMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const clustererRef = useRef<any>(null)
  const [scriptShouldLoad, setScriptShouldLoad] = useState(false)
  const [mapLoading, setMapLoading] = useState(true)
  const [mapReady, setMapReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPvz, setSelectedPvz] = useState<YandexPickupPoint | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setScriptShouldLoad(true)
      },
      { rootMargin: '80px', threshold: 0 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!scriptShouldLoad) return
    if (!YANDEX_MAP_API_KEY) {
      setError('Не указан API ключ Яндекс Карт')
      setMapLoading(false)
      return
    }
    if (window.ymaps) {
      setMapLoading(false)
      return
    }
    const script = document.getElementById('yandex-maps-api-script') as HTMLScriptElement | null
    const el = script || document.createElement('script')
    if (!script) {
      el.id = 'yandex-maps-api-script'
      ;(el as HTMLScriptElement).src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_MAP_API_KEY}&lang=ru_RU`
      el.async = true
      document.head.appendChild(el)
    }
    const onLoad = () => {
      window.ymaps.ready(() => setMapLoading(false))
    }
    el.addEventListener('load', onLoad)
    if (window.ymaps) setMapLoading(false)
    return () => el.removeEventListener('load', onLoad)
  }, [scriptShouldLoad])

  useEffect(() => {
    if (mapLoading || !window.ymaps || !containerRef.current) return
    setMapReady(false)
    if (mapRef.current) {
      mapRef.current.destroy()
      mapRef.current = null
    }
    const defaultCenter: [number, number] = center || [55.751574, 37.573856]
    mapRef.current = new window.ymaps.Map(containerRef.current, {
      center: defaultCenter,
      zoom: 11,
      controls: ['zoomControl', 'fullscreenControl'],
    }, { suppressMapOpenBlock: true })
    clustererRef.current = new window.ymaps.Clusterer({
      preset: 'islands#greenClusterIcons',
      groupByCoordinates: false,
    })
    mapRef.current.geoObjects.add(clustererRef.current)
    setMapReady(true)
    return () => {
      if (mapRef.current) {
        mapRef.current.destroy()
        mapRef.current = null
      }
    }
  }, [mapLoading, center])

  useEffect(() => {
    if (!mapReady || !mapRef.current || !clustererRef.current) return
    clustererRef.current.removeAll()
    const withCoords = points.filter(p => p.position?.latitude != null && p.position?.longitude != null)
    if (withCoords.length === 0) return
    const placemarks = withCoords.map(pvz => {
      const lat = pvz.position!.latitude
      const lon = pvz.position!.longitude
      const addr = pvz.address?.full_address || [pvz.address?.street, pvz.address?.house].filter(Boolean).join(', ') || '—'
      return new window.ymaps.Placemark(
        [lat, lon],
        {
          balloonContentHeader: `<strong>${pvz.name || 'ПВЗ'}</strong>`,
          balloonContentBody: `<div style="padding:6px 0;">📍 ${addr}</div>`,
          balloonContentFooter: `<button onclick="window.selectYandexPvz && window.selectYandexPvz('${pvz.id}')" style="background:#16a34a;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;width:100%;font-weight:500;">Выбрать</button>`,
          hintContent: pvz.name || 'ПВЗ',
        },
        { preset: 'islands#greenDotIcon' }
      )
    })
    clustererRef.current.add(placemarks)
    if (withCoords.length === 1 && !center) {
      mapRef.current.setCenter([withCoords[0].position!.latitude, withCoords[0].position!.longitude], 14)
    } else if (withCoords.length > 1 && !center) {
      const bounds = window.ymaps.util.bounds.fromPoints(
        withCoords.map((p: YandexPickupPoint) => [p.position!.latitude, p.position!.longitude])
      )
      mapRef.current.setBounds(bounds, { checkZoomRange: true, zoomMargin: 50 })
    }
  }, [mapReady, points, center])

  useEffect(() => {
    window.selectYandexPvz = (id: string) => {
      const p = points.find(x => x.id === id)
      if (p) setSelectedPvz(p)
    }
    return () => { delete (window as any).selectYandexPvz }
  }, [points])

  const handleSelect = useCallback(() => {
    if (selectedPvz) onSelect(selectedPvz)
  }, [selectedPvz, onSelect])

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="h-[320px] w-full overflow-hidden rounded-xl border border-black/10 bg-gray-100"
      >
        {!scriptShouldLoad && (
          <div className="flex h-full items-center justify-center text-black/40 text-sm">
            Карта загрузится при просмотре
          </div>
        )}
        {scriptShouldLoad && mapLoading && (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-white/80">
            <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            <span className="text-sm text-black/60">Загрузка карты...</span>
          </div>
        )}
        {scriptShouldLoad && !mapLoading && points.filter(p => p.position?.latitude).length === 0 && (
          <div className="flex h-full items-center justify-center text-black/50 text-sm">
            Нет пунктов с координатами для отображения на карте
          </div>
        )}
      </div>
      {selectedPvz && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3">
          <div className="flex items-start gap-2">
            <MapPin className="h-5 w-5 shrink-0 text-green-600" />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold text-green-800">{selectedPvz.name}</div>
              <div className="text-green-700">
                {selectedPvz.address?.full_address || [selectedPvz.address?.street, selectedPvz.address?.house].filter(Boolean).join(', ')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSelect}
            className="mt-2 w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Выбрать этот пункт
          </button>
        </div>
      )}
    </div>
  )
}

```

## `src/components/ui/DeliveryCourierMap.tsx`

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MapPin, Search } from 'lucide-react'

declare global {
  interface Window {
    ymaps: any
  }
}

const YANDEX_MAP_API_KEY = process.env.NEXT_PUBLIC_YANDEX_MAP_API_KEY || ''

export type CourierMapResult = {
  lat: number
  lon: number
  addressLine: string
  city?: string
  region?: string
  postalCode?: string
}

function parseGeoObject(geoObject: any): CourierMapResult | null {
  if (!geoObject?.geometry) return null
  const coords = geoObject.geometry.getCoordinates()
  if (!Array.isArray(coords) || coords.length < 2) return null
  const lat = Number(coords[0])
  const lon = Number(coords[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const addressLine = String(geoObject.getAddressLine?.() || '').trim()
  let city = ''
  let region = ''
  let postalCode = ''
  try {
    const meta = geoObject.properties?.get?.('metaDataProperty')?.GeocoderMetaData?.Address
    if (meta) {
      postalCode = String(meta.postal_code || '').trim()
      const components = meta.Components || []
      for (const c of components) {
        if (c.kind === 'locality') city = c.name || city
        if (c.kind === 'province' || c.kind === 'area') region = c.name || region
      }
    }
  } catch {
    /* ignore */
  }

  return { lat, lon, addressLine, city, region, postalCode }
}

export interface DeliveryCourierMapProps {
  onSelect: (result: CourierMapResult) => void
  initialCoords?: { lon: number; lat: number } | null
  hintCity?: string
}

export default function DeliveryCourierMap({
  onSelect,
  initialCoords,
  hintCity = 'Москва',
}: DeliveryCourierMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const placemarkRef = useRef<any>(null)
  const [scriptShouldLoad, setScriptShouldLoad] = useState(false)
  const [mapLoading, setMapLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchBusy, setSearchBusy] = useState(false)
  const [lastResult, setLastResult] = useState<CourierMapResult | null>(null)
  const initialAppliedRef = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setScriptShouldLoad(true)
      },
      { rootMargin: '100px', threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!scriptShouldLoad) return
    if (!YANDEX_MAP_API_KEY) {
      setError('Не указан API ключ Яндекс Карт')
      setMapLoading(false)
      return
    }
    const load = async () => {
      if (window.ymaps) {
        await new Promise<void>((r) => window.ymaps.ready(() => r()))
        setMapLoading(false)
        return
      }
      const existing = document.getElementById('yandex-maps-api-script') as HTMLScriptElement | null
      const script = existing || document.createElement('script')
      if (!existing) {
        script.id = 'yandex-maps-api-script'
        script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_MAP_API_KEY}&lang=ru_RU`
        script.async = true
        document.head.appendChild(script)
      }
      await new Promise<void>((resolve, reject) => {
        if (window.ymaps) {
          resolve()
          return
        }
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Не удалось загрузить Яндекс Карты'))
      })
      await new Promise<void>((r) => window.ymaps.ready(() => r()))
      setMapLoading(false)
    }
    load().catch((e) => {
      setError(e?.message || 'Ошибка карты')
      setMapLoading(false)
    })
  }, [scriptShouldLoad])

  const movePlacemark = useCallback(
    (lat: number, lon: number, geoObject: any) => {
      const parsed = parseGeoObject(geoObject)
      if (!parsed) return

      if (!mapRef.current || !window.ymaps) return

      if (placemarkRef.current) {
        mapRef.current.geoObjects.remove(placemarkRef.current)
        placemarkRef.current = null
      }
      placemarkRef.current = new window.ymaps.Placemark(
        [lat, lon],
        {
          balloonContentHeader: 'Адрес доставки',
          balloonContentBody: parsed.addressLine || 'Адрес уточнён',
        },
        { draggable: true, preset: 'islands#blueDotIcon' },
      )
      placemarkRef.current.events.add('dragend', () => {
        const pos = placemarkRef.current.geometry.getCoordinates()
        window.ymaps.geocode(pos).then((res: any) => {
          const first = res.geoObjects.get(0)
          if (!first) return
          const p = parseGeoObject(first)
          if (p) {
            setLastResult(p)
            onSelect(p)
          }
        })
      })
      mapRef.current.geoObjects.add(placemarkRef.current)
      mapRef.current.setCenter([lat, lon], 16)
      setLastResult(parsed)
      onSelect(parsed)
    },
    [onSelect],
  )

  const movePlacemarkRef = useRef(movePlacemark)
  movePlacemarkRef.current = movePlacemark

  useEffect(() => {
    if (mapLoading || !window.ymaps || !containerRef.current) return

    const center: [number, number] =
      initialCoords &&
      Number.isFinite(initialCoords.lat) &&
      Number.isFinite(initialCoords.lon)
        ? [initialCoords.lat, initialCoords.lon]
        : [55.751574, 37.573856]

    mapRef.current = new window.ymaps.Map(containerRef.current, {
      center,
      zoom:
        initialCoords &&
        Number.isFinite(initialCoords.lat) &&
        Number.isFinite(initialCoords.lon)
          ? 16
          : 10,
      controls: ['zoomControl', 'fullscreenControl', 'geolocationControl'],
    }, { suppressMapOpenBlock: true })

    mapRef.current.events.add('click', (e: any) => {
      const coords = e.get('coords')
      window.ymaps.geocode(coords).then((res: any) => {
        const first = res.geoObjects.get(0)
        if (!first) return
        movePlacemarkRef.current(coords[0], coords[1], first)
      })
    })

    if (
      !initialCoords ||
      !Number.isFinite(initialCoords.lat) ||
      !Number.isFinite(initialCoords.lon)
    ) {
      window.ymaps.geocode(`Россия, ${hintCity}`).then((res: any) => {
        const first = res.geoObjects.get(0)
        if (first && mapRef.current) {
          const c = first.geometry.getCoordinates()
          mapRef.current.setCenter(c, 11)
        }
      })
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.destroy()
        mapRef.current = null
      }
      placemarkRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- карта один раз при готовности API; move через ref
  }, [mapLoading, initialCoords?.lat, initialCoords?.lon, hintCity])

  useEffect(() => {
    if (mapLoading || !window.ymaps || !mapRef.current || initialAppliedRef.current) return
    if (
      !initialCoords ||
      !Number.isFinite(initialCoords.lat) ||
      !Number.isFinite(initialCoords.lon)
    ) {
      return
    }
    initialAppliedRef.current = true
    window.ymaps
      .geocode([initialCoords.lat, initialCoords.lon])
      .then((res: any) => {
        const first = res.geoObjects.get(0)
        if (first) {
          movePlacemark(initialCoords.lat, initialCoords.lon, first)
        } else {
          const manual: CourierMapResult = {
            lat: initialCoords.lat,
            lon: initialCoords.lon,
            addressLine: '',
          }
          setLastResult(manual)
          onSelect(manual)
        }
      })
  }, [mapLoading, initialCoords, movePlacemark, onSelect])

  const handleSearch = useCallback(() => {
    const q = searchQuery.trim()
    if (!q || !window.ymaps) return
    setSearchBusy(true)
    const query = q.includes('Россия') ? q : `Россия, ${q}`
    window.ymaps
      .geocode(query)
      .then((res: any) => {
        const first = res.geoObjects.get(0)
        if (!first) {
          setSearchBusy(false)
          return
        }
        const coords = first.geometry.getCoordinates()
        movePlacemark(coords[0], coords[1], first)
        setSearchBusy(false)
      })
      .catch(() => setSearchBusy(false))
  }, [searchQuery, movePlacemark])

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-black/50">
        Введите адрес и нажмите «Найти» или кликните по карте — метку можно перетащить.
      </p>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Город, улица, дом"
            className="h-11 w-full rounded-xl border border-black/10 pl-9 pr-3 text-sm outline-none focus:border-black/30"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={searchBusy || !searchQuery.trim()}
          className="h-11 shrink-0 rounded-xl bg-black px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {searchBusy ? '…' : 'Найти'}
        </button>
      </div>

      <div
        ref={containerRef}
        className="relative h-[320px] w-full overflow-hidden rounded-xl border border-black/10 bg-gray-100"
      >
        {!scriptShouldLoad && (
          <div className="flex h-full items-center justify-center text-black/40 text-sm">
            Карта загрузится при просмотре
          </div>
        )}
        {scriptShouldLoad && mapLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="text-sm text-black/60">Загрузка карты…</span>
          </div>
        )}
      </div>

      {lastResult && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3">
          <div className="flex items-start gap-2">
            <MapPin className="h-5 w-5 shrink-0 text-blue-600" />
            <div className="min-w-0 flex-1 text-sm text-blue-900">
              <div className="font-medium">Адрес доставки</div>
              <div className="mt-2 border-t border-blue-200 pt-2 text-black/80">
                {lastResult.addressLine || 'Уточните адрес поиском или перетащите метку'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

```

## `src/lib/yandexPickupCityArea.ts`

```typescript
import type { YandexPickupPointAddress } from '@/types/yandexDelivery'

/** Район/округ для формы адреса из ответа списка ПВЗ Яндекса */
export function yandexPickupCityArea(addr?: YandexPickupPointAddress): string {
  if (!addr) return ''
  const a = addr as Record<string, unknown>
  const keys = [
    'sub_region',
    'subRegion',
    'district',
    'area',
    'borough',
    'dependent_locality',
  ] as const
  for (const k of keys) {
    const v = a[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  const full = addr.full_address || ''
  const m = full.match(/(?:,|^)\s*(?:р-н|район|округ)\s*([^,]+)/i)
  if (m?.[1]) return m[1].trim()
  return ''
}

```

## `src/lib/ruAddressRegion.ts`

```typescript
import type { YandexPickupPoint } from '@/types/yandexDelivery'

/**
 * countryArea в Saleor для РФ — субъект; должен совпадать со справочником.
 * locality / full_address у Яндекса бывают на латинице или без слова «Санкт-Петербург».
 */
export function inferRuCountryAreaFromYandexPvz(
  pvz: YandexPickupPoint,
  cityHint: string,
): string {
  const addr = pvz.address
  const locality = (addr?.locality || '').trim()
  const apiRegion = (addr?.region || '').trim()
  const full = (addr?.full_address || '').toLowerCase()
  const postal = (addr?.postal_code || '').replace(/\D/g, '')
  const cityLow = (cityHint || locality).toLowerCase()

  const inSpbCity =
    full.includes('санкт-петербург') ||
    full.includes('санкт петербург') ||
    full.includes('st. petersburg') ||
    full.includes('saint petersburg') ||
    full.includes('sankt-peterburg') ||
    cityLow.includes('петербург') ||
    cityLow === 'спб' ||
    (postal.length >= 2 && postal.startsWith('19'))
  if (inSpbCity && !full.includes('ленинградская область')) {
    return 'Санкт-Петербург'
  }

  const inMskCity =
    full.includes('москва') ||
    full.includes('moscow') ||
    cityLow.includes('москва') ||
    cityLow.includes('зеленоград')
  if (inMskCity && !full.includes('московская область')) {
    return 'Москва'
  }

  if (apiRegion) {
    return apiRegion.replace(/^(г\.|город)\s*/i, '').trim()
  }

  return ''
}

```

## `src/lib/addressVspMeta.ts`

```typescript
/**
 * Служебная строка в начале `streetAddress2`: перевозчик, координаты ПВЗ Яндекса,
 * опционально id пункта Яндекса для расчёта (|pvz=...).
 * Пользовательский комментарий — со второй строки (или пусто).
 */

export type VspAddressMeta = {
  carrier: 'cdek' | 'yandex'
  lon?: number
  lat?: number
  /** id пункта из API Яндекса (pickup-points); для offers/calculate с type=pvz */
  yandexPvzId?: string
  /** Пункт выдачи или курьер до двери (по умолчанию для старых адресов — ПВЗ) */
  dropoff?: 'pvz' | 'courier'
}

function parseMetaFirstLine(first: string): VspAddressMeta | null {
  const m = first.match(/^__VSP:carrier=(cdek|yandex)(.*)__$/)
  if (!m) return null
  const carrier = m[1] as 'cdek' | 'yandex'
  const tail = m[2] || ''
  const meta: VspAddressMeta = { carrier }
  if (!tail) return meta
  for (const seg of tail.split('|')) {
    if (!seg) continue
    const eq = seg.indexOf('=')
    if (eq <= 0) continue
    const key = seg.slice(0, eq)
    const val = seg.slice(eq + 1)
    if (key === 'lon') {
      const n = Number(val)
      if (Number.isFinite(n)) meta.lon = n
    } else if (key === 'lat') {
      const n = Number(val)
      if (Number.isFinite(n)) meta.lat = n
    } else if (key === 'pvz' && val) {
      meta.yandexPvzId = val
    } else if (key === 'dropoff' && (val === 'pvz' || val === 'courier')) {
      meta.dropoff = val
    }
  }
  return meta
}

export function parseVspAddressMeta(streetAddress2: string): {
  meta: VspAddressMeta | null
  comment: string
} {
  const s = streetAddress2?.trim() ?? ''
  if (!s) return { meta: null, comment: '' }

  const nl = s.indexOf('\n')
  const first = nl === -1 ? s : s.slice(0, nl)
  const rest = nl === -1 ? '' : s.slice(nl + 1).trimEnd()

  const meta = parseMetaFirstLine(first)
  if (!meta) return { meta: null, comment: s }

  return { meta, comment: rest }
}

export function buildStreetAddress2WithMeta(
  meta: VspAddressMeta,
  userComment: string,
): string {
  let line = `__VSP:carrier=${meta.carrier}`
  if (
    meta.lon != null &&
    meta.lat != null &&
    Number.isFinite(meta.lon) &&
    Number.isFinite(meta.lat)
  ) {
    line += `|lon=${meta.lon}|lat=${meta.lat}`
  }
  const pvz = meta.yandexPvzId?.trim()
  if (pvz) {
    line += `|pvz=${pvz}`
  }
  if (meta.dropoff) {
    line += `|dropoff=${meta.dropoff}`
  }
  line += `__`
  const c = (userComment || '').trim()
  return c ? `${line}\n${c}` : line
}

/** Для отображения пользователю (профиль, checkout) */
export function displayStreetAddress2Comment(streetAddress2: string | undefined | null): string {
  return parseVspAddressMeta(streetAddress2 || '').comment
}

export function getShippingCarrierFromAddress(
  streetAddress2: string | undefined | null,
): 'cdek' | 'yandex' {
  // СДЭК скрыт в UI — по умолчанию считаем Яндексом
  return parseVspAddressMeta(streetAddress2 || '').meta?.carrier ?? 'yandex'
}

/** Режим доставки для отображения (ПВЗ / курьер) по метаданным адреса. */
export function getDeliveryDisplayMode(
  streetAddress2: string | undefined | null,
): { carrier: 'cdek' | 'yandex'; mode: 'pvz' | 'courier' } {
  const { meta } = parseVspAddressMeta(streetAddress2 || '')
  // СДЭК скрыт в UI — отображаем как Яндекс (для старых адресов без метки)
  const carrier = meta?.carrier ?? 'yandex'
  if (!meta) {
    return { carrier: 'yandex', mode: 'pvz' }
  }
  if (meta.dropoff === 'courier') {
    return { carrier, mode: 'courier' }
  }
  if (meta.dropoff === 'pvz') {
    return { carrier, mode: 'pvz' }
  }
  if (carrier === 'yandex') {
    if (meta.yandexPvzId?.trim()) {
      return { carrier, mode: 'pvz' }
    }
    if (
      meta.lon != null &&
      meta.lat != null &&
      Number.isFinite(meta.lon) &&
      Number.isFinite(meta.lat)
    ) {
      return { carrier, mode: 'courier' }
    }
    return { carrier, mode: 'pvz' }
  }
  if (
    meta.lon != null &&
    meta.lat != null &&
    Number.isFinite(meta.lon) &&
    Number.isFinite(meta.lat)
  ) {
    return { carrier, mode: 'courier' }
  }
  return { carrier, mode: 'pvz' }
}

/**
 * Одна строка для списка доставки: «Яндекс Доставка, ПВЗ: Город, адрес».
 */
export function formatDeliveryAddressSummary(address: {
  streetAddress2?: string | null
  city?: string | null
  streetAddress1?: string | null
}): string {
  const { carrier, mode } = getDeliveryDisplayMode(address.streetAddress2)
  const carrierLabel = carrier === 'yandex' ? 'Яндекс Доставка' : 'Яндекс Доставка'
  const modeLabel = mode === 'pvz' ? 'ПВЗ' : 'Курьер'
  const city = (address.city || '').trim()
  const street = (address.streetAddress1 || '').trim()
  const loc = [city, street].filter(Boolean).join(', ')
  return loc ? `${carrierLabel}, ${modeLabel}: ${loc}` : `${carrierLabel}, ${modeLabel}`
}

```

AddresModal.tsx:
'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { toast } from 'react-toastify'
import { CustomButton as Button } from '../common/CustomButton'
import { AddressInfo } from '@/graphql/types/auth.types'
import { createAddress, updateAddress } from '@/graphql/queries/adress.service'
import PhoneInput from '../ui/PhoneInput'
import { formatPhoneInputValue, isValidRuPhone } from '@/lib/ruPhone'
import { useUserStore } from '@/stores/useUser'
import YandexPvzList from '../ui/YandexPvzList'
import DeliveryCourierMap, { type CourierMapResult } from '../ui/DeliveryCourierMap'
import type { YandexPickupPoint } from '@/types/yandexDelivery'
import {
  buildStreetAddress2WithMeta,
  parseVspAddressMeta,
  type VspAddressMeta,
} from '@/lib/addressVspMeta'
import { yandexPickupCityArea } from '@/lib/yandexPickupCityArea'
import { inferRuCountryAreaFromYandexPvz } from '@/lib/ruAddressRegion'
import { yandexPointIdForCargoOffers } from '@/lib/yandexPickupPointId'

interface AddressModalProps {
  visible: boolean
  onClose: () => void
  /** После добавления: newAddress — только что созданный, updatedList — полный список с сервера (чтобы список «прогрузился» как в СДЭК) */
  onAddressAdded: (address: AddressInfo, updatedList?: AddressInfo[]) => void
  onAddressUpdated?: (address: AddressInfo) => void
  addressToEdit?: AddressInfo | null
}

interface FormData {
  firstName: string
  lastName: string
  phone: string
  country: string
  countryArea: string
  city: string
  cityArea: string
  streetAddress1: string
  streetAddress2: string
  postalCode: string
  companyName: string
  isDefaultShippingAddress: boolean
}

interface FormErrors {
  [key: string]: string
}

/** Одна сущность для профиля и checkout: `ProfileIndex`, `OrderDelivery`. */
export default function AddressModal({
  visible,
  onClose,
  onAddressAdded,
  onAddressUpdated,
  addressToEdit,
}: AddressModalProps) {
  const { user } = useUserStore()
  const [show, setShow] = useState(visible)
  const [loading, setLoading] = useState(false)

  // Determine if we are in Edit Mode
  const isEditMode = !!addressToEdit

  const initialFormState: FormData = {
    firstName: '',
    lastName: '',
    phone: '',
    country: 'RU', // По умолчанию Россия
    countryArea: '',
    city: '',
    cityArea: '',
    streetAddress1: '',
    streetAddress2: '',
    postalCode: '',
    companyName: '',
    isDefaultShippingAddress: false,
  }

  const [formData, setFormData] = useState<FormData>(initialFormState)
  const [errors, setErrors] = useState<FormErrors>({})
  /** Координаты выбранного ПВЗ Яндекса (для расчёта доставки на checkout) */
  const [yandexPvzCoords, setYandexPvzCoords] = useState<{
    lon: number
    lat: number
  } | null>(null)
  /** id пункта из API Яндекса — для расчёта с type=pvz */
  const [yandexPvzId, setYandexPvzId] = useState<string | null>(null)
  const [yandexDropoff, setYandexDropoff] = useState<'pvz' | 'courier'>('pvz')
  /** Курьер до двери (СДЭК и Яндекс): координаты с карты */
  const [courierCoords, setCourierCoords] = useState<{
    lon: number
    lat: number
  } | null>(null)

  useEffect(() => {
    if (visible) {
      setShow(true)

      if (addressToEdit) {
        const { meta, comment } = parseVspAddressMeta(
          addressToEdit.streetAddress2 || '',
        )
        // СДЭК скрыт в UI — в модалке всегда работаем как «Яндекс»
        setCourierCoords(null)
        const yPvz = Boolean(meta?.yandexPvzId?.trim())
        const yCourier =
          meta?.dropoff === 'courier' ||
          (!yPvz &&
            meta?.lon != null &&
            meta?.lat != null &&
            Number.isFinite(meta.lon) &&
            Number.isFinite(meta.lat))
        setYandexDropoff(yCourier ? 'courier' : 'pvz')
        if (yCourier) {
          if (
            meta?.lon != null &&
            meta?.lat != null &&
            Number.isFinite(meta.lon) &&
            Number.isFinite(meta.lat)
          ) {
            setCourierCoords({ lon: meta.lon, lat: meta.lat })
          } else {
            setCourierCoords(null)
          }
          setYandexPvzCoords(null)
          setYandexPvzId(null)
        } else if (yPvz) {
          setYandexPvzId(meta?.yandexPvzId?.trim() || null)
          if (
            meta?.lon != null &&
            meta?.lat != null &&
            Number.isFinite(meta.lon) &&
            Number.isFinite(meta.lat)
          ) {
            setYandexPvzCoords({ lon: meta.lon, lat: meta.lat })
          } else {
            setYandexPvzCoords(null)
          }
        } else {
          setYandexPvzCoords(null)
          setYandexPvzId(null)
        }

        // Safe extraction of country code (handles if backend returns object or string)
        const countryCode =
          typeof addressToEdit.country === 'object' && addressToEdit.country !== null
            ? (addressToEdit.country as any).code
            : addressToEdit.country

        setFormData({
          firstName: addressToEdit.firstName || '',
          lastName: addressToEdit.lastName || '',
          phone: formatPhoneInputValue(addressToEdit.phone || ''),
          country: countryCode || 'RU', // По умолчанию Россия
          countryArea: addressToEdit.countryArea || '',
          city: addressToEdit.city || '', // Ensure this is not undefined
          cityArea: addressToEdit.cityArea || '',
          streetAddress1: addressToEdit.streetAddress1 || '',
          streetAddress2: comment,
          postalCode: addressToEdit.postalCode || '',
          companyName: addressToEdit.companyName || '',
          isDefaultShippingAddress: addressToEdit.isDefaultShippingAddress || false,
        })
      } else {
        setYandexDropoff('pvz')
        setCourierCoords(null)
        setYandexPvzCoords(null)
        setYandexPvzId(null)
        // Pre-fill for new address using User Profile data
        setFormData({
          ...initialFormState,
          firstName: user.name || '',
          lastName: user.familyName || '',
          phone: formatPhoneInputValue(user.phone || ''),
        })
      }
    } else {
      const timeout = setTimeout(() => {
        setShow(false)
        setErrors({})
      }, 300)
      return () => clearTimeout(timeout)
    }
  }, [visible, addressToEdit, user])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (visible) window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, onClose])

  const validatePostalCode = (code: string, country: string): boolean => {
    const cleanCode = code.replace(/[\s-]/g, '')
    const patterns: { [key: string]: RegExp } = {
      UZ: /^\d{6}$/,
      RU: /^\d{6}$/,
      US: /^\d{5}(-\d{4})?$/,
      GB: /^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i,
      CA: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i,
      DE: /^\d{5}$/,
      FR: /^\d{5}$/,
      IT: /^\d{5}$/,
      ES: /^\d{5}$/,
      AU: /^\d{4}$/,
      JP: /^\d{7}$/,
      CN: /^\d{6}$/,
      IN: /^\d{6}$/,
      BR: /^\d{5}-?\d{3}$/,
      MX: /^\d{5}$/,
    }

    const pattern = patterns[country]
    if (pattern) {
      return pattern.test(cleanCode)
    }
    return /^\d{3,10}$/.test(cleanCode)
  }

  const validateForm = (): true | FormErrors => {
    const newErrors: FormErrors = {}

    if (!formData.firstName.trim()) newErrors.firstName = 'Заполните имя'
    if (!formData.lastName.trim()) newErrors.lastName = 'Заполните фамилию'
    if (!formData.phone.trim()) newErrors.phone = 'Укажите номер телефона'
    else if (!isValidRuPhone(formData.phone)) {
      newErrors.phone = 'Номер в формате +7 (900) 000-00-00'
    }
    // Для РФ Saleor часто принимает пустой регион; неверная строка даёт INVALID
    if (
      formData.country !== 'RU' &&
      !formData.countryArea.trim()
    ) {
      newErrors.countryArea = 'Обязательное поле'
    }
    if (!formData.city.trim()) newErrors.city = 'Заполните город'
    if (formData.country !== 'RU' && !formData.cityArea.trim()) {
      newErrors.cityArea = 'Обязательное поле'
    }
    if (!formData.streetAddress1.trim())
      newErrors.streetAddress1 = 'Заполните улицу и номер дома'
    if (!formData.postalCode.trim()) {
      newErrors.postalCode = 'Заполните почтовый индекс'
    } else if (!validatePostalCode(formData.postalCode, formData.country)) {
      const formats: { [key: string]: string } = {
        UZ: '6 цифр (например: 100000)',
        RU: '6 цифр (например: 101000)',
        US: '5 цифр (например: 12345)',
        GB: 'формат UK (например: SW1A 1AA)',
        CA: 'формат CA (например: K1A 0B1)',
      }
      const expectedFormat =
        formats[formData.country] || 'корректный почтовый индекс'
      newErrors.postalCode = `Неверный формат. Ожидается: ${expectedFormat}`
    }

    // companyName не обязательное поле

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0 ? true : newErrors
  }

  const handleSubmit = async () => {
    console.log('--- Address Form Submit Data ---', formData)
    const validation = validateForm()
    if (validation !== true) {
      const message = Object.values(validation).join('. ')
      toast.error(message)
      return
    }

    setLoading(true)

    try {
      const dropoff = yandexDropoff

      const metaPayload: VspAddressMeta = {
        carrier: 'yandex',
        dropoff,
        ...(dropoff === 'courier' &&
        courierCoords &&
        Number.isFinite(courierCoords.lon) &&
        Number.isFinite(courierCoords.lat)
          ? { lon: courierCoords.lon, lat: courierCoords.lat }
          : {}),
        ...(dropoff === 'pvz' && yandexPvzId?.trim()
          ? { yandexPvzId: yandexPvzId.trim() }
          : {}),
        ...(dropoff === 'pvz' &&
        yandexPvzCoords &&
        Number.isFinite(yandexPvzCoords.lon) &&
        Number.isFinite(yandexPvzCoords.lat)
          ? { lon: yandexPvzCoords.lon, lat: yandexPvzCoords.lat }
          : {}),
      }
      const streetAddress2WithMeta = buildStreetAddress2WithMeta(
        metaPayload,
        formData.streetAddress2,
      )

      const addressInput = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        country: formData.country,
        countryArea: formData.countryArea,
        city: formData.city,
        cityArea: formData.cityArea,
        streetAddress1: formData.streetAddress1,
        streetAddress2: streetAddress2WithMeta,
        postalCode: formData.postalCode,
        companyName: formData.companyName,
      }

      if (isEditMode && addressToEdit) {
        // --- EDIT EXISTING ADDRESS ---
        // Note: updateAddress usually returns a list of addresses or the updated user object
        // Adjust this depending on exactly what your service returns. 
        // Assuming it returns the updated list like createAddress based on your context.
        const updatedAddresses = await updateAddress(
          addressToEdit.id,
          addressInput
        )

        // Find the updated address in the returned list
        const updatedAddress = updatedAddresses.find((a: AddressInfo) => a.id === addressToEdit.id)

        if (onAddressUpdated && updatedAddress) {
          onAddressUpdated(updatedAddress)
        } else if (onAddressUpdated) {
          // Fallback if the backend returns array but ID changed or logic differs
          onAddressUpdated(updatedAddresses.find((a: AddressInfo) => a.streetAddress1 === addressInput.streetAddress1) || updatedAddresses[0])
        }

        toast.success('Адрес успешно обновлен!')
      } else {
        // --- CREATE NEW ADDRESS ---
        const updatedAddresses = await createAddress(
          addressInput,
          formData.isDefaultShippingAddress,
        )
        // Новый адрес обычно последний в ответе Saleor; передаём полный список, чтобы родитель обновил список и выбрал новый (как с СДЭК)
        const newAddress = updatedAddresses[updatedAddresses.length - 1]
        onAddressAdded(newAddress, updatedAddresses)
        toast.success('Адрес успешно добавлен!')
      }

      onClose()

    } catch (error: any) {
      toast.error(`ОШИБКА: ${error.message || 'неизвестно'}`)
      console.error('Address operation error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (
    field: keyof FormData,
    value: string | boolean,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }))
    }
  }

  const handleYandexPvzChoose = (pvz: YandexPickupPoint) => {
    setYandexDropoff('pvz')
    setCourierCoords(null)
    const city =
      pvz.address?.locality || pvz.address?.region || ''
    const inferredRegion = inferRuCountryAreaFromYandexPvz(pvz, city)

    const area = yandexPickupCityArea(pvz.address)

    setFormData((prev) => ({
      ...prev,
      country: 'RU',
      countryArea: inferredRegion || prev.countryArea,
      city: city || prev.city,
      cityArea: area || prev.cityArea,
      streetAddress1: pvz.address?.full_address || prev.streetAddress1,
      postalCode: pvz.address?.postal_code || prev.postalCode,
      companyName: pvz.name || prev.companyName,
    }))

    const cargoId = yandexPointIdForCargoOffers(pvz)
    setYandexPvzId(cargoId || null)

    if (
      pvz.position &&
      Number.isFinite(pvz.position.longitude) &&
      Number.isFinite(pvz.position.latitude)
    ) {
      setYandexPvzCoords({
        lon: pvz.position.longitude,
        lat: pvz.position.latitude,
      })
    } else {
      setYandexPvzCoords(null)
    }
  }

  const handleCourierMapChoose = (r: CourierMapResult) => {
    setCourierCoords({ lon: r.lon, lat: r.lat })
    setFormData((prev) => ({
      ...prev,
      country: 'RU',
      countryArea: r.region || prev.countryArea,
      city: r.city || prev.city,
      streetAddress1: r.addressLine || prev.streetAddress1,
      postalCode: r.postalCode || prev.postalCode,
    }))
    setYandexDropoff('courier')
    setYandexPvzId(null)
    setYandexPvzCoords(null)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'
          }`}
      />

      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: visible ? 0 : '100%' }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="relative w-full md:w-[600px] h-full bg-white shadow-xl rounded-tl-3xl md:rounded-l-3xl flex flex-col"
      >
        <div className="max-sm:p-4 p-8 border-b border-black/10 flex items-center justify-between shrink-0">
          <h1 className="text-2xl font-semibold">
            {isEditMode ? 'Редактировать адрес' : 'Новый адрес'}
          </h1>
          <button
            onClick={onClose}
            className="hover:border-black border border-transparent rounded-full p-1 duration-300"
          >
            <Image src="/close.png" alt="close" width={24} height={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto max-sm:px-4 px-8 py-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col">
              <label className="text-sm font-medium mb-2">Имя *</label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                className={`h-12 px-4 rounded-xl border text-base outline-none transition ${errors.firstName
                  ? 'border-red-500'
                  : 'border-black/10 focus:border-black/30'
                  }`}
              />
              {errors.firstName && (
                <span className="text-red-500 text-sm mt-1">
                  {errors.firstName}
                </span>
              )}
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-medium mb-2">Фамилия *</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                className={`h-12 px-4 rounded-xl border text-base outline-none transition ${errors.lastName
                  ? 'border-red-500'
                  : 'border-black/10 focus:border-black/30'
                  }`}
              />
              {errors.lastName && (
                <span className="text-red-500 text-sm mt-1">
                  {errors.lastName}
                </span>
              )}
            </div>
          </div>

          <PhoneInput
            value={formData.phone}
            onChange={(value) => handleInputChange('phone', value)}
            error={errors.phone}
            placeholder="+7 (900) 000-00-00"
            showFormatHint={false}
          />

          {/* Доставка: выбор ПВЗ / курьер */}
          <div className="flex flex-col gap-3 p-4 border border-black/10 rounded-xl bg-gray-50/50">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-base font-semibold">Способ доставки</h3>
                <p className="text-sm text-black/60">
                  Яндекс Доставка: пункт выдачи или курьер до двери
                </p>
              </div>
            </div>

            <div className="flex gap-2 p-1 bg-black/5 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setYandexDropoff('pvz')
                  setCourierCoords(null)
                }}
                className={`flex-1 h-10 rounded-lg text-sm font-semibold transition ${
                  yandexDropoff === 'pvz'
                    ? 'bg-white shadow-sm text-black'
                    : 'text-black/40 hover:text-black/60'
                }`}
              >
                Пункт выдачи
              </button>
              <button
                type="button"
                onClick={() => {
                  setYandexDropoff('courier')
                  setYandexPvzId(null)
                  setYandexPvzCoords(null)
                }}
                className={`flex-1 h-10 rounded-lg text-sm font-semibold transition ${
                  yandexDropoff === 'courier'
                    ? 'bg-white shadow-sm text-black'
                    : 'text-black/40 hover:text-black/60'
                }`}
              >
                Курьером
              </button>
            </div>

            <div className="mt-2 border border-black/10 rounded-xl p-3 bg-white max-h-[520px] overflow-y-auto min-h-[200px]">
              {yandexDropoff === 'pvz' && (
                <YandexPvzList
                  onChoose={handleYandexPvzChoose}
                  defaultCity={formData.city?.trim() || 'Москва'}
                />
              )}
              {yandexDropoff === 'courier' && (
                <DeliveryCourierMap
                  key={`yandex-courier-${addressToEdit?.id ?? 'new'}`}
                  onSelect={handleCourierMapChoose}
                  initialCoords={courierCoords}
                  hintCity={formData.city?.trim() || 'Москва'}
                />
              )}
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-sm font-medium mb-2">
              Регион
              {formData.country === 'RU' && (
                <span className="font-normal text-black/50"> — для РФ можно оставить пустым</span>
              )}
            </label>
            <input
              type="text"
              value={formData.countryArea}
              onChange={(e) => handleInputChange('countryArea', e.target.value)}
              placeholder="Область, край"
              className={`h-12 px-4 rounded-xl border text-base outline-none transition ${errors.countryArea
                ? 'border-red-500'
                : 'border-black/10 focus:border-black/30'
                }`}
            />
            {errors.countryArea && (
              <span className="text-red-500 text-sm mt-1">
                {errors.countryArea}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col">
              <label className="text-sm font-medium mb-2">Город *</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => handleInputChange('city', e.target.value)}
                className={`h-12 px-4 rounded-xl border text-base outline-none transition ${errors.city
                  ? 'border-red-500'
                  : 'border-black/10 focus:border-black/30'
                  }`}
              />
              {errors.city && (
                <span className="text-red-500 text-sm mt-1">{errors.city}</span>
              )}
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-medium mb-2">
                Район
                {formData.country === 'RU' && (
                  <span className="font-normal text-black/50"> — необязательно</span>
                )}
              </label>
              <input
                type="text"
                value={formData.cityArea}
                onChange={(e) => handleInputChange('cityArea', e.target.value)}
                className={`h-12 px-4 rounded-xl border text-base outline-none transition ${errors.cityArea
                  ? 'border-red-500'
                  : 'border-black/10 focus:border-black/30'
                  }`}
              />
              {errors.cityArea && (
                <span className="text-red-500 text-sm mt-1">
                  {errors.cityArea}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-sm font-medium mb-2">Адрес улицы *</label>
            <input
              type="text"
              value={formData.streetAddress1}
              onChange={(e) =>
                handleInputChange('streetAddress1', e.target.value)
              }
              className={`h-12 px-4 rounded-xl border text-base outline-none transition ${errors.streetAddress1
                ? 'border-red-500'
                : 'border-black/10 focus:border-black/30'
                }`}
            />
            {errors.streetAddress1 && (
              <span className="text-red-500 text-sm mt-1">
                {errors.streetAddress1}
              </span>
            )}
          </div>

          <div className="flex flex-col">
            <label className="text-sm font-medium mb-2">
              Дополнительный адрес (комментарий)
            </label>
            <input
              type="text"
              value={formData.streetAddress2}
              onChange={(e) =>
                handleInputChange('streetAddress2', e.target.value)
              }
              placeholder="Например: Квартира 5, подъезд 2"
              className="h-12 px-4 rounded-xl border border-black/10 text-base outline-none transition focus:border-black/30"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm font-medium mb-2">
              Почтовый индекс *
            </label>
            <input
              type="text"
              value={formData.postalCode}
              onChange={(e) => handleInputChange('postalCode', e.target.value)}
              placeholder={
                formData.country === 'UZ'
                  ? '100000'
                  : formData.country === 'RU'
                    ? '101000'
                    : formData.country === 'US'
                      ? '12345'
                      : 'Почтовый индекс'
              }
              className={`h-12 px-4 rounded-xl border text-base outline-none transition ${errors.postalCode
                ? 'border-red-500'
                : 'border-black/10 focus:border-black/30'
                }`}
            />
            {errors.postalCode && (
              <span className="text-red-500 text-sm mt-1">
                {errors.postalCode}
              </span>
            )}
          </div>

          {
            !isEditMode && (
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isDefaultShippingAddress}
                  onChange={(e) =>
                    handleInputChange('isDefaultShippingAddress', e.target.checked)
                  }
                  className="w-5 h-5 rounded border-black/20 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium">
                  Установить как адрес доставки по умолчанию
                </span>
              </label>
            )
          }
        </div >

        <div className="max-sm:p-4 p-8 border-t border-black/10 shrink-0">
          <Button
            onClick={handleSubmit}
            className={`${loading ? 'disabled' : ''} w-full justify-center `}
          >
            <h2 className="font-semibold">
              {loading
                ? 'Сохранение...'
                : isEditMode
                  ? 'Сохранить изменения'
                  : 'Добавить адрес'}
            </h2>
          </Button>
        </div>
      </motion.div >
    </div >
  )
}

OrderDelivery:
'use client'

import { getMeInfo } from '@/graphql/queries/auth.service'
import { AddressInfo } from '@/graphql/types/auth.types'
import { useEffect, useState } from 'react'
import AddressModal from '../modals/AddressModal'
import { Trash } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { deleteAddress } from '@/graphql/queries/adress.service'
import { toast } from 'react-toastify'
import { useCartStore } from '@/stores/useCart'
import {
  calculateDelivery,
  getCheapestOffer,
  parseYandexOfferPrice,
} from '@/lib/api/yandexDelivery'
import {
  parseVspAddressMeta,
  displayStreetAddress2Comment,
  formatDeliveryAddressSummary,
} from '@/lib/addressVspMeta'

export default function OrderDelivery() {
  const [selected, setSelected] = useState('')
  const [addresses, setAddresses] = useState<AddressInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingAddress, setEditingAddress] = useState<AddressInfo | null>(null)
  const { items, setShippingPrice, setShippingLoading, setShippingCarrier } =
    useCartStore()

  const updateShippingPrice = async (address: AddressInfo) => {
    try {
      setShippingLoading(true)

      // Если нет города, не пытаемся считать
      if (!address.city) {
        console.warn('Skipping shipping calculation: City is missing')
        setShippingPrice(0)
        setShippingCarrier('yandex')
        return
      }

      // === Яндекс.Доставка (ПВЗ или курьер: offers + mode door|pvz) ===
      try {
        const { meta } = parseVspAddressMeta(address.streetAddress2 || '')
        const usePvz =
          meta?.dropoff === 'pvz' ||
          (meta?.dropoff !== 'courier' && Boolean(meta?.yandexPvzId?.trim()))
        const pvzId = usePvz ? meta?.yandexPvzId?.trim() : undefined
        const coords =
          meta?.lon != null &&
          meta?.lat != null &&
          Number.isFinite(meta.lon) &&
          Number.isFinite(meta.lat)
            ? ([meta.lon, meta.lat] as [number, number])
            : undefined
        const shipmentLines = items
          .filter((i) => i.product)
          .map((i) => ({
            quantity: i.quantity,
            weightKg: i.product.weight,
            lengthMm: i.product.length,
            widthMm: i.product.width,
            heightMm: i.product.height,
          }))
        const res = await calculateDelivery({
          city: address.city.trim(),
          fullname: address.streetAddress1,
          coordinates: coords,
          mode: usePvz && pvzId ? 'pvz' : 'door',
          ...(usePvz && pvzId ? { yandexPointId: pvzId } : {}),
          ...(shipmentLines.length > 0 ? { shipmentLines } : {}),
        })
        const allOffers = res.offers || []
        const positiveOffers = allOffers.filter(
          (o) => parseYandexOfferPrice(o.price?.total_price) > 0,
        )
        const cheapest = getCheapestOffer(
          positiveOffers.length > 0 ? positiveOffers : allOffers,
        )
        if (cheapest?.price?.total_price != null) {
          const sum = parseYandexOfferPrice(cheapest.price.total_price)
          setShippingCarrier('yandex')
          setShippingPrice(sum > 0 ? Math.round(sum) : 0)
          return
        }
      } catch (yErr) {
        console.error('Yandex shipping calculation failed:', yErr)
      }

      setShippingCarrier('yandex')
      setShippingPrice(0)
    } catch (e) {
      console.error('Failed to calculate shipping:', e)
      setShippingCarrier('yandex')
      setShippingPrice(0)
    } finally {
      setShippingLoading(false)
    }
  }

  useEffect(() => {
    getMeInfo()
      .then((data) => {
        if (data && data.addresses) {
          setAddresses(data.addresses)

          if (data.addresses.length > 0) {
            const def = data.addresses.find((a: AddressInfo) => a.isDefaultShippingAddress)
            const id = def?.id || data.addresses[0].id
            setSelected(id)

            // Также рассчитаем доставку для адреса по умолчанию при загрузке
            const currentAddr = data.addresses.find((a: AddressInfo) => a.id === id) || data.addresses[0]
            if (currentAddr) {
              console.log('Calculating shipping for initial address:', currentAddr.city)
              updateShippingPrice(currentAddr)
            }
          }
        }
      })
      .catch((error) => {
        console.error('Error fetching user info:', error)
      })
      .finally(() => {
        setLoading(false)
      })
  }, []) // Загрузка адресов только при старте

  // Перерасчет доставки при изменении товаров в корзине
  useEffect(() => {
    if (selected && addresses.length > 0) {
      const currentAddr = addresses.find((a: AddressInfo) => a.id === selected)
      if (currentAddr) {
        // Дебаунс можно было бы добавить, но пока вызываем сразу
        updateShippingPrice(currentAddr)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const handleAddressSelect = (id: string) => {
    setSelected(id)
    const addr = addresses.find(a => a.id === id)
    if (addr) {
      updateShippingPrice(addr)
    }
  }

  const handleAddressAdded = (newAddress: AddressInfo, updatedList?: AddressInfo[]) => {
    if (updatedList?.length) {
      setAddresses(updatedList)
    } else {
      setAddresses((prev) => [...prev, newAddress])
    }
    setSelected(newAddress.id)
    updateShippingPrice(newAddress)
  }

  const handleAddressUpdated = (updatedAddress: AddressInfo) => {
    setAddresses(prev =>
      prev.map(addr => (addr.id === updatedAddress.id ? updatedAddress : addr)),
    )
    if (selected === updatedAddress.id) {
      updateShippingPrice(updatedAddress)
    }
  }

  const handleOpenEdit = (address: AddressInfo) => {
    setEditingAddress(address)
    setModalVisible(true)
  }

  const handleDeleteAddress = () => {
    deleteAddress(selected).then(() => {
      toast.success('Адрес удален')
      setAddresses(prev => {
        const remaining = prev.filter(addr => addr.id !== selected)
        if (remaining.length > 0) {
          const def =
            remaining.find(a => a.isDefaultShippingAddress) || remaining[0]
          setSelected(def.id)
        } else {
          setSelected('')
        }
        return remaining
      })
    })
  }

  if (loading) {
    return (
      <section className="select-none">
        <div className="mb-6 sm:mb-8 md:mb-10">
          <h2 className="text-2xl sm:text-3xl md:text-[32px] leading-tight font-semibold mb-4 sm:mb-5 md:mb-6">
            Доставка
          </h2>
          <p className="text-black/40 text-sm sm:text-base">Загрузка...</p>
        </div>
      </section>
    )
  }

  return (
    <>
      <section className="select-none">
        <div className="mb-10">
          <h2 className="text-[32px] leading-tight font-semibold mb-6">
            Доставка
          </h2>

          {addresses.length === 0 ? (
            <p className="text-black/40 mb-6">
              У вас пока нет сохраненных адресов доставки
            </p>
          ) : (
            <ul className="space-y-4 sm:space-y-5 md:space-y-6 mb-4 sm:mb-5 md:mb-6">
              {addresses.map((address) => {
                const addrComment = displayStreetAddress2Comment(
                  address.streetAddress2,
                )
                return (
                <li key={address.id} className="relative">
                  <div className="flex items-start sm:items-center gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => handleAddressSelect(address.id)}
                      className="min-w-0 flex-1 text-left flex items-start sm:items-center gap-2 sm:gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                    >
                      <span
                        className={`mt-1 sm:mt-0 inline-flex h-4 w-4 sm:h-5 sm:w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                          selected === address.id
                            ? 'border-[#2688EB] bg-[#2688EB]'
                            : 'border-black/25 bg-transparent'
                        }`}
                      >
                        {selected === address.id ? (
                          <svg
                            viewBox="0 0 20 20"
                            className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 fill-white"
                          >
                            <path d="M7.6 14.2 3.8 10.4l1.4-1.4 2.4 2.4L14.8 4.8l1.4 1.4-8.6 8z" />
                          </svg>
                        ) : null}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="text-sm sm:text-[15px] md:text-[16px] leading-5 sm:leading-6 font-medium">
                          {address.firstName} {address.lastName}
                        </div>
                        <div className="text-xs sm:text-[13px] md:text-[14px] leading-5 sm:leading-6 text-black/50 break-words">
                          {formatDeliveryAddressSummary(address)}
                          {address.companyName ? ` · ${address.companyName}` : ''}
                        </div>
                        {addrComment ? (
                          <div className="text-xs sm:text-[13px] md:text-[14px] leading-5 sm:leading-6 text-black/40">
                            <span>Комментарий: </span>
                            <span className="text-black font-medium">
                              {addrComment}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </button>

                    <AddressOptions
                      onDelete={handleDeleteAddress}
                      onEdit={() => handleOpenEdit(address)}
                    />
                  </div>
                </li>
              )})}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setModalVisible(true)}
            className="w-full h-10 sm:h-11 rounded-full border border-black text-sm sm:text-[15px] md:text-[16px] font-semibold hover:bg-black/[0.03] transition"
          >
            + Новый адрес
          </button>
        </div>
      </section>

      <AddressModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false)
          setEditingAddress(null)
        }}
        onAddressAdded={handleAddressAdded}
        onAddressUpdated={handleAddressUpdated}
        addressToEdit={editingAddress}
      />
    </>
  )
}
function AddressOptions({
  onDelete,
  onEdit,
}: {
  onDelete: () => void
  onEdit: () => void
}) {
  const [open, setOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <div className="mt-1 ml-2 inline-flex h-[22px] w-[22px] items-center justify-center rounded-[6px] bg-[#FAFAFA] hover:bg-black/4 border border-black/20 relative cursor-pointer">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-black">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </div>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="right" className="p-2 bg-white border space-y-1">
          <button
            className="flex items-center gap-2 w-full px-2 py-1 rounded-sm hover:bg-gray-100 text-sm"
            onClick={() => {
              setDropdownOpen(false)
              onEdit()
            }}
          >
            <span>Редактировать</span>
          </button>
          <button
            className="bg-red-700 text-white flex p-1 rounded-sm items-center gap-2 w-full text-sm"
            onClick={() => {
              setDropdownOpen(false)
              setOpen(true)
            }}
          >
            <Trash className="w-4 h-4" />
            Удалить адрес
          </button>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className='max-w-[400px] z-100'>
          <AlertDialogHeader>
            <AlertDialogTitle>Вы абсолютно уверены?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие невозможно отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Продолжать</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}