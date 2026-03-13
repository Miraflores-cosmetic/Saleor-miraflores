# Синхронизация остатков: Мой Склад → Saleor

Подтягивает остатки с **Склад МАГАЗИН** в Мой Склад в склад **Склад МАГАЗИН** в Saleor. Сопоставление по **артикулу (МС) = SKU (Saleor)**.

## Переменные окружения

Скопируйте `.env.example` в `.env` и заполните (не коммитьте `.env` в git):

| Переменная | Описание |
|------------|----------|
| `MOYSKLAD_LOGIN` | Логин Мой Склад (email) |
| `MOYSKLAD_PASSWORD` | Пароль приложения МС (токен из Настройки → Безопасность) |
| `SALEOR_GRAPHQL_URL` | URL GraphQL Saleor, например `https://miraflores-shop.com/graphql/` |
| `SALEOR_STAFF_EMAIL` | Email staff-пользователя Saleor для API |
| `SALEOR_STAFF_PASSWORD` | Пароль этого пользователя |
| `MOYSKLAD_SYNC_LOG` | (опционально) Путь к файлу лога |

## Запуск

```bash
cd moysklad-sync
node sync.js
# или
npm run sync
```

## Локальный тест

1. **Node.js 18+** — в терминале выполните `node -v`. Должно быть 18.x или выше. Если нет — установите Node.js с [nodejs.org](https://nodejs.org/).

2. **Файл `.env`** — в папке `moysklad-sync` создайте `.env` (скопируйте из `.env.example` и заполните):
   ```bash
   cd moysklad-sync
   cp .env.example .env
   ```
   Откройте `.env` и укажите:
   - `MOYSKLAD_LOGIN` — ваш email в Мой Склад
   - `MOYSKLAD_PASSWORD` — пароль приложения МС (токен)
   - `SALEOR_GRAPHQL_URL` — `https://miraflores-shop.com/graphql/`
   - `SALEOR_STAFF_EMAIL` — email staff-пользователя Saleor
   - `SALEOR_STAFF_PASSWORD` — его пароль

3. **Запуск** — из папки `moysklad-sync` выполните:
   ```bash
   node sync.js
   ```
   Или через скрипт (он подгрузит `.env`):
   ```bash
   ./run-sync.sh
   ```

4. **Результат** — в консоли появятся строки вроде «Старт синхронизации», «Мой Склад: получено N позиций», «Готово за Xs: обновлено Y, пропущено Z». Лог также пишется в `moysklad-sync.log` в этой же папке. Если будет ошибка (нет доступа к API, неверный логин и т.п.) — скрипт выведет её и завершится с кодом 1.

### Как проверить, что остатки обновились в Saleor

1. Откройте **дашборд Saleor** (например https://miraflores-shop.com/dashboard/).
2. Перейдите в **Каталог → Товары** (или **Products**). Выберите любой товар, у которого в варианте указан **SKU** (код товара) — желательно тот, что есть и в МС с тем же артикулом.
3. Откройте карточку товара → вкладка **Склад** / **Stock** (или раздел вариантов и остатки по складу). Найдите склад **«Склад МАГАЗИН»** и запомните текущее **количество**.
4. В Мой Склад откройте тот же товар (по артикулу = SKU) и посмотрите остаток по складу «Склад МАГАЗИН». Либо просто запомните число в Saleor.
5. Запустите синхронизацию: `node sync.js`. В логе должно быть «обновлено N» (N > 0).
6. Обновите страницу товара в дашборде Saleor (F5) и снова откройте остатки по складу «Склад МАГАЗИН». Количество должно совпасть с остатком из МС (или измениться, если в МС было другое значение).

Если у товара в Saleor нет варианта с таким же SKU, как артикул в МС — остаток обновляться не будет (такие SKU попадают в «Пропущено»).

### Ошибка «неверный email или пароль» (Saleor)

- В `.env` должны быть данные **того же** staff-пользователя, под которым вы заходите в админку **именно на https://miraflores-shop.com** (не локальный `admin@example.com`).
- Проверьте вход в браузере: откройте https://miraflores-shop.com/dashboard/ (или ваш URL дашборда), войдите с тем же email и паролем, что в `SALEOR_STAFF_EMAIL` и `SALEOR_STAFF_PASSWORD`. Если в браузере не пускает — сбросьте пароль в админке и обновите пароль в `.env`.
- Проверка через curl (подставьте свой email и пароль вместо `YOUR_EMAIL` и `YOUR_PASSWORD`):
  ```bash
  curl -s -X POST https://miraflores-shop.com/graphql/ \
    -H "Content-Type: application/json" \
    -d '{"query":"mutation TokenCreate($email: String!, $password: String!) { tokenCreate(email: $email, password: $password) { token errors { message } } }","variables":{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}}'
  ```
  Если в ответе есть `"token": "eyJ..."` — учётные данные верные. Если в `data.tokenCreate` есть `errors` или сообщение про credentials — неверный email или пароль; используйте те же данные, под которыми входите в дашборд на этом домене.

## Cron (каждые 10 минут)

Скрипт `run-sync.sh` подгружает `.env` и запускает синхронизацию. Чтобы синхронизация шла автоматически **каждые 10 минут**, добавьте задачу в планировщик cron (см. раздел «Настройка на сервере» ниже или шаги здесь).

Откройте crontab: `crontab -e` и добавьте строку (замените путь на путь к `moysklad-sync` на вашем сервере):

```
*/10 * * * * "/path/to/moysklad-sync/run-sync.sh" >> "/path/to/moysklad-sync/moysklad-sync.log" 2>&1
```

Пример для Linux-сервера:

```
*/10 * * * * "/root/moysklad-sync/run-sync.sh" >> "/root/moysklad-sync/moysklad-sync.log" 2>&1
```

Проверка: `crontab -l` — должна быть строка с `*/10 * * * *`. Лог: `tail -f /path/to/moysklad-sync/moysklad-sync.log`.

## Логи

- В консоль выводится краткий отчёт (старт, количество обновлённых/пропущенных, ошибки).
- Подробный лог пишется в файл: по умолчанию `moysklad-sync.log` в текущей папке или в путь из `MOYSKLAD_SYNC_LOG`.

## Поведение

- Обновляются только товары, у которых есть совпадение: артикул в МС = SKU в Saleor.
- Товар есть в МС, в Saleor по SKU не найден — в Saleor ничего не меняется.
- Товар есть в Saleor, в МС его нет — остаток в Saleor не трогаем.
- У варианта в Saleor нет SKU — остаток не трогаем.

## Настройка на сервере (по шагам)

Выполняйте на машине, где крутится Saleor (или откуда есть доступ к API Saleor и в интернет к МС).

### Предварительно

- Node.js 18+ (`node -v`).
- В репозитории есть папка `moysklad-sync`. На сервере: `cd /path/to/repo && git pull`.

---

### Шаг 1. Синхронизация МС → Saleor (остатки каждые 10 минут)

1. Перейдите в каталог:
   ```bash
   cd /path/to/repo/moysklad-sync
   ```

2. Создайте `.env` (в git не коммитить):
   ```bash
   cp .env.example .env
   nano .env   # или vim
   ```
   Заполните продакшен-значения:
   - `MOYSKLAD_TOKEN` (или `MOYSKLAD_LOGIN` + `MOYSKLAD_PASSWORD`) — доступ к МС
   - `SALEOR_GRAPHQL_URL` — например `https://miraflores-shop.com/graphql/`
   - `SALEOR_STAFF_EMAIL`, `SALEOR_STAFF_PASSWORD` — staff Saleor

3. Проверьте запуск синхронизации:
   ```bash
   node sync.js
   ```
   В выводе должно быть «обновлено N» без ошибок.

4. Настройте cron **каждые 10 минут**:
   ```bash
   crontab -e
   ```
   Добавьте строку (подставьте свой путь к `moysklad-sync`):
   ```
   */10 * * * * "/path/to/moysklad-sync/run-sync.sh" >> "/path/to/moysklad-sync/moysklad-sync.log" 2>&1
   ```
   Сохраните и выйдите. Проверка: `crontab -l`.

Готово: остатки МС → Saleor будут обновляться каждые 10 минут.

---

### Шаг 2. Связь Saleor → МС (реализация при отгрузке)

1. Убедитесь, что `.env` в `moysklad-sync` уже настроен (те же MOYSKLAD_*, что и для sync).

2. Запустите webhook-сервер как постоянный процесс.

   **Вариант A: через systemd** (рекомендуется на Linux).

   Создайте файл `/etc/systemd/system/moysklad-webhook.service` (подставьте свой путь и пользователя):

   ```ini
   [Unit]
   Description=Saleor→МС webhook (реализация при отгрузке)
   After=network.target

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/path/to/moysklad-sync
   EnvironmentFile=/path/to/moysklad-sync/.env
   ExecStart=/usr/bin/node webhook-server.js
   Restart=on-failure
   RestartSec=10
   Environment=NODE_ENV=production

   [Install]
   WantedBy=multi-user.target
   ```
   Замените `/path/to/moysklad-sync` на реальный путь и при необходимости `User=www-data` на пользователя, от которого запускаете приложение.

   Затем:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable moysklad-webhook
   sudo systemctl start moysklad-webhook
   sudo systemctl status moysklad-webhook
   ```

   **Вариант B: вручную в фоне** (для быстрой проверки):
   ```bash
   cd /path/to/moysklad-sync
   nohup node webhook-server.js >> moysklad-webhook.log 2>&1 &
   ```

3. Сделайте URL вебхука доступным снаружи (чтобы Saleor мог отправить POST).

   - Если сервер слушает только localhost:3300 — настройте nginx (или другой прокси). Пример конфигурации nginx:
     ```nginx
     location /webhook/order-fulfilled {
         proxy_pass http://127.0.0.1:3300;
         proxy_http_version 1.1;
         proxy_set_header Host $host;
         proxy_set_header X-Real-IP $remote_addr;
         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
         proxy_set_header X-Forwarded-Proto $scheme;
     }
     ```
   - Итоговый URL для Saleor будет вида: `https://ваш-домен.ru/webhook/order-fulfilled` (без порта 3300, если прокси слушает 443).

4. В **Saleor Dashboard**: **Configuration → Webhooks** — создайте webhook:
   - **Event**: отгрузка заказа (ORDER_FULFILLED / Order fulfilled).
   - **Target URL**: `https://ваш-домен.ru/webhook/order-fulfilled`.

5. Файл дедупликации `moysklad-fulfillments.json` создаётся в `moysklad-sync` автоматически. Не удаляйте его на сервере — иначе возможны дубли документов в МС.

Проверка: в дашборде Saleor отгрузите тестовый заказ; в МС в **Продажи → Реализации** должен появиться новый документ с контрагентом «Интернет-магазин».

## Безопасность

- Храните логин и пароль МС, а также учётные данные Saleor только в переменных окружения (`.env` не коммитить).
- Если токен или пароль когда-либо попадали в чат или в репозиторий — смените пароль приложения в МС и пароль staff-пользователя в Saleor.

## Требования

- Node.js 18+ (для нативного `fetch`).

---

## Интеграция Saleor → МС: реализация при отгрузке (webhook)

При отгрузке заказа в Saleor (событие **ORDER_FULFILLED** / подтверждение отгрузки) можно автоматически создавать в Мой Склад документ **«Реализация»**.

### Поведение

- **Триггер:** webhook от Saleor при отгрузке заказа (в дашборде настраивается событие на отгрузку заказа, URL — ваш сервис).
- **Контрагент в МС:** один общий — «Интернет-магазин» (создаётся автоматически, если нет).
- **Склад:** «Склад МАГАЗИН» (тот же, что в синхронизации остатков).
- **Позиции:** только артикул (SKU из Saleor) и количество; суммы и оплата в МС не передаются.
- **Опционально:** в описание документа в МС попадают ФИО, телефон и адрес доставки из заказа.
- **Защита от дублей:** один заказ/один fulfillment → один документ в МС; повторные запросы по тому же заказу не создают второй документ.

### Запуск сервера вебхуков

На машине, до которой Saleor сможет достучаться по HTTP:

```bash
cd moysklad-sync
npm run webhook
# или
node webhook-server.js
```

Сервер слушает порт **3300** (или значение `WEBHOOK_PORT` в `.env`).

- **URL для webhook в Saleor:** `https://ВАШ_ДОМЕН:3300/webhook/order-fulfilled` (или ваш порт/путь).
- В дашборде Saleor: **Configuration → Webhooks** — создать webhook с событием отгрузки заказа (ORDER_FULFILLED / order fulfillment) и указать этот URL.

### Переменные окружения для webhook

Используются те же, что для синхронизации остатков: `MOYSKLAD_TOKEN` (или `MOYSKLAD_LOGIN` + `MOYSKLAD_PASSWORD`), плюс опционально:

| Переменная | Описание |
|------------|----------|
| `WEBHOOK_PORT` | Порт HTTP-сервера (по умолчанию 3300) |
| `MOYSKLAD_DEDUP_FILE` | Путь к файлу привязки «заказ → документ МС» (по умолчанию `moysklad-fulfillments.json` в папке `moysklad-sync`) |
| `MOYSKLAD_SYNC_LOG` | Путь к логу (по умолчанию общий с sync — можно разделить, задав свой путь) |

### Формат payload от Saleor

Сервис принимает payload в формате **order_fulfillment_confirmation** (notify): в теле приходит `payload.order`, `payload.physical_lines`. В каждой строке `physical_lines` используются `order_line.product_sku` и `quantity`. Если в Saleor настроен другой формат webhook (например sync с полями `order` и `fulfillment` на верхнем уровне), структура будет распознана по наличию `order.id` и списка строк отгрузки.

Деплой webhook на сервере описан в разделе **«Настройка на сервере (по шагам)»** выше — шаг 2.
