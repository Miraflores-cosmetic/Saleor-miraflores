#!/usr/bin/env python
"""
Скрипт для загрузки товаров и атрибутов из JSON fixture.

Использование:
    python scripts/load_products_and_attributes.py fixtures/products_and_attributes.json
"""
import os
import sys
import django
from pathlib import Path
from django.core import serializers
from django.db import transaction

sys.path.insert(0, str(Path(__file__).parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "saleor.settings")
django.setup()

def load_products_and_attributes(fixture_file: str):
    """Загружает товары и атрибуты из JSON fixture."""
    fixture_path = Path(__file__).parent.parent / fixture_file
    
    if not fixture_path.exists():
        print(f"Файл не найден: {fixture_path}")
        sys.exit(1)
    
    print(f"Загрузка данных из: {fixture_path}")
    
    with open(fixture_path, 'r', encoding='utf-8') as f:
        objects = serializers.deserialize('json', f)
        
        loaded_count = 0
        error_count = 0
        
        with transaction.atomic():
            for obj in objects:
                try:
                    obj.save()
                    loaded_count += 1
                    if loaded_count % 100 == 0:
                        print(f"Загружено объектов: {loaded_count}...")
                except Exception as e:
                    error_count += 1
                    print(f"Ошибка при загрузке {obj.object}: {e}")
        
        print(f"\nЗагрузка завершена!")
        print(f"Загружено объектов: {loaded_count}")
        if error_count > 0:
            print(f"Ошибок: {error_count}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Использование: python scripts/load_products_and_attributes.py <fixture_file>")
        sys.exit(1)
    
    fixture_file = sys.argv[1]
    load_products_and_attributes(fixture_file)

