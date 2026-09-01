'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FloatingTextField } from '@/components/FloatingTextField/FloatingTextField';
import { PhoneField } from '@/components/PhoneField/PhoneField';
import { PrimaryBtn } from '@/components/PrimaryBtn/PrimaryBtn';
import { YooKassaWidget } from '@/components/YooKassaWidget/YooKassaWidget';
import { getOrCreateGuestId } from '@/lib/cart/guestId';
import { formatPhoneE164, isValidPhone } from '@/lib/phone';
import { useYooKassaOrderPayment } from '@/lib/payments/useYooKassaOrderPayment';
import { formatRub } from '@/lib/publicCatalog';
import { readApiError } from '@/lib/readApiError';
import styles from './CertificatesPage.module.css';

export type GiftDenomination = {
  id: string;
  name: string;
  faceValue: number;
  validityDays: number | null;
  images?: Array<{
    id: string;
    url: string;
    mediaType?: string;
    sortOrder: number;
  }>;
};

type CreatedPurchase = {
  id: string;
  number: string;
  total: number;
  payToken?: string | null;
  giftPurchaseRecipientEmail?: string | null;
};

type PayResponse = {
  alreadyPaid?: boolean;
  orderId: string;
  number: string;
  total: number;
  paymentId?: string;
  confirmationToken?: string;
  message?: string | string[];
};

type Props = {
  initialDenominations: GiftDenomination[];
};

