'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Footer } from '@/components/Footer/Footer';
import { Header } from '@/components/Header/Header';
import { SiteLoader } from '@/components/SiteLoader/SiteLoader';

function isCheckoutPath(pathname: string | null) {
  if (!pathname) return false;
  return pathname === '/checkout' || pathname.startsWith('/checkout/');
}

function isAuthPath(pathname: string | null) {
  if (!pathname) return false;
  return (
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/register' ||
    pathname.startsWith('/register/')
  );
}

/**
 * Header / SiteLoader всегда смонтированы (checkout не remount'ит их).
 * Footer скрыт на /checkout и auth; Header скрыт на auth.
 */
export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const checkout = isCheckoutPath(pathname);
  const auth = isAuthPath(pathname);
  const account = Boolean(pathname?.startsWith('/account'));

  useEffect(() => {
    document.body.classList.toggle('site-auth', auth);
    return () => document.body.classList.remove('site-auth');
  }, [auth]);

  useEffect(() => {
    document.body.classList.toggle('site-account', account);
    return () => document.body.classList.remove('site-account');
  }, [account]);

  return (
    <>
      <div id="site-boot-loader" className="site-boot-loader" aria-hidden />
      <SiteLoader />
      {!auth ? <Header /> : null}
      {children}
      {!checkout && !auth ? <Footer /> : null}
    </>
  );
}
