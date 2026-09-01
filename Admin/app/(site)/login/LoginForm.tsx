'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { FloatingTextField } from '@/components/FloatingTextField/FloatingTextField';
import { PrimaryBtn } from '@/components/PrimaryBtn/PrimaryBtn';
import { getOrCreateGuestId } from '@/lib/cart/guestId';
import { useBuyerAuth } from '@/lib/BuyerAuthProvider';
import { safeReturnPath, withReturnPath } from '@/lib/safeReturnPath';
import {
  clearAuthField,
  type AuthFieldErrors,
  useRedirectIfBuyerAuthed,
} from './authShared';
import { AuthSplitShell } from './AuthSplitShell';
import styles from './LoginPage.module.css';

export function LoginForm() {
  const router = useRouter();
  const { refresh: refreshBuyerAuth } = useBuyerAuth();
  const searchParams = useSearchParams();
  const from = useMemo(
    () => safeReturnPath(searchParams.get('from')),
    [searchParams],
  );
  const resetOk = searchParams.get('reset') === 'ok';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useRedirectIfBuyerAuthed(from);

  useEffect(() => {
    if (searchParams.get('mode') === 'register') {
      router.replace(withReturnPath('/register', from));
    }
  }, [searchParams, router, from]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const next: AuthFieldErrors = {};
    if (!email.trim()) next.email = 'Укажите email';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Некорректный email';
    }
    if (password.length === 0) next.password = 'Введите пароль';
    setFieldErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          email: email.trim(),
          password,
          guestId: getOrCreateGuestId() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        const msg =
          typeof data.error === 'string' ? data.error : 'Не удалось войти';
        const lower = msg.toLowerCase();
        if (lower.includes('парол') || lower.includes('email')) {
          setFieldErrors({ password: msg });
        } else {
          setFormError(msg);
        }
        return;
      }
      await refreshBuyerAuth();
      router.replace(from);
      router.refresh();
    } catch {
      setFormError('Сеть недоступна');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplitShell backHref={from}>
      <div className={styles.intro}>
        <h2 className={styles.title}>Вход в аккаунт</h2>
        <p className={styles.subtitle}>
          Впервые у нас?{' '}
          <Link href={withReturnPath('/register', from)} className={styles.linkAccent}>
            Зарегистрироваться
          </Link>
        </p>
      </div>

      <form className={styles.form} noValidate onSubmit={(e) => void onSubmit(e)}>
        <fieldset className={styles.fieldset} disabled={loading}>
          <div className={styles.fields}>
            <FloatingTextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearAuthField(setFieldErrors, 'email');
              }}
              autoComplete="email"
              required
              error={fieldErrors.email}
            />
            <FloatingTextField
              label="Пароль"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearAuthField(setFieldErrors, 'password');
              }}
              autoComplete="current-password"
              required
              error={fieldErrors.password}
            />
            <div className={styles.forgotRow}>
              <Link
                href={(() => {
                  const base = withReturnPath('/login/forgot-password', from);
                  const e = email.trim();
                  if (!e) return base;
                  const sep = base.includes('?') ? '&' : '?';
                  return `${base}${sep}email=${encodeURIComponent(e)}`;
                })()}
                className={styles.forgotLink}
              >
                Забыли пароль?
              </Link>
            </div>
            {resetOk && !formError ? (
              <p className={styles.hint} role="status">
                Пароль обновлён. Войдите с новым паролем.
              </p>
            ) : null}
            {formError ? (
              <p className={styles.error} role="alert">
                {formError}
              </p>
            ) : null}
          </div>
        </fieldset>
        <PrimaryBtn type="submit" disabled={loading}>
          {loading ? 'Вход…' : 'Войти'}
        </PrimaryBtn>
      </form>
    </AuthSplitShell>
  );
}
