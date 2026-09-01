'use client';

import { FloatingTextField } from '@/components/FloatingTextField/FloatingTextField';
import { PhoneField } from '@/components/PhoneField/PhoneField';
import styles from './CheckoutPage.module.css';

export type CheckoutContactValues = {
  email: string;
  phone: string;
  customerName: string;
};

export type CheckoutContactErrors = Partial<
  Record<keyof CheckoutContactValues, string>
>;

type Props = {
  values: CheckoutContactValues;
  errors: CheckoutContactErrors;
  disabled?: boolean;
  /** Авторизованный покупатель: email из аккаунта, без правки. */
  emailLocked?: boolean;
  onChange: (patch: Partial<CheckoutContactValues>) => void;
};

export function CheckoutContactSection({
  values,
  errors,
  disabled,
  emailLocked,
  onChange,
}: Props) {
  return (
    <section className={styles.section} aria-labelledby="contact-heading">
      <h2 id="contact-heading" className={styles.sectionTitle}>
        Контакты
      </h2>
      <div className={styles.fields}>
        <FloatingTextField
          label="Email"
          type="email"
          value={values.email}
          onChange={(e) => onChange({ email: e.target.value })}
          autoComplete="email"
          required
          disabled={disabled || emailLocked}
          error={errors.email}
        />
        {emailLocked ? (
          <p className={styles.emailLockedHint}>
            Email из аккаунта. Чтобы изменить — обновите профиль в личном кабинете.
          </p>
        ) : null}
        <PhoneField
          label="Телефон"
          value={values.phone}
          onChange={(phone) => onChange({ phone })}
          required
          disabled={disabled}
          error={errors.phone}
        />
        <FloatingTextField
          label="Имя и фамилия"
          value={values.customerName}
          onChange={(e) => onChange({ customerName: e.target.value })}
          autoComplete="name"
          required
          disabled={disabled}
          error={errors.customerName}
        />
      </div>
    </section>
  );
}
