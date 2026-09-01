/** Общие письма по подарочным сертификатам. */

import {
  buildGiftBuyerCopyEmail,
  buildGiftCertificateIssuedEmail,
  buildGiftPurchasePaidEmail,
} from '../mail/email-templates';

function siteFromEnv(): string | null {
  return process.env.FRONTEND_PUBLIC_URL?.trim() || null;
}

/** После оплаты покупки на сайте. */
export function giftPurchasePaidEmail(params: {
  orderNumber: string;
  codes: string[];
  faceValue: number;
  expiresAt: Date | null;
  recipientEmail: string;
  buyerEmail: string;
}): { subject: string; text: string; html: string; to: string } {
  const { orderNumber, codes, faceValue, expiresAt, recipientEmail, buyerEmail } =
    params;
  const to = recipientEmail || buyerEmail;
  const built = buildGiftPurchasePaidEmail({
    orderNumber,
    codes,
    faceValue,
    expiresAt,
    buyerEmail: buyerEmail !== to ? buyerEmail : undefined,
    siteUrl: siteFromEnv(),
  });
  return { to, ...built };
}

/** Копия покупателю, если код ушёл на другой email. */
export function giftBuyerCopyEmail(params: {
  orderNumber: string;
  recipientEmail: string;
  to: string;
}): { subject: string; text: string; html: string; to: string } {
  const built = buildGiftBuyerCopyEmail({
    orderNumber: params.orderNumber,
    recipientEmail: params.recipientEmail,
    siteUrl: siteFromEnv(),
  });
  return { to: params.to, ...built };
}

/** Ручной выпуск / повторная отправка из админки. */
export function giftCertificateIssuedEmail(params: {
  codes: string[];
  faceValue: number;
  expiresAt: Date | null;
  to: string;
  resend?: boolean;
}): { subject: string; text: string; html: string; to: string } {
  const built = buildGiftCertificateIssuedEmail({
    codes: params.codes,
    faceValue: params.faceValue,
    expiresAt: params.expiresAt,
    resend: params.resend,
    siteUrl: siteFromEnv(),
  });
  return { to: params.to, ...built };
}

/** Маскировка кода в логах: JC-XXXX-****-**** */
export function maskGiftCertificateCode(code: string): string {
  const n = code.trim().toUpperCase();
  if (n.length < 8) return '****';
  const parts = n.split('-');
  if (parts.length >= 4) {
    return `${parts[0]}-${parts[1]}-****-****`;
  }
  return `${n.slice(0, 6)}…`;
}
