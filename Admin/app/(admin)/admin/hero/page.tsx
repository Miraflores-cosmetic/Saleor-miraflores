import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/getAdminSession';
import { HeroAdminClient } from './HeroAdminClient';

export default async function AdminHeroPage() {
  const session = await getAdminSession();
  const isSuperAdmin =
    session.authenticated && Boolean(session.staff?.isSuperAdmin);

  if (!isSuperAdmin) {
    redirect('/admin/faq');
  }

  return <HeroAdminClient />;
}
