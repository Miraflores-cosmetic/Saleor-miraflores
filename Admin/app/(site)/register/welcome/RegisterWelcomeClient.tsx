'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { PrimaryBtn } from '@/components/PrimaryBtn/PrimaryBtn';
import { safeReturnPath } from '@/lib/safeReturnPath';
import { AuthSplitShell } from '../../login/AuthSplitShell';
import styles from '../../login/LoginPage.module.css';

export function RegisterWelcomeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = useMemo(
    () => safeReturnPath(searchParams.get('from')),
    [searchParams],
  );
  const continueCheckout = from === '/checkout' || from.startsWith('/checkout/');

  return (
    <AuthSplitShell backHref={from}>
      <div className={styles.intro}>
        <h2 className={styles.title}>Добро пожаловать</h2>
        <p className={styles.subtitle}>
          Аккаунт создан, email подтверждён — вы вошли. Можно перейти в кабинет
          или продолжить оформление заказа.
        </p>
      </div>

      <div className={styles.fields}>
        <PrimaryBtn type="button" onClick={() => router.push('/account')}>
          Перейти в кабинет
        </PrimaryBtn>
        {continueCheckout ? (
          <Link href="/checkout" className={styles.linkAccent}>
            Продолжить оформление заказа
          </Link>
        ) : from !== '/' ? (
          <Link href={from} className={styles.linkAccent}>
            Вернуться назад
          </Link>
        ) : (
          <Link href="/" className={styles.linkAccent}>
            На главную
          </Link>
        )}
      </div>
    </AuthSplitShell>
  );
}
