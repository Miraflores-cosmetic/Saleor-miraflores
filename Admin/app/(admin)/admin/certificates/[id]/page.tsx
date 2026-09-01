import { CertificateDetailClient } from './CertificateDetailClient';

export default function AdminCertificateDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <CertificateDetailClient certificateId={params.id} />;
}
