'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useBuyerAuth } from '@/lib/BuyerAuthProvider';

/** Если уже залогинен — уводим на from. */
export function useRedirectIfBuyerAuthed(
  from: string,
  opts?: { enabled?: boolean },
) {
  const router = useRouter();
  const { ready, authenticated } = useBuyerAuth();
  const enabled = opts?.enabled !== false;

  useEffect(() => {
    if (!enabled || !ready) return;
    if (authenticated) {
      router.replace(from);
    }
  }, [router, from, enabled, ready, authenticated]);
}

export type AuthFieldErrors = {
  displayName?: string;
  email?: string;
  password?: string;
  passwordConfirm?: string;
  consentPersonalData?: string;
  otp?: string;
};

export function clearAuthField(
  setErrors: React.Dispatch<React.SetStateAction<AuthFieldErrors>>,
  key: keyof AuthFieldErrors,
) {
  setErrors((prev) => {
    if (!prev[key]) return prev;
    const next = { ...prev };
    delete next[key];
    return next;
  });
}
