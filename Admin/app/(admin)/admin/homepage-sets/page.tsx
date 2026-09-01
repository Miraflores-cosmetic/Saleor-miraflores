import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/getAdminSession';
import { HomepageSetsAdminClient } from '@/app/(admin)/admin/settings/home/sets/HomepageSetsAdminClient';

export default async function AdminHomepageSetsPage() {
  const session = await getAdminSession();
  const isSuperAdmin =
    session.authenticated && Boolean(session.staff?.isSuperAdmin);

  if (!isSuperAdmin) {
    redirect('/admin/faq');
  }

  return <HomepageSetsAdminClient />;
}
