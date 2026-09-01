import { CheckoutClient } from './CheckoutClient';
import styles from './CheckoutPage.module.css';

export const metadata = {
  title: 'Оформление заказа — Jcos',
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <main className={styles.main}>
      <CheckoutClient />
    </main>
  );
}
