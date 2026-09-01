import type { Metadata } from 'next';
import { ContentPage, contentPageStyles as styles } from '../content/ContentPage';
import {
  CertificatesClient,
  type GiftDenomination,
} from './CertificatesClient';
import { getServerApiBase } from '@/lib/serverApiBase';

export const metadata: Metadata = {
  title: 'Подарочные сертификаты — Jcos',
  description:
    'Купить электронный подарочный сертификат Jcos. Код приходит на email после оплаты.',
};

async function fetchDenominations(): Promise<GiftDenomination[]> {
  try {
    const base = getServerApiBase();
    const res = await fetch(`${base}/gift-certificates/denominations`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as GiftDenomination[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default async function CertificatesPage() {
  const denoms = await fetchDenominations();
  return (
    <ContentPage title="Подарочные сертификаты">
      <CertificatesClient initialDenominations={denoms} />
      <p className={styles.text} style={{ marginTop: '2.5rem' }}>
        Сертификат — предоплата на баланс, не скидка. Нельзя совместить с промокодом
        в одном заказе. При вопросах — раздел FAQ или контакты.
      </p>
    </ContentPage>
  );
}
