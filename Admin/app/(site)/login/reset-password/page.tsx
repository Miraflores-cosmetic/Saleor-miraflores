import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthFormSkeleton } from '../AuthFormSkeleton';
import { ResetPasswordClient } from './ResetPasswordClient';

export const metadata: Metadata = {
  title: { absolute: 'Новый пароль — Jcos' },
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton mode="login" />}>
      <ResetPasswordClient />
    </Suspense>
  );
}
