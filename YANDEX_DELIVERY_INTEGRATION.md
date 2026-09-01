# Интеграция Яндекс Доставки (Saleor + Checkout + ЛК)

Документ описывает, как в проекте реализована **Яндекс Доставка** для:
- выбора способа доставки (ПВЗ / курьер до двери) в модалке адреса (ЛК и checkout используют один и тот же компонент),
- отображения выбранного адреса в списках и на checkout,
- расчёта стоимости доставки на checkout через API Яндекса.

Цель: чтобы разработчик мог **повторить такую же интеграцию** в аналогичном проекте (тот же ЛК, тот же checkout, Saleor).

---

## 1) Общая идея: метаданные доставки в `streetAddress2` (Saleor)

Saleor даёт стандартные поля адреса (`city`, `streetAddress1`, `streetAddress2`, …).  
Чтобы не менять схему и не добавлять кастомные поля на бэке, мы храним **служебные метаданные** доставки в начале `streetAddress2`, а реальный комментарий пользователя — ниже.

Формат первой строки:

`__VSP:carrier=<yandex|cdek>|lon=<...>|lat=<...>|pvz=<...>|dropoff=<pvz|courier>__`

Дальше (со второй строки) — свободный комментарий пользователя.

Реализация парсинга/сборки меты:
- `src/lib/addressVspMeta.ts`
  - `parseVspAddressMeta(streetAddress2)`
  - `buildStreetAddress2WithMeta(meta, userComment)`
  - `formatDeliveryAddressSummary(address)` — красивая строка для UI.

### Что именно сохраняем

- **carrier**: `'yandex'` (в актуальной версии UI СДЭК скрыт, но формат оставлен совместимым).
- **dropoff**:
  - `'pvz'` — самовывоз / пункт выдачи,
  - `'courier'` — доставка курьером до двери.
- **pvz**: `yandexPvzId` — id точки для расчёта **ПВЗ** в `offers/calculate`.
- **lon/lat**:
  - для **курьера**: координаты выбранной точки на карте (адрес до двери),
  - для **ПВЗ**: координаты ПВЗ (используется как доп. контекст; также полезно для UX/валидации).

Это позволяет:
- не дублировать модель доставки в Saleor,
- передавать всё нужное на checkout через стандартный адрес.

---

## 2) Основные модули и точки входа

### UI / компоненты

- `src/components/modals/AddressModal.tsx`
  - единая модалка для **ЛК** и **checkout**,
  - выбор: **ПВЗ** или **Курьером**,
  - сохранение меты в `streetAddress2` через `buildStreetAddress2WithMeta`.

- `src/components/ui/YandexPvzList.tsx`
  - список ПВЗ по городу + поиск,
  - карта ПВЗ (внутри `YandexPvzMap`),
  - грузит ПВЗ **только по `geo_id` выбранного города** (иначе долго).

- `src/components/ui/YandexPvzMap.tsx`
  - визуализация точек ПВЗ на Яндекс Картах,
  - выбор точки из балуна → `onSelect`.

- `src/components/ui/DeliveryCourierMap.tsx`
  - карта для выбора точки при доставке **курьером до двери**,
  - отдаёт координаты + разобранный адрес (город, индекс, строка адреса).

### Сторы

- `src/stores/useYandexPvz.ts`
  - `fetchPickupPointsForCity(cityName)`
  - кэш по `geo_id` + защита от гонок (быстрая смена города).

- `src/stores/useCart.ts`
  - хранит `shippingPrice`, `shippingLoading`, `shippingCarrier` (сейчас фактически всегда `'yandex'`).

### Checkout

- `src/components/checkout/OrderDelivery.tsx`
  - выбирает адрес доставки,
  - парсит мету из `streetAddress2`,
  - считает доставку через `src/lib/api/yandexDelivery.ts` (`calculateDelivery`),
  - выбирает самый дешёвый offer и кладёт цену в `useCartStore`.

### API (Next.js route handlers)

- `src/app/api/yandex-delivery/route.ts`
  - единый API-роут для фронта: и ПВЗ, и калькулятор,
  - внутри ходит в Яндекс (Cargo/Platform) по токенам из env.

