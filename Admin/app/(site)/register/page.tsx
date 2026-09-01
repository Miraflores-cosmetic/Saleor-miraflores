import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthFormSkeleton } from '../login/AuthFormSkeleton';
import { RegisterForm } from '../login/RegisterForm';

export const metadata: Metadata = {
  title: { absolute: 'Регистрация — Jcos' },
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton mode="register" />}>
      <RegisterForm />
    </Suspense>
  );
}
