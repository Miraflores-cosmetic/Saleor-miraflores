import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CertificatesSuccessClient } from './CertificatesSuccessClient';

export const metadata: Metadata = {
  title: 'Сертификат оплачен — Jcos',
};

export default function CertificatesSuccessPage() {
  return (
    <Suspense fallback={<main className="padding-global">Загрузка…</main>}>
      <CertificatesSuccessClient />
    </Suspense>
  );
}
