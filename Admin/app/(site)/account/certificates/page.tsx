import type { Metadata } from 'next';
import { AccountCertificatesClient } from './AccountCertificatesClient';

export const metadata: Metadata = {
  title: 'Сертификаты — Jcos',
};

export default function AccountCertificatesPage() {
  return <AccountCertificatesClient />;
}
