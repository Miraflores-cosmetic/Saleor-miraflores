import type { Metadata } from 'next';
import { AccountUserClient } from './AccountUserClient';

export const metadata: Metadata = {
  title: 'Личный кабинет — Jcos',
};

export default function AccountPage() {
  return <AccountUserClient />;
}
