import { describe, expect, it } from 'vitest';
import {
  giftCertificateIssuedEmail,
  giftPurchasePaidEmail,
  maskGiftCertificateCode,
} from './gift-purchase-email';

describe('giftPurchasePaidEmail', () => {
  it('отправляет код получателю', () => {
    const mail = giftPurchasePaidEmail({
      orderNumber: 'JCOS-1',
      codes: ['JC-AAAA-BBBB-CCCC'],
      faceValue: 3000,
      expiresAt: null,
      recipientEmail: 'gift@ex.com',
      buyerEmail: 'buyer@ex.com',
    });
    expect(mail.to).toBe('gift@ex.com');
    expect(mail.text).toContain('JC-AAAA-BBBB-CCCC');
    expect(mail.subject).toContain('JCOS-1');
    expect(mail.html).toContain('Miraflores');
  });
});

describe('giftCertificateIssuedEmail', () => {
  it('письмо выпуска / resend', () => {
    const mail = giftCertificateIssuedEmail({
      codes: ['JC-AAAA-BBBB-CCCC'],
      faceValue: 1000,
      expiresAt: null,
      to: 'a@b.co',
      resend: true,
    });
    expect(mail.to).toBe('a@b.co');
    expect(mail.subject).toContain('Повторная');
    expect(mail.html).toContain('JC-AAAA-BBBB-CCCC');
    expect(mail.html).toContain('Miraflores');
  });
});

describe('maskGiftCertificateCode', () => {
  it('маскирует хвост', () => {
    expect(maskGiftCertificateCode('JC-AAAA-BBBB-CCCC')).toBe('JC-AAAA-****-****');
  });
});