Ключевой момент: **ПВЗ** получаем через Platform `pickup-points/list` (с `geo_id`), а **курьера** до двери считаем через Platform `pricing-calculator` с `tariff: time_interval` (когда задан `YANDEX_PLATFORM_SOURCE_STATION_ID`).

---

## 3) Переменные окружения (env)

Набор зависит от того, какие API Яндекса вы используете (Platform / Cargo).

### Яндекс Platform (рекомендуется для ПВЗ и курьера)

Используется для:
- `pickup-points/list` (ПВЗ) с `geo_id`,
- `pricing-calculator` (курьер до двери) с `tariff: time_interval`.

Нужные env (именование — как в проекте):
- `YANDEX_PLATFORM_TOKEN` — токен Platform.
- `YANDEX_PLATFORM_SOURCE_STATION_ID` — id станции/склада отправления (если есть — используем Platform для курьера).

### Яндекс Cargo (fallback / совместимость)

В проекте есть логика ретраев/фолбеков для Cargo-офферов (исторически).  
Если в вашем проекте достаточно Platform, можно сразу ориентироваться на Platform.

---

## 4) ПВЗ Яндекса: почему важно `geo_id` и как сделано

### Проблема
Если вызывать `pickup-points/list` **без `geo_id`**, Яндекс может вернуть точки по всей РФ → это **очень долго** (в нашем кейсе было ~1.3 минуты).

### Решение
Мы всегда подгружаем точки **только для выбранного города**:

1) На фронте есть справочник `город → geo_id`:
- `src/lib/yandexCityGeo.ts`
  - `YANDEX_CITY_GEO_ID`
  - `orderedYandexPvzCityNames()` (Москва/СПб первыми)
  - `resolveYandexGeoId(city)`
  - `catalogDisplayCityForUserCity(userCity)` (для defaultCity из формы)

2) Стор `useYandexPvzStore` грузит:
- `getPickupPoints({ geo_id })`
- кэширует `pointsCache["geo:<id>"]`
- защищается от гонок через sequence (если пользователь быстро меняет город).

3) API-роут прокидывает `geo_id` в Platform.

Док Яндекса по `geo_id`:
`https://yandex.ru/support/delivery-profile/ru/api/other-day/ref/2.-Tochki-samoprivoza-i-PVZ/apib2bplatformpickup-pointslist-post`

### UX-паттерн
- При первой загрузке выбран город (по умолчанию Москва) → подтягиваем ПВЗ только для него.
- При смене города:
  - если данные в кэше — мгновенно,
  - если нет — показываем “обновление списка”, но можем оставить прошлые точки на экране до прихода новых (мягкая деградация).

---

## 5) Курьер до двери (door): Platform `pricing-calculator`

Исторически у Яндекса бывает, что Cargo `offers` для door приходят пустыми.  
Для стабильного расчёта курьера в этом проекте сделано так:

- Если задан `YANDEX_PLATFORM_SOURCE_STATION_ID`, то **door** считаем через Platform:
  - `pricing-calculator` с `tariff: time_interval`
  - это даёт цену для доставки “до двери” (с тайм-слотами).

Сама логика переключения (PVZ vs door) находится в:
- `src/app/api/yandex-delivery/route.ts`

Фронт передаёт для курьера:
- `coordinates` (lon/lat), выбранные на карте,
- адресные поля из Saleor (город/строка адреса) — для UX и частично для валидации.

---

## 6) Checkout: как считается доставка

Файл: `src/components/checkout/OrderDelivery.tsx`

### Входные данные
- выбранный адрес из Saleor,
- мета из `streetAddress2`,
- корзина (`useCartStore.items`) — веса/габариты товаров.

