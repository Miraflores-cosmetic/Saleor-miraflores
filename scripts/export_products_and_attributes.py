#!/usr/bin/env python
"""
Скрипт для экспорта товаров и атрибутов в JSON fixture.

Экспортирует:
- Товары типа "Товар сайта"
- Атрибуты и их значения
- Связи между товарами и атрибутами
- Категории (только те, что используются товарами)
- Варианты товаров и их листинги
- Остатки на складе

НЕ экспортирует:
- Коллекции
- Другие типы товаров
- Другие данные
"""
import os
import sys
import django
import json
from pathlib import Path
from django.core import serializers
from django.db import transaction

sys.path.insert(0, str(Path(__file__).parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "saleor.settings")
django.setup()

from saleor.product.models import (
    Product,
    ProductType,
    ProductVariant,
    ProductChannelListing,
    ProductVariantChannelListing,
    Category,
)
from saleor.attribute.models import (
    Attribute,
    AttributeValue,
    AttributeProduct,
    AssignedProductAttributeValue,
)
from saleor.warehouse.models import Stock, Warehouse
from saleor.channel.models import Channel

def export_products_and_attributes(output_file: str):
    """Экспортирует товары и атрибуты в JSON fixture."""
    
    # Получаем тип товара "Товар сайта"
    product_type = ProductType.objects.filter(
        slug__in=['tovar-saita', 'tovar-sajta']
    ).first()
    
    if not product_type:
        print("Тип товара 'Товар сайта' не найден")
        return
    
    print(f"Найден тип товара: {product_type.name} (ID: {product_type.id})")
    
    # Получаем все товары этого типа
    products = Product.objects.filter(product_type=product_type)
    product_ids = list(products.values_list('id', flat=True))
    
    print(f"Найдено товаров: {len(product_ids)}")
    
    if not product_ids:
        print("Товары не найдены")
        return
    
    # Собираем все объекты для экспорта
    objects_to_export = []
    
    # 1. Тип товара
    objects_to_export.append(product_type)
    
    # 2. Товары
    objects_to_export.extend(products)
    
    # 3. Категории (только те, что используются товарами)
    category_ids = list(products.exclude(category=None).values_list('category_id', flat=True))
    if category_ids:
        categories = Category.objects.filter(id__in=category_ids)
        objects_to_export.extend(categories)
        print(f"Найдено категорий: {categories.count()}")
    
    # 4. Варианты товаров
    variants = ProductVariant.objects.filter(product_id__in=product_ids)
    variant_ids = list(variants.values_list('id', flat=True))
    objects_to_export.extend(variants)
    print(f"Найдено вариантов: {len(variant_ids)}")
    
    # 5. Листинги товаров в каналах
    product_listings = ProductChannelListing.objects.filter(product_id__in=product_ids)
    objects_to_export.extend(product_listings)
    
    # 6. Листинги вариантов в каналах
    variant_listings = ProductVariantChannelListing.objects.filter(variant_id__in=variant_ids)
    objects_to_export.extend(variant_listings)
    
    # 7. Остатки на складе
    stocks = Stock.objects.filter(product_variant_id__in=variant_ids)
    objects_to_export.extend(stocks)
    print(f"Найдено остатков на складе: {stocks.count()}")
    
    # 8. Атрибуты, связанные с типом товара
    attribute_products = AttributeProduct.objects.filter(product_type=product_type)
    attribute_ids = list(attribute_products.values_list('attribute_id', flat=True))
    
    if attribute_ids:
        # Атрибуты
        attributes = Attribute.objects.filter(id__in=attribute_ids)
        objects_to_export.extend(attributes)
        print(f"Найдено атрибутов: {attributes.count()}")
        
        # Связи атрибутов с типом товара
        objects_to_export.extend(attribute_products)
        
        # Значения атрибутов, присвоенные товарам
        assigned_values = AssignedProductAttributeValue.objects.filter(product_id__in=product_ids)
        value_ids = list(assigned_values.values_list('value_id', flat=True))
        
        if value_ids:
            # Значения атрибутов
            attribute_values = AttributeValue.objects.filter(id__in=value_ids)
            objects_to_export.extend(attribute_values)
            print(f"Найдено значений атрибутов: {attribute_values.count()}")
            
            # Присвоенные значения товарам
            objects_to_export.extend(assigned_values)
            print(f"Найдено присвоений атрибутов: {assigned_values.count()}")
    
    # Сохраняем в файл используя Django serializer (правильно обрабатывает datetime)
    output_path = Path(__file__).parent.parent / output_file
    with open(output_path, 'w', encoding='utf-8') as f:
        serializers.serialize('json', objects_to_export, stream=f, indent=2, use_natural_foreign_keys=True, use_natural_primary_keys=False)
    
    print(f"\nЭкспорт завершен!")
    print(f"Файл сохранен: {output_path}")
    print(f"Всего объектов экспортировано: {len(objects_to_export)}")
    
    print(f"\nЭкспорт завершен!")
    print(f"Файл сохранен: {output_path}")
    print(f"Всего объектов экспортировано: {len(objects_to_export)}")

if __name__ == "__main__":
    output_file = sys.argv[1] if len(sys.argv) > 1 else "fixtures/products_and_attributes.json"
    export_products_and_attributes(output_file)

