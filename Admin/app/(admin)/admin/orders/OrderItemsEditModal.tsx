'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminCheckbox } from '@/components/admin/AdminCheckbox/AdminCheckbox';
import { AdminCompactBtn } from '@/components/AdminCompactBtn/AdminCompactBtn';
import { AdminModal, AdminModalActions } from '@/components/admin/AdminModal/AdminModal';
import { AdminTextField } from '@/components/AdminTextField/AdminTextField';
import { VariantPickerModal } from '@/app/(admin)/admin/settings/gratitude/VariantPickerModal';
import type { AdminOrderItem } from '@/lib/adminOrderTypes';
import { formatAdminMoney } from '@/lib/adminFormat';
import catalogStyles from '@/app/(admin)/admin/catalog/catalogAdmin.module.css';
import orderStyles from './orders.module.css';

const styles = { ...catalogStyles, ...orderStyles };

export type DraftOrderLine = {
  key: string;
  variantId: string | null;
  title: string;
  sku: string;
  qty: number;
  unitPrice: number;
  isGratitudeGift?: boolean;
};

function toDraft(items: AdminOrderItem[]): DraftOrderLine[] {
  return items.map((i, idx) => ({
    key: i.id || `line-${idx}`,
    variantId: i.variantId ?? null,
    title: i.title,
    sku: i.sku,
    qty: i.qty,
    unitPrice: i.unitPrice,
    isGratitudeGift: Boolean(i.isGratitudeGift),
  }));
}

export function OrderItemsEditModal({
  open,
  initialItems,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  initialItems: AdminOrderItem[];
  busy: boolean;
  onClose: () => void;
  onSave: (payload: {
    items: Array<{
      variantId: string | null;
      qty: number;
      unitPrice: number;
      title: string;
      sku: string;
      isGratitudeGift?: boolean;
    }>;
    notifyCustomer: boolean;
  }) => Promise<void>;
}) {
  const [lines, setLines] = useState<DraftOrderLine[]>([]);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLines(toDraft(initialItems));
    setNotifyCustomer(true);
    setPickerOpen(false);
  }, [open, initialItems]);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.unitPrice * l.qty, 0),
    [lines],
  );

  function updateLine(key: string, patch: Partial<DraftOrderLine>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  async function save() {
    if (!lines.length) return;
    await onSave({
      items: lines.map((l) => ({
        variantId: l.variantId,
        qty: Math.max(1, Math.round(l.qty) || 1),
        unitPrice: Math.max(0, Math.round(l.unitPrice) || 0),
        title: l.title,
        sku: l.sku,
        isGratitudeGift: l.isGratitudeGift,
      })),
      notifyCustomer,
    });
  }

  return (
    <>
      <AdminModal
        open={open}
        title="Изменить состав"
        wide
        onClose={onClose}
        footer={
          <AdminModalActions
            onCancel={onClose}
            onConfirm={() => void save()}
            confirmLabel={busy ? 'Сохранение…' : 'Сохранить'}
            confirmDisabled={busy || lines.length === 0}
          />
        }
      >
        <div style={{ marginBottom: 12 }}>
          <AdminCompactBtn
            type="button"
            variant="outline"
            onClick={() => setPickerOpen(true)}
          >
            Добавить из каталога
          </AdminCompactBtn>
        </div>

        {lines.length === 0 ? (
          <p className={styles.muted}>Добавьте хотя бы одну позицию</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Товар</th>
                  <th>Кол-во</th>
                  <th>Цена</th>
                  <th>Сумма</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key}>
                    <td>
                      <div>{l.title}</div>
                      <span className={styles.mutedInline}>{l.sku}</span>
                    </td>
                    <td style={{ width: 88 }}>
                      <AdminTextField
                        label="Кол-во"
                        value={String(l.qty)}
                        onChange={(e) =>
                          updateLine(l.key, {
                            qty: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                      />
                    </td>
                    <td style={{ width: 110 }}>
                      <AdminTextField
                        label="Цена"
                        value={String(l.unitPrice)}
                        onChange={(e) =>
                          updateLine(l.key, {
                            unitPrice: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                      />
                    </td>
                    <td>{formatAdminMoney(l.unitPrice * l.qty)}</td>
                    <td>
                      <AdminCompactBtn
                        type="button"
                        variant="outline"
                        onClick={() => removeLine(l.key)}
                      >
                        Убрать
                      </AdminCompactBtn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className={styles.muted} style={{ marginTop: 12 }}>
          Товары (без доставки/скидок): {formatAdminMoney(subtotal)}
        </p>

        <div className={styles.labelCheckboxRow} style={{ marginTop: 12 }}>
          <AdminCheckbox
            id="order-items-notify"
            className={styles.adminCheckboxForm}
            checked={notifyCustomer}
            onChange={(e) => setNotifyCustomer(e.target.checked)}
          />
          <label htmlFor="order-items-notify">Уведомить клиента письмом</label>
        </div>
      </AdminModal>

      <VariantPickerModal
        open={pickerOpen}
        selectedVariantId=""
        selectedLabel=""
        onClose={() => setPickerOpen(false)}
        onApply={(variantId, label, details) => {
          setLines((prev) => [
            ...prev,
            {
              key: `new-${variantId}-${Date.now()}`,
              variantId,
              title: details?.title || label,
              sku: details?.sku || '—',
              qty: 1,
              unitPrice: details?.price ?? 0,
            },
          ]);
        }}
      />
    </>
  );
}
