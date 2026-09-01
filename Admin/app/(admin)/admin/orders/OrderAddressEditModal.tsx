'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminCheckbox } from '@/components/admin/AdminCheckbox/AdminCheckbox';
import { AdminModal, AdminModalActions } from '@/components/admin/AdminModal/AdminModal';
import { AdminTextField } from '@/components/AdminTextField/AdminTextField';
import {
  ShippingCarrierModal,
  type ShippingSelection,
} from '@/components/shipping/ShippingCarrierModal';
import type { AdminOrderShippingAddress } from '@/lib/adminOrderTypes';
import { addressToShippingSeed } from '@/lib/shipping/buyerAddressHelpers';
import { buildJcosAddress2WithMeta } from '@/lib/shipping/addressShippingMeta';
import { estimateShippingCostRub } from '@/lib/shipping/estimateShippingCost';
import catalogStyles from '@/app/(admin)/admin/catalog/catalogAdmin.module.css';
import orderStyles from './orders.module.css';

const styles = { ...catalogStyles, ...orderStyles };

type PendingSelection = ShippingSelection;

export function OrderAddressEditModal({
  open,
  initial,
  shippingCost,
  shippingMethod,
  busy,
  customerName,
  customerPhone,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: AdminOrderShippingAddress | null;
  shippingCost: number;
  shippingMethod?: string | null;
  busy: boolean;
  customerName?: string | null;
  customerPhone?: string | null;
  onClose: () => void;
  onSave: (payload: {
    address: AdminOrderShippingAddress;
    shippingCost: number;
    shippingMethod?: string;
    notifyCustomer: boolean;
  }) => Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [cost, setCost] = useState('0');
  const [estimating, setEstimating] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(true);

  const seed = useMemo(() => {
    if (!initial) return null;
    const base = addressToShippingSeed({
      recipientName: initial.recipientName || customerName,
      phone: initial.phone || customerPhone,
      city: initial.city,
      address: initial.address,
      apartment: initial.apartment,
      postalCode: initial.postalCode,
      comment: initial.comment,
    });
    if (!base.pvzId && initial.pvzCode) {
      base.pvzId = initial.pvzCode;
    }
    if (!base.carrier) {
      const m = (shippingMethod || 'CDEK').toUpperCase();
      base.carrier = m === 'YANDEX' ? 'yandex' : 'cdek';
    }
    if (initial.region?.trim()) base.region = initial.region.trim();
    if (initial.district?.trim()) base.district = initial.district.trim();
    return base;
  }, [initial, customerName, customerPhone, shippingMethod]);

  useEffect(() => {
    if (!open) {
      setConfirmOpen(false);
      setPending(null);
      setEstimating(false);
    }
  }, [open]);

  async function handleCarrierConfirm(selection: ShippingSelection) {
    setPending(selection);
    setNotifyCustomer(true);
    setCost(String(shippingCost ?? 0));
    setConfirmOpen(true);
    setEstimating(true);
    try {
      const estimated = await estimateShippingCostRub(selection);
      if (estimated != null && estimated >= 0) {
        setCost(String(estimated));
      }
    } catch {
      /* keep previous cost */
    } finally {
      setEstimating(false);
    }
  }

  async function save() {
    if (!pending) return;
    const shippingCostNum = Math.max(0, Math.round(Number(cost) || 0));
    const comment = buildJcosAddress2WithMeta(
      {
        carrier: pending.carrier,
        dropoff: pending.dropoff,
        ...(pending.lat != null ? { lat: pending.lat } : {}),
        ...(pending.lon != null ? { lon: pending.lon } : {}),
        ...(pending.pvzId ? { pvzId: pending.pvzId } : {}),
      },
      pending.comment,
    );
    await onSave({
      address: {
        city: pending.city.trim(),
        address: pending.address.trim(),
        apartment: pending.apartment.trim(),
        region:
          pending.region?.trim() ||
          (pending.city.trim() !== (initial?.city || '').trim()
            ? ''
            : initial?.region?.trim() || ''),
        district:
          pending.district?.trim() ||
          (pending.city.trim() !== (initial?.city || '').trim()
            ? ''
            : initial?.district?.trim() || ''),
        postalCode: pending.postalCode.trim(),
        phone: pending.phone.trim(),
        recipientName: pending.recipientName.trim(),
        pvzCode:
          pending.dropoff === 'pvz' ? (pending.pvzId?.trim() || '') : '',
        comment,
      },
      shippingCost: shippingCostNum,
      shippingMethod: pending.carrier === 'yandex' ? 'YANDEX' : 'CDEK',
      notifyCustomer,
    });
    setConfirmOpen(false);
    setPending(null);
  }

  return (
    <>
      <ShippingCarrierModal
        open={open && !confirmOpen}
        seed={seed}
        profileDefaults={{
          recipientName: customerName ?? undefined,
          phone: customerPhone ?? undefined,
        }}
        onClose={onClose}
        onConfirm={(selection) => void handleCarrierConfirm(selection)}
      />

      <AdminModal
        open={confirmOpen}
        title="Сохранить адрес доставки"
        onClose={() => {
          if (busy) return;
          setConfirmOpen(false);
          setPending(null);
        }}
        footer={
          <AdminModalActions
            onCancel={() => {
              setConfirmOpen(false);
              setPending(null);
            }}
            onConfirm={() => void save()}
            confirmLabel={busy ? 'Сохранение…' : 'Сохранить'}
            confirmDisabled={busy || !pending}
            cancelLabel="Назад к карте"
          />
        }
      >
        {pending ? (
          <div className={styles.orderAddressConfirm}>
            <p className={styles.muted} style={{ marginTop: 0 }}>
              {pending.carrier === 'yandex' ? 'Яндекс' : 'СДЭК'}
              {' · '}
              {pending.dropoff === 'pvz' ? 'ПВЗ' : 'Курьер'}
            </p>
            <p style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
              {[
                pending.recipientName,
                pending.phone,
                pending.city,
                pending.address,
                pending.apartment ? `кв./оф. ${pending.apartment}` : null,
                pending.postalCode,
                pending.dropoff === 'pvz' && pending.pvzId
                  ? `ПВЗ ${pending.pvzId}`
                  : null,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
            <AdminTextField
              label={
                estimating
                  ? 'Стоимость доставки, ₽ (считаем…)'
                  : 'Стоимость доставки, ₽'
              }
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              disabled={busy || estimating}
            />
            <div className={styles.labelCheckboxRow} style={{ marginTop: 14 }}>
              <AdminCheckbox
                id="order-address-notify"
                className={styles.adminCheckboxForm}
                checked={notifyCustomer}
                onChange={(e) => setNotifyCustomer(e.target.checked)}
                disabled={busy}
              />
              <label htmlFor="order-address-notify">
                Уведомить клиента письмом
              </label>
            </div>
          </div>
        ) : null}
      </AdminModal>
    </>
  );
}
