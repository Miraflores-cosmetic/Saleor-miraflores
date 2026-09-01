import type { Metadata } from 'next';
import { AccountFavoritesClient } from '../AccountFavoritesClient';

export const metadata: Metadata = {
  title: 'Избранное — Miraflores',
};

export default function AccountFavoritesPage() {
  return <AccountFavoritesClient />;
}
