import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthFormSkeleton } from './AuthFormSkeleton';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: { absolute: 'Вход — Jcos' },
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton mode="login" />}>
      <LoginForm />
    </Suspense>
  );
}
