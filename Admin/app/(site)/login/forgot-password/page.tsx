import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthFormSkeleton } from '../AuthFormSkeleton';
import { ForgotPasswordClient } from './ForgotPasswordClient';

export const metadata: Metadata = {
  title: { absolute: 'Сброс пароля — Jcos' },
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton mode="login" />}>
      <ForgotPasswordClient />
    </Suspense>
  );
}
