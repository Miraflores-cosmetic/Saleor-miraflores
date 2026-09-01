import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthFormSkeleton } from '../../login/AuthFormSkeleton';
import { RegisterWelcomeClient } from './RegisterWelcomeClient';

export const metadata: Metadata = {
  title: { absolute: 'Добро пожаловать — Jcos' },
};

export default function RegisterWelcomePage() {
  return (
    <Suspense fallback={<AuthFormSkeleton mode="register" />}>
      <RegisterWelcomeClient />
    </Suspense>
  );
}
