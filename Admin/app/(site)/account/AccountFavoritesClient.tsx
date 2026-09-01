'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProductCard, type ProductCardProps } from '@/components/ProductCard/ProductCard';
import styles from './AccountPage.module.css';

type FavoriteItem = ProductCardProps & {
  productId?: string;
  id?: string;
};

export function AccountFavoritesClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<FavoriteItem[]>([]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/account/favorites/items', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || 'Не удалось загрузить избранное');
      }
      const data = (await res.json()) as { items?: FavoriteItem[] };
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  if (loading) {
    return <p className={styles.loading}>Загрузка…</p>;
  }

  if (error) {
    return (
      <p className={styles.error} role="alert">
        {error}
      </p>
    );
  }

  if (items.length === 0) {
    return <p className={styles.muted}>В избранном пока пусто</p>;
  }

  return (
    <div className={styles.favoritesGrid}>
      {items.map((item) => (
        <ProductCard
          key={item.variantId ?? item.slug}
          productId={item.productId ?? item.id}
          variantId={item.variantId}
          variantName={item.variantName}
          shadeId={item.shadeId}
          shadeName={item.shadeName}
          slug={item.slug}
          name={item.name}
          shortDescription={item.shortDescription}
          price={item.price}
          oldPrice={item.oldPrice}
          discountPercent={item.discountPercent}
          priceFrom={item.priceFrom}
          imageUrl={item.imageUrl}
          imageUrls={item.imageUrls}
          mediaType={item.mediaType}
          minQty={item.minQty}
          maxQty={item.maxQty}
          available={item.available}
        />
      ))}
    </div>
  );
}
