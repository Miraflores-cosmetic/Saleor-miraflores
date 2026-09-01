'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { FloatingTextField } from '@/components/FloatingTextField/FloatingTextField';
import { PrimaryBtn } from '@/components/PrimaryBtn/PrimaryBtn';
import { safeAuthFrom, withAuthFrom } from '@/lib/safeReturnPath';
import { AuthSplitShell } from '../AuthSplitShell';
import styles from '../LoginPage.module.css';

function emailFromQuery(raw: string | null): string {
  if (!raw?.trim()) return '';
  try {
    return decodeURIComponent(raw.trim()).slice(0, 254);
  } catch {
    return raw.trim().slice(0, 254);
  }
}

export function ForgotPasswordClient() {
  const searchParams = useSearchParams();
  const from = useMemo(
    () => safeAuthFrom(searchParams.get('from')),
    [searchParams],
  );
  const loginHref = withAuthFrom('/login', from);

  const [email, setEmail] = useState(() => emailFromQuery(searchParams.get('email')));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDevHint(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        devHint?: string;
      };
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Не удалось отправить');
        return;
      }
      setDone(true);
      if (typeof data.devHint === 'string' && data.devHint) {
        setDevHint(data.devHint);
      }
    } catch {
      setError('Сеть недоступна');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplitShell backHref={loginHref}>
      <div className={styles.intro}>
        <h2 className={styles.title}>Сброс пароля</h2>
        <p className={styles.subtitle}>
          Вспомнили пароль?{' '}
          <Link href={loginHref} className={styles.linkAccent}>
            Войти
          </Link>
        </p>
      </div>

      {done ? (
        <div className={styles.fields}>
          <p className={styles.hint} role="status">
            Если аккаунт с таким email существует, мы отправили ссылку для сброса
            пароля.
          </p>
          {devHint ? (
            <p className={styles.hint} role="note">
              Dev: {devHint}
            </p>
          ) : null}
          <Link href={loginHref} className={styles.forgotLink}>
            Вернуться ко входу
          </Link>
        </div>
      ) : (
        <form className={styles.form} noValidate onSubmit={(e) => void onSubmit(e)}>
          <div className={styles.fields}>
            <FloatingTextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <PrimaryBtn type="submit" disabled={loading}>
            {loading ? 'Отправка…' : 'Отправить ссылку'}
          </PrimaryBtn>
        </form>
      )}
    </AuthSplitShell>
  );
}
