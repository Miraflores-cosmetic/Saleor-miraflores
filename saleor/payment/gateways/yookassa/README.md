# YooKassa Payment Gateway Plugin

Плагин для интеграции платежного шлюза YooKassa с Saleor.

## Возможности

- ✅ Создание платежей при оформлении заказа
- ✅ Обработка webhook'ов от YooKassa
- ✅ Автоматическое обновление статусов заказов
- ✅ Поддержка тестового и боевого режимов
- ✅ Возвраты (refunds)
- ✅ Отмена платежей (void)

## Установка

1. Зависимость `yookassa>=2.3.0` уже добавлена в `pyproject.toml`

2. Установите зависимости:
```bash
uv run pip install yookassa
```

## Настройка

1. Получите `shop_id` и `secret_key` от YooKassa

2. В админке Saleor перейдите в раздел "Plugins" и найдите "YooKassa"

3. Настройте параметры:
   - **Shop ID**: Ваш shop ID от YooKassa
   - **Secret key**: Ваш secret key от YooKassa
   - **Test mode**: Включите для тестирования
   - **Automatic payment capture**: Автоматическое подтверждение платежей
   - **Supported currencies**: Валюты через запятую (например: RUB,USD,EUR)

4. Активируйте плагин для нужного канала

## Настройка Webhook

1. В личном кабинете YooKassa настройте webhook URL:
   ```
   https://yourdomain.com/plugins/yookassa/{channel_slug}/webhooks/
   ```
   где `{channel_slug}` - slug вашего канала

2. YooKassa будет отправлять уведомления о статусах платежей

## Использование

После настройки плагин автоматически:
- Создает платежи в YooKassa при оформлении заказа
- Обрабатывает webhook'и и обновляет статусы
- Поддерживает возвраты и отмены через админку Saleor

## Тестирование

Запустите тесты:
```bash
uv run poe test saleor/payment/gateways/yookassa/tests/
```

## Поддерживаемые статусы платежей

- `pending` - Ожидает оплаты
- `waiting_for_capture` - Ожидает подтверждения
- `succeeded` - Успешно оплачен
- `canceled` - Отменен

## Документация

- [YooKassa API](https://yookassa.ru/developers/api)
- [YooKassa Python SDK](https://github.com/yoomoney/yookassa-sdk-python)
