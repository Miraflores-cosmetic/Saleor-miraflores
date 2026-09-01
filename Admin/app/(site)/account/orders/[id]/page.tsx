import type { Metadata } from 'next';
import { AccountOrderDetailClient } from '../../AccountOrderDetailClient';

export const metadata: Metadata = {
  title: 'Заказ — Jcos',
};

type Props = { params: { id: string } };

export default function AccountOrderDetailPage({ params }: Props) {
  return <AccountOrderDetailClient orderId={params.id} />;
}
