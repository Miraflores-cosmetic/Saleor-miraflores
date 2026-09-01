import {
  GiftCertificateLedgerKind,
  GiftCertificateSource,
  GiftCertificateStatus,
  Prisma,
} from '@prisma/client';
import { allocateUniqueGiftCode } from './gift-certificate-code.allocate';

export const GIFT_PURCHASE_SKU = 'GIFT_CERTIFICATE';

function addDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export type IssuedGiftPurchase = {
  id: string;
  code: string;
  faceValue: number;
  expiresAt: Date | null;
};

/**
 * Идемпотентный выпуск сертификатов после оплаты заказа-покупки.
 * qty = сумма qty по позициям со sku GIFT_CERTIFICATE (или 1).
 */
export async function ensureGiftPurchaseIssue(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    email: string;
    giftPurchaseDenominationId: string | null;
    giftPurchaseRecipientEmail: string | null;
    items: Array<{ sku: string | null; qty: number }>;
  },
): Promise<IssuedGiftPurchase[]> {
  if (!order.giftPurchaseDenominationId) return [];

  const existing = await tx.giftCertificate.findMany({
    where: { purchaseOrderId: order.id },
    select: {
      id: true,
      code: true,
      faceValue: true,
      expiresAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  if (existing.length) return existing;

  const denom = await tx.giftCertificateDenomination.findUnique({
    where: { id: order.giftPurchaseDenominationId },
  });
  if (!denom) return [];

  const qtyFromItems = order.items
    .filter((i) => (i.sku ?? '') === GIFT_PURCHASE_SKU)
    .reduce((s, i) => s + Math.max(0, i.qty), 0);
  const count = Math.max(1, Math.min(20, qtyFromItems || 1));

  const recipientEmail =
    order.giftPurchaseRecipientEmail?.trim().toLowerCase() ||
    order.email.trim().toLowerCase();

  const recipientUser =
    recipientEmail
      ? await tx.user.findUnique({
          where: { email: recipientEmail },
          select: { id: true },
        })
      : null;

  const issuedAt = new Date();
  const expiresAt =
    denom.validityDays != null ? addDays(issuedAt, denom.validityDays) : null;

  const issued: IssuedGiftPurchase[] = [];
  for (let i = 0; i < count; i++) {
    const code = await allocateUniqueGiftCode(tx);
    const cert = await tx.giftCertificate.create({
      data: {
        code,
        denominationId: denom.id,
        faceValue: denom.faceValue,
        balance: denom.faceValue,
        status: GiftCertificateStatus.ACTIVE,
        source: GiftCertificateSource.PURCHASE,
        issuedAt,
        expiresAt,
        recipientEmail,
        recipientUserId: recipientUser?.id ?? null,
        purchaseOrderId: order.id,
        note: `Покупка в заказе`,
      },
      select: {
        id: true,
        code: true,
        faceValue: true,
        expiresAt: true,
      },
    });
    await tx.giftCertificateLedger.create({
      data: {
        certificateId: cert.id,
        kind: GiftCertificateLedgerKind.ISSUE,
        amount: denom.faceValue,
        balanceAfter: denom.faceValue,
        orderId: order.id,
        note: 'Покупка на сайте',
      },
    });
    issued.push(cert);
  }
  return issued;
}