export function CertificatesClient({ initialDenominations }: Props) {
  const router = useRouter();
  const [denoms] = useState(initialDenominations);
  const [denomId, setDenomId] = useState(initialDenominations[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<CreatedPurchase | null>(null);
  const [payToken, setPayToken] = useState<string | null>(null);

  const payment = useYooKassaOrderPayment({
    onPaid: (info) => {
      router.push(
        `/certificates/success?orderId=${encodeURIComponent(info.orderId)}&number=${encodeURIComponent(info.number)}`,
      );
    },
    onError: (msg) => setError(msg),
  });
  const confirmationToken = payment.confirmationToken;
  const paymentId = payment.paymentId;
  const idempotencyKeyRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `gift-${Date.now()}`,
  );

  const selected = useMemo(
    () => denoms.find((d) => d.id === denomId) ?? null,
    [denoms, denomId],
  );
  const total = selected ? selected.faceValue * qty : 0;
  const showWidget = payment.showWidget && Boolean(order);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/account/me', {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          email?: string;
          displayName?: string | null;
          phone?: string | null;
        };
        if (cancelled) return;
        if (data.email) setEmail((prev) => prev || data.email!);
        if (data.displayName) setCustomerName((prev) => prev || data.displayName!);
        if (data.phone) setPhone((prev) => prev || data.phone!);
      } catch {
        /* guest */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onPay = useCallback(async () => {
    setError(null);
    if (!selected) {
      setError('Выберите номинал');
      return;
    }
    if (!customerName.trim()) {
      setError('Укажите имя');
      return;
    }
    if (!email.trim()) {
      setError('Укажите email');
      return;
    }
    if (!isValidPhone(phone)) {
      setError('Некорректный телефон');
      return;
    }

    setBusy(true);
    try {
      if (!order) {
        const res = await fetch('/api/public/gift-certificates/purchase', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            denominationId: selected.id,
            qty,
            email: email.trim(),
            phone: formatPhoneE164(phone),
            customerName: customerName.trim(),
            guestId: getOrCreateGuestId(),
            idempotencyKey: idempotencyKeyRef.current,
            recipientEmail: recipientEmail.trim() || undefined,
          }),
          cache: 'no-store',
        });
        const data = (await res.json().catch(() => ({}))) as CreatedPurchase & {
          message?: string | string[];
        };
        if (!res.ok) {
          setError(readApiError(data, 'Не удалось создать заказ'));
          return;
        }
        if (!data.payToken) {
          setError('Сервер не вернул payToken');
          return;
        }
        setOrder(data);
        setPayToken(data.payToken);
        await payment.startPay(data.id, data.payToken);
        return;
      }

      const token = payToken;
      if (!token || !order) {
        setError('Нет токена оплаты');
        return;
      }
      await payment.startPay(order.id, token);
    } finally {
      setBusy(false);
    }
  }, [
    selected,
    customerName,
    email,
    phone,
    qty,
    recipientEmail,
    order,
    payToken,
    payment,
    router,
  ]);

  const resetPayment = useCallback(async () => {
    if (order?.id && payToken) {
      try {
        await fetch(`/api/public/orders/${encodeURIComponent(order.id)}/abandon`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payToken }),
        });
      } catch {
        /* ignore */
      }
    }
    setOrder(null);
    setPayToken(null);
    payment.resetPayment();
    idempotencyKeyRef.current =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `gift-${Date.now()}`;
  }, [order, payToken, payment]);

  if (!denoms.length) {
    return (
      <p className={styles.lead}>
        Номиналы сертификатов пока недоступны. Загляните позже или напишите нам.
      </p>
    );
  }

  return (
    <div className={styles.layout}>
      <div className={styles.intro}>
        <p className={styles.lead}>
          Электронный подарочный сертификат Jcos. Код придёт на email сразу после
          оплаты — можно использовать при оформлении заказа на сайте.
        </p>
      </div>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Номинал</h2>
        <div className={styles.denomGrid} role="listbox" aria-label="Номинал">
          {denoms.map((d) => {
            const active = d.id === denomId;
            const cover = [...(d.images ?? [])].sort(
              (a, b) => a.sortOrder - b.sortOrder,
            )[0];
            const isVideo =
              cover?.mediaType === 'video' || /\.(mp4|mov)(\?|$)/i.test(cover?.url ?? '');
            return (
              <button
                key={d.id}
                type="button"
                role="option"
                aria-selected={active}
                className={[styles.denomCard, active ? styles.denomCardActive : '']
                  .filter(Boolean)
                  .join(' ')}
                disabled={showWidget}
                onClick={() => setDenomId(d.id)}
              >
                {cover ? (
                  <span className={styles.denomMedia}>
                    {isVideo ? (
                      <video
                        className={styles.denomMediaEl}
                        src={cover.url}
                        muted
                        autoPlay
                        loop
                        playsInline
                        preload="metadata"
                        aria-hidden
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className={styles.denomMediaEl}
                        src={cover.url}
                        alt=""
                        loading="lazy"
                      />
                    )}
                  </span>
                ) : null}
                <span className={styles.denomValue}>{formatRub(d.faceValue)}</span>
                <span className={styles.denomName}>{d.name}</span>
                {d.validityDays != null ? (
                  <span className={styles.denomMeta}>{d.validityDays} дн.</span>
                ) : (
                  <span className={styles.denomMeta}>без срока</span>
                )}
              </button>
            );
          })}
        </div>

        <label className={styles.qtyLabel}>
          Количество
          <select
            className={styles.qtySelect}
            value={qty}
            disabled={showWidget}
            onChange={(e) => setQty(Number(e.target.value))}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.fields}>
          <FloatingTextField
            label="Имя"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            disabled={showWidget}
            autoComplete="name"
          />
          <FloatingTextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={showWidget}
            autoComplete="email"
          />
          <PhoneField
            label="Телефон"
            value={phone}
            onChange={setPhone}
            disabled={showWidget}
          />
          <FloatingTextField
            label="Email получателя (если подарок)"
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            disabled={showWidget}
            autoComplete="off"
          />
        </div>

        <div className={styles.totalRow}>
          <span>К оплате</span>
          <strong>{formatRub(total)}</strong>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        {showWidget ? (
          <div className={styles.payBlock}>
            <p className={styles.payHint}>
              Заказ {order?.number}. Оплатите через ЮKassa — код придёт на{' '}
              {recipientEmail.trim() || email.trim() || 'указанный email'}.
            </p>
            <YooKassaWidget
              confirmationToken={confirmationToken!}
              paymentId={paymentId}
              payToken={payment.payToken || payToken}
              onSuccess={() => void payment.checkPaid()}
              onError={() => setError('Оплата не прошла. Попробуйте ещё раз.')}
            />
            <button
              type="button"
              className={styles.secondaryBtn}
              disabled={busy}
              onClick={() => void resetPayment()}
            >
              Изменить заказ
            </button>
          </div>
        ) : (
          <PrimaryBtn type="button" disabled={busy || !selected} onClick={() => void onPay()}>
            {busy ? 'Создаём платёж…' : `Оплатить ${formatRub(total)}`}
          </PrimaryBtn>
        )}
      </div>
    </div>
  );
}
