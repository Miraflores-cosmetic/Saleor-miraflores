'use client';

import { formatAddressLine } from '@/lib/shipping/buyerAddressHelpers';
import styles from './CheckoutPage.module.css';

export type CheckoutDeliveryValues = {
  city: string;
  address: string;
  apartment: string;
  postalCode: string;
  comment: string;
};

export type CheckoutDeliveryErrors = Partial<
  Record<'city' | 'address' | 'apartment' | 'postalCode', string>
>;

export type CheckoutSavedAddress = {
  id: string;
  label: string;
  city: string;
  address: string;
  apartment: string;
  postalCode: string;
  comment: string;
  isDefault: boolean;
};

type Props = {
  values: CheckoutDeliveryValues;
  errors: CheckoutDeliveryErrors;
  disabled?: boolean;
  buyerAuthed?: boolean;
  savedAddresses?: CheckoutSavedAddress[];
  selectedAddressId?: string | null;
  onSelectSavedAddress?: (id: string) => void;
  onEditAddress?: () => void;
  onNewAddress?: () => void;
  /** Guest / «выбрать доставку» — открывает ShippingCarrierModal. */
  onSelectShipping?: () => void;
  /** Подпись выбранного способа (СДЭК ПВЗ / Яндекс курьер…). */
  shippingLabel?: string | null;
  /** Guest-only inline fields (legacy; prefer onSelectShipping). */
  onChange?: (patch: Partial<CheckoutDeliveryValues>) => void;
};

export function CheckoutDeliverySection({
  values,
  errors,
  disabled,
  buyerAuthed,
  savedAddresses = [],
  selectedAddressId,
  onSelectSavedAddress,
  onEditAddress,
  onNewAddress,
  onSelectShipping,
  shippingLabel,
}: Props) {
  const hasSaved = savedAddresses.length > 0;
  const hasDelivery = Boolean(values.city.trim() && values.address.trim());
  const hasFieldErrors = Boolean(
    errors.city || errors.address || errors.apartment || errors.postalCode,
  );

  if (buyerAuthed) {
    return (
      <section className={styles.section} aria-labelledby="ship-heading">
        <div className={styles.sectionHeadRow}>
          <h2 id="ship-heading" className={styles.sectionTitleFlush}>
            Доставка
          </h2>
          {!disabled && (selectedAddressId || hasDelivery) ? (
            <div className={styles.addressActions}>
              <button
                type="button"
                className={styles.editAddressBtn}
                onClick={onEditAddress}
              >
                Изменить
              </button>
            </div>
          ) : null}
        </div>

        {hasSaved ? (
          <ul className={styles.savedAddressList}>
            {savedAddresses.map((a) => (
              <li key={a.id}>
                <label
                  className={[
                    styles.savedAddressItem,
                    selectedAddressId === a.id
                      ? styles.savedAddressItemActive
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <input
                    type="radio"
                    name="checkout-saved-address"
                    className={styles.savedAddressRadio}
                    checked={selectedAddressId === a.id}
                    disabled={disabled}
                    onChange={() => onSelectSavedAddress?.(a.id)}
                  />
                  <span className={styles.savedAddressBody}>
                    <span className={styles.savedAddressTitle}>
                      {a.label}
                      {a.isDefault ? (
                        <span className={styles.savedAddressBadge}>
                          по умолчанию
                        </span>
                      ) : null}
                    </span>
                    <span className={styles.savedAddressMeta}>
                      {formatAddressLine(a)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
            {!selectedAddressId && hasDelivery ? (
              <li>
                <label
                  className={[
                    styles.savedAddressItem,
                    styles.savedAddressItemActive,
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="checkout-saved-address"
                    className={styles.savedAddressRadio}
                    checked
                    readOnly
                    disabled={disabled}
                  />
                  <span className={styles.savedAddressBody}>
                    <span className={styles.savedAddressTitle}>
                      Для этого заказа
                      {shippingLabel ? (
                        <span className={styles.savedAddressBadge}>
                          {shippingLabel}
                        </span>
                      ) : null}
                    </span>
                    <span className={styles.savedAddressMeta}>
                      {formatAddressLine(values)}
                    </span>
                  </span>
                </label>
              </li>
            ) : null}
          </ul>
        ) : hasDelivery ? (
          <p className={styles.selectedAddressHint}>
            {shippingLabel ? `${shippingLabel}: ` : 'Доставим: '}
            {formatAddressLine(values)}
          </p>
        ) : (
          <p className={styles.selectedAddressHint}>
            Укажите адрес доставки
            {hasFieldErrors && errors.address
              ? ` — ${errors.address}`
              : hasFieldErrors && errors.city
                ? ` — ${errors.city}`
                : ''}
          </p>
        )}

        {!disabled ? (
          <button
            type="button"
            className={styles.newAddressBlock}
            onClick={onNewAddress}
          >
            + Новая доставка
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className={styles.section} aria-labelledby="ship-heading">
      <div className={styles.sectionHeadRow}>
        <h2 id="ship-heading" className={styles.sectionTitleFlush}>
          Доставка
        </h2>
        {!disabled && hasDelivery ? (
          <div className={styles.addressActions}>
            <button
              type="button"
              className={styles.editAddressBtn}
              onClick={onSelectShipping}
            >
              Изменить
            </button>
          </div>
        ) : null}
      </div>

      {hasDelivery ? (
        <p className={styles.selectedAddressHint}>
          {shippingLabel ? `${shippingLabel}: ` : 'Доставим: '}
          {formatAddressLine(values)}
          {values.comment.trim() ? ` · ${values.comment.trim()}` : ''}
        </p>
      ) : (
        <p className={styles.selectedAddressHint}>
          Выберите перевозчика и пункт выдачи или адрес курьера
          {hasFieldErrors && errors.address
            ? ` — ${errors.address}`
            : hasFieldErrors && errors.city
              ? ` — ${errors.city}`
              : ''}
        </p>
      )}

      {!disabled ? (
        <button
          type="button"
          className={styles.newAddressBlock}
          onClick={onSelectShipping}
        >
          {hasDelivery ? 'Изменить доставку' : 'Выбрать доставку'}
        </button>
      ) : null}
    </section>
  );
}
