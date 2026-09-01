import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { getAdminSession } from '@/lib/getAdminSession';
import { adminPathAllowed } from '@/lib/adminPathAllowed';
import { AdminChrome } from './AdminChrome';

export const metadata: Metadata = {
  title: {
    default: 'Miraflores · Админ',
    template: '%s · Miraflores Админ',
  },
  description: 'Панель управления магазином Miraflores',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/images/favicon-mira.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/images/favicon-mira.svg', type: 'image/svg+xml' }],
  },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = headers().get('x-pathname') ?? '';
  const isLogin = pathname === '/admin/login';

  let email: string | null = null;
  let staff = null;

  if (!isLogin) {
    const session = await getAdminSession();
    if (!session.authenticated) {
      redirect('/admin/login');
    } else {
      email = session.user.email;
      staff = session.staff;
      // Нельзя redirect('/admin') когда уже на /admin — иначе петля.
      if (
        pathname &&
        pathname !== '/admin' &&
        !adminPathAllowed(pathname, session.staff)
      ) {
        redirect('/admin');
      }
    }
  }

  return (
    <AdminChrome email={email} staff={staff}>
      {children}
    </AdminChrome>
  );
}
