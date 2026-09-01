'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { FloatingTextField } from '@/components/FloatingTextField/FloatingTextField';
import { PrimaryBtn } from '@/components/PrimaryBtn/PrimaryBtn';
import { firstPasswordError } from '@/lib/passwordPolicy';
import { AuthSplitShell } from '../AuthSplitShell';
import { PasswordMeter } from '../PasswordMeter';
import styles from '../LoginPage.module.css';

export function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(
    () => (searchParams.get('t') ?? searchParams.get('token') ?? '').trim(),
    [searchParams],
  );

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError('Ссылка недействительна или истекла');
      return;
    }
    if (password.length === 0) {
      setError('Введите пароль');
      return;
    }
    const pwErr = firstPasswordError(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (password !== passwordConfirm) {
      setError('Пароли не совпадают');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Не удалось сменить пароль');
        return;
      }
      router.replace('/login?reset=ok');
      router.refresh();
    } catch {
      setError('Сеть недоступна');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplitShell backHref="/login">
      <div className={styles.intro}>
        <h2 className={styles.title}>Новый пароль</h2>
        <p className={styles.subtitle}>
          После сохранения войдите с новым паролем.
        </p>
      </div>

      {!token ? (
        <div className={styles.fields}>
          <p className={styles.error} role="alert">
            Ссылка недействительна или истекла
          </p>
          <Link href="/login" className={styles.forgotLink}>
            Ко входу
          </Link>
        </div>
      ) : (
        <form className={styles.form} noValidate onSubmit={(e) => void onSubmit(e)}>
          <fieldset className={styles.fieldset} disabled={loading}>
            <div className={styles.fields}>
              <div className={styles.passwordStack}>
                <FloatingTextField
                  label="Пароль"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                <PasswordMeter password={password} />
                <FloatingTextField
                  label="Повторите пароль"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </fieldset>
          <PrimaryBtn type="submit" disabled={loading}>
            {loading ? 'Сохранение…' : 'Сохранить пароль'}
          </PrimaryBtn>
        </form>
      )}
    </AuthSplitShell>
  );
}
