import { Suspense } from 'react';
import { CertificatesHubClient } from './CertificatesHubClient';

export default function AdminCertificatesPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <CertificatesHubClient />
    </Suspense>
  );
}
