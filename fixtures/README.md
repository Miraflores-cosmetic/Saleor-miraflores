# Fixtures для товаров и атрибутов

Этот каталог содержит экспортированные данные товаров и атрибутов из Saleor.

## Файлы

- `products_and_attributes.json` - Экспорт всех товаров типа "Товар сайта" и связанных атрибутов

## Экспорт данных

Для экспорта текущих данных товаров и атрибутов:

```bash
uv run python scripts/export_products_and_attributes.py fixtures/products_and_attributes.json
```

Экспортируется:
- Товары типа "Товар сайта"
- Атрибуты и их значения
- Связи между товарами и атрибутами
- Категории (только используемые товарами)
- Варианты товаров и их листинги
- Остатки на складе

**НЕ экспортируется:**
- Коллекции
- Другие типы товаров
- Другие данные

## Загрузка данных

Для загрузки данных из fixture в базу данных:

```bash
uv run python scripts/load_products_and_attributes.py fixtures/products_and_attributes.json
```

**Внимание:** Загрузка перезапишет существующие товары с теми же ID. Используйте с осторожностью!

## Альтернативный способ (Django команда)

Также можно использовать стандартную Django команду:

```bash
# Экспорт
uv run python manage.py dumpdata product.Product product.ProductType attribute.Attribute attribute.AttributeValue --indent 2 > fixtures/products_and_attributes.json

# Загрузка
uv run python manage.py loaddata fixtures/products_and_attributes.json
```

