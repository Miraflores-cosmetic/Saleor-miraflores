import { Suspense } from 'react';
import styles from '../CheckoutPage.module.css';
import { CheckoutSuccessClient } from './CheckoutSuccessClient';

export const metadata = {
  title: 'Заказ оформлен — Jcos',
  robots: { index: false, follow: false },
};

export default function CheckoutSuccessPage() {
  return (
    <main className={styles.main}>
      <div className={`padding-global ${styles.successWrap}`}>
        <Suspense
          fallback={
            <div>
              <p className={styles.successEyebrow}>Оплата</p>
              <h1 className={styles.successTitle}>
                <span className={styles.successSpinner} aria-hidden />
                Подтверждаем оплату…
              </h1>
            </div>
          }
        >
          <CheckoutSuccessClient />
        </Suspense>
      </div>
    </main>
  );
}
