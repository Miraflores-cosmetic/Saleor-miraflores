import type { Metadata } from 'next';
import { AccountOrdersClient } from '../AccountOrdersClient';

export const metadata: Metadata = {
  title: 'Заказы — Jcos',
};

export default function AccountOrdersPage() {
  return <AccountOrdersClient />;
}