### Логика
1) Парсим мету:
- `parseVspAddressMeta(address.streetAddress2)`
2) Определяем режим:
- `pvz`: если `dropoff==='pvz'` или есть `yandexPvzId`,
- `door`: если `dropoff==='courier'`.
3) Готовим payload:
- `city`, `fullname` (улица/дом),
- `mode: 'pvz' | 'door'`,
- `yandexPointId` (для ПВЗ),
- `coordinates` (для курьера),
- `shipmentLines` (если есть данные по товарам).
4) Вызываем:
- `src/lib/api/yandexDelivery.ts` → `calculateDelivery(...)`
5) Из ответа берём `offers`, фильтруем нулевые, выбираем самый дешёвый:
- `getCheapestOffer`, `parseYandexOfferPrice`
6) Кладём в стор:
- `setShippingCarrier('yandex')`
- `setShippingPrice(...)`

Если офферов нет/ошибка — цена 0, carrier всё равно yandex (чтобы UI был консистентным).

---

## 7) Модалка адреса: выбор ПВЗ/курьера и сохранение

Файл: `src/components/modals/AddressModal.tsx`

### ПВЗ
1) Пользователь выбирает “Пункт выдачи”.
2) Внутри `YandexPvzList` выбирает точку.
3) `handleYandexPvzChoose(pvz)`:
   - записывает в форму:
     - `city`, `streetAddress1` (полный адрес),
     - `postalCode`,
     - `companyName` (название ПВЗ),
     - `countryArea` (через `inferRuCountryAreaFromYandexPvz`)
   - сохраняет:
     - `yandexPvzId` (через `yandexPointIdForCargoOffers(pvz)`),
     - `yandexPvzCoords` из `pvz.position`.
4) При сохранении адреса собираем мету:
   - `carrier: 'yandex'`
   - `dropoff: 'pvz'`
   - `pvz` + `lon/lat` (если есть)
   - `buildStreetAddress2WithMeta(metaPayload, userComment)`
5) Вызываем `createAddress` / `updateAddress` (GraphQL сервисы проекта).

### Курьер
1) Пользователь выбирает “Курьером”.
2) На `DeliveryCourierMap` выбирает точку (адрес).
3) `handleCourierMapChoose`:
   - кладёт `courierCoords`,
   - обновляет форму адреса/индекса/города,
   - ставит `yandexDropoff='courier'`,
   - сбрасывает `yandexPvzId/yandexPvzCoords`.
4) Сохраняем мету:
   - `carrier: 'yandex'`
   - `dropoff: 'courier'`
   - `lon/lat` (координаты курьера).

---

## 8) Список городов для ПВЗ

Файл: `src/lib/yandexCityGeo.ts`

Почему справочник статический:
- Нам нужен `geo_id`, а “все города из всех ПВЗ РФ” грузить нельзя (слишком долго).

Как расширять:
- Добавьте город в `YANDEX_CITY_GEO_ID`.
- При необходимости добавьте алиасы (например “СПб”, “Питер”) в `ALIAS_TO_CANONICAL`.

---

## 9) Что важно учесть при переносе в другой проект

- **Saleor**:
  - Вы не обязаны менять схемы/модели — достаточно “меты” в `streetAddress2`.
  - Убедитесь, что `streetAddress2` не обрезается и сохраняет перенос строки.

- **ПВЗ**:
  - Не грузите все ПВЗ РФ. Всегда используйте `geo_id`.
  - Делайте кэш по `geo_id`.

- **Курьер**:
  - Стабильнее считать через Platform `pricing-calculator` (tariff `time_interval`) при наличии `sourceStationId`.

- **UX**:
  - Один компонент-модалка адреса на ЛК и checkout уменьшает расхождения.
  - Храните в адресе всё, что нужно checkout’у (pvzId/coords/dropoff).

---

## 10) Быстрый чек-лист внедрения

1) Добавить/скопировать `addressVspMeta.ts` и договориться о формате `__VSP:...__`.
2) Реализовать `AddressModal`:
   - ПВЗ (`YandexPvzList` + `YandexPvzMap`)
   - Курьер (`DeliveryCourierMap`)
3) Добавить `useYandexPvzStore` + справочник `yandexCityGeo.ts`.
4) Добавить API handler `api/yandex-delivery/route.ts`:
   - `pickup-points/list` (Platform) + `geo_id`
   - `pricing-calculator` (Platform) для door (если `sourceStationId`)
5) На checkout (`OrderDelivery`) читать мету адреса и считать доставку.
6) Проверить env и права токенов.

