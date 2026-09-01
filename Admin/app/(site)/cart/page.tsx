'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cart/CartContext';

/** Старый /cart → открывает модальную корзину. */
export default function CartPage() {
  const { openCart } = useCart();
  const router = useRouter();

  useEffect(() => {
    openCart();
    router.replace('/');
  }, [openCart, router]);

  return null;
}
