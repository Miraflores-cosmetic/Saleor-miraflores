'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog/ConfirmDialog';
import { useBuyerAuth } from '@/lib/BuyerAuthProvider';
import styles from './AccountPage.module.css';

type Props = {
  children: ReactNode;
};

function IconUser() {
  return (
    <svg className={styles.sideIcon} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5.5 19.25c.9-3.2 3.2-5 6.5-5s5.6 1.8 6.5 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconOrders() {
  return (
    <svg className={styles.sideIcon} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 7h10l1 12H6L7 7Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M9 7a3 3 0 0 1 6 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg className={styles.sideIcon} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 7V5.75A1.75 1.75 0 0 1 11.75 4h6.5A1.75 1.75 0 0 1 20 5.75v12.5A1.75 1.75 0 0 1 18.25 20h-6.5A1.75 1.75 0 0 1 10 18.25V17"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M4 12h10M11 8.5 14.5 12 11 15.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconContact() {
  return (
    <svg className={styles.sideIcon} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v6A2.5 2.5 0 0 1 16.5 16H10l-4 3v-3.2A2.5 2.5 0 0 1 5 13.5v-6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconGift() {
  return (
    <svg className={styles.sideIcon} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10h16v10H4V10Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M12 10v10M4 13h16"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M12 10c-2.2 0-4-1.3-4-3s1.2-2.2 2.5-1.5C11.2 6 12 7.5 12 7.5S12.8 6 13.5 5.5C14.8 4.8 16 5.8 16 7s-1.8 3-4 3Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconHeart() {
  return (
    <svg className={styles.sideIcon} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20s-7-4.4-7-9.2A4.2 4.2 0 0 1 12 7.1a4.2 4.2 0 0 1 7 3.7C19 15.6 12 20 12 20Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AccountShell({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const {
    ready: authReady,
    authenticated,
    logout: logoutBuyer,
  } = useBuyerAuth();
  /** Middleware уже проверил cookie — не блокируем layout вторым «Загрузка…». */
  const [ready, setReady] = useState(true);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [hasGiftCertificates, setHasGiftCertificates] = useState(false);

  const section = pathname.startsWith('/account/orders')
    ? 'orders'
    : pathname.startsWith('/account/certificates')
      ? 'certificates'
      : pathname.startsWith('/account/favorites')
        ? 'favorites'
        : 'user';
  const crumbLabel =
    section === 'orders'
      ? 'Заказы'
      : section === 'certificates'
        ? 'Сертификаты'
        : section === 'favorites'
          ? 'Избранное'
          : 'Пользователь';

  useEffect(() => {
    if (!authReady) return;
    if (!authenticated) {
      setReady(false);
      router.replace(
        `/login?from=${encodeURIComponent(pathname || '/account')}`,
      );
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const me = await fetch('/api/account/me', {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (me.ok) {
          const profile = (await me.json()) as { hasGiftCertificates?: boolean };
          if (!cancelled) {
            setHasGiftCertificates(Boolean(profile.hasGiftCertificates));
          }
        }
      } catch {
        /* ignore profile extras */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, authenticated, pathname, router]);

  const logout = useCallback(async () => {
    setLogoutOpen(false);
    await logoutBuyer();
  }, [logoutBuyer]);

  return (
    <main className={styles.page}>
      <section id="hero-section" className={styles.hero} aria-label="Личный кабинет">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.heroImg}
          src="/images/customer_acc-cover.webp"
          alt=""
        />
        <div className={`padding-global ${styles.heroContent}`}>
          <nav className={styles.crumbs} aria-label="Навигация">
            <Link href="/" scroll={false}>
              Главная
            </Link>
            <span className={styles.crumbSep}>|</span>
            <Link href="/account" scroll={false}>
              Кабинет
            </Link>
            <span className={styles.crumbSep}>|</span>
            <span>{crumbLabel}</span>
          </nav>
          <h1 className={styles.heroTitle}>Личный кабинет</h1>
        </div>
      </section>

      <div className={`padding-global ${styles.body}`}>
        {!ready ? (
          <p className={styles.loading}>Перенаправление…</p>
        ) : (
          <div className={styles.layout}>
            <nav className={styles.sidebar} aria-label="Разделы кабинета">
              <ul className={styles.sidebarList}>
              <li>
                <Link
                  href="/account"
                  scroll={false}
                  className={[
                    styles.sideLink,
                    section === 'user' ? styles.sideLinkActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={section === 'user' ? 'page' : undefined}
                >
                  <IconUser />
                  <span className={styles.sideLabel}>Пользователь</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/account/orders"
                  scroll={false}
                  className={[
                    styles.sideLink,
                    section === 'orders' ? styles.sideLinkActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={section === 'orders' ? 'page' : undefined}
                >
                  <IconOrders />
                  <span className={styles.sideLabel}>Заказы</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/account/favorites"
                  scroll={false}
                  className={[
                    styles.sideLink,
                    section === 'favorites' ? styles.sideLinkActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={section === 'favorites' ? 'page' : undefined}
                >
                  <IconHeart />
                  <span className={styles.sideLabel}>Избранное</span>
                </Link>
              </li>
              {hasGiftCertificates ? (
                <li>
                  <Link
                    href="/account/certificates"
                    scroll={false}
                    className={[
                      styles.sideLink,
                      section === 'certificates' ? styles.sideLinkActive : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-current={section === 'certificates' ? 'page' : undefined}
                  >
                    <IconGift />
                    <span className={styles.sideLabel}>Сертификаты</span>
                  </Link>
                </li>
              ) : null}
              <li>
                <button
                  type="button"
                  className={styles.sideBtn}
                  onClick={() => setLogoutOpen(true)}
                >
                  <IconLogout />
                  <span className={styles.sideLabel}>Выйти</span>
                </button>
              </li>
              <li data-nav="contacts">
                <Link href="/contacts" className={styles.sideLink}>
                  <IconContact />
                  <span className={styles.sideLabel}>Контакты</span>
                </Link>
              </li>
              </ul>
            </nav>
            <div className={styles.main}>{children}</div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={logoutOpen}
        title="Выйти из аккаунта?"
        message="Вы уверены, что хотите выйти?"
        confirmLabel="Выйти"
        cancelLabel="Отмена"
        onConfirm={() => void logout()}
        onCancel={() => setLogoutOpen(false)}
      />
    </main>
  );
}
