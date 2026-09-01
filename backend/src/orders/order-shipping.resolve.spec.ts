import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ShipmentProvider } from '@prisma/client';
import {
  buildQuoteCost,
  computeFreePvzShipping,
  isPvzShippingComment,
  requireCheckoutShipmentProvider,
  resolveShippingFromQuote,
} from './order-shipping.resolve';
import type { ShippingQuotePayload } from './shipping-quote.service';
import {
  hashCartLines,
  hashShippingAddress,
} from './shipping-quote.service';

describe('requireCheckoutShipmentProvider', () => {
  it('принимает CDEK и YANDEX', () => {
    expect(requireCheckoutShipmentProvider('cdek')).toBe('CDEK');
    expect(requireCheckoutShipmentProvider('YANDEX')).toBe('YANDEX');
  });

  it('отклоняет PICKUP и пустое', () => {
    expect(() => requireCheckoutShipmentProvider(null)).toThrow(
      BadRequestException,
    );
    expect(() => requireCheckoutShipmentProvider('PICKUP')).toThrow(
      BadRequestException,
    );
  });
});

describe('isPvzShippingComment / computeFreePvzShipping', () => {
  it('СДЭК ПВЗ с кодом в __VSP__ при пороге', () => {
    const comment =
      '__VSP:carrier=cdek|lon=|lat=|pvz=MSK45|dropoff=pvz__\nТип доставки: СДЭК ПВЗ. Детали: …';
    expect(isPvzShippingComment(comment)).toBe(true);
    expect(
      computeFreePvzShipping({
        shippingComment: comment,
        goodsSubtotal: 12_000,
        freeShippingThresholdRub: 10_000,
      }),
    ).toBe(true);
  });

  it('текст СДЭК ПВЗ без кода — не бесплатно', () => {
    expect(isPvzShippingComment('Тип доставки: СДЭК ПВЗ. Детали: …')).toBe(
      false,
    );
    expect(
      computeFreePvzShipping({
        shippingComment: 'Тип доставки: СДЭК ПВЗ. Детали: …',
        goodsSubtotal: 12_000,
        freeShippingThresholdRub: 10_000,
      }),
    ).toBe(false);
  });

  it('текст Яндекс ПВЗ без __VSP__ — не бесплатно', () => {
    expect(
      isPvzShippingComment('Тип доставки: Яндекс Доставка ПВЗ. Детали: …'),
    ).toBe(false);
  });

  it('Яндекс __VSP__ с pvz — ПВЗ', () => {
    expect(
      isPvzShippingComment(
        '__VSP:carrier=yandex|lon=37|lat=55|pvz=abc|dropoff=pvz__\nТип доставки: Яндекс Доставка ПВЗ.',
      ),
    ).toBe(true);
  });

  it('курьер не бесплатен', () => {
    expect(
      computeFreePvzShipping({
        shippingComment: 'Тип доставки: СДЭК Курьер. Детали: …',
        goodsSubtotal: 50_000,
        freeShippingThresholdRub: 10_000,
      }),
    ).toBe(false);
  });
});

describe('buildQuoteCost', () => {
  const base = {
    shippingMethod: 'CDEK',
    shippingComment:
      '__VSP:carrier=cdek|lon=|lat=|pvz=MSK45|dropoff=pvz__\nТип доставки: СДЭК ПВЗ. Детали: x',
    pvzCode: 'MSK45',
    goodsSubtotal: 5000,
    freeShippingThresholdRub: 10_000,
  };

  it('бесплатно при ПВЗ и пороге', () => {
    expect(
      buildQuoteCost({
        ...base,
        goodsSubtotal: 12_000,
        clientEstimate: 0,
      }),
    ).toEqual({ cost: 0, method: 'CDEK', freePvz: true });
  });

  it('подписывает clientEstimate', () => {
    expect(buildQuoteCost({ ...base, clientEstimate: 349 })).toEqual({
      cost: 349,
      method: 'CDEK',
      freePvz: false,
    });
  });

  it('берёт max(client, server)', () => {
    expect(
      buildQuoteCost({ ...base, clientEstimate: 200, serverEstimate: 349 }),
    ).toEqual({
      cost: 349,
      method: 'CDEK',
      freePvz: false,
    });
  });

  it('отклоняет 0 без free', () => {
    expect(() => buildQuoteCost({ ...base, clientEstimate: 0 })).toThrow(
      BadRequestException,
    );
  });
});

describe('resolveShippingFromQuote', () => {
  const addr = {
    city: 'Москва',
    address: 'Тверская 1',
    comment:
      '__VSP:carrier=cdek|lon=|lat=|pvz=MSK45|dropoff=pvz__\nТип доставки: СДЭК ПВЗ. Детали: x',
    pvzCode: 'MSK45',
  };
  const lines = [{ variantId: 'v1', qty: 1 }];
  const method = 'CDEK' as const;

  function quote(
    partial: Partial<ShippingQuotePayload> & Pick<ShippingQuotePayload, 'cost'>,
  ): ShippingQuotePayload {
    return {
      v: 1,
      method,
      addrHash: hashShippingAddress(addr, method),
      linesHash: hashCartLines(lines),
      goodsSubtotal: 5000,
      freePvz: false,
      exp: Math.floor(Date.now() / 1000) + 600,
      ...partial,
    };
  }

  it('принимает валидный quote', () => {
    const r = resolveShippingFromQuote({
      quote: quote({ cost: 349 }),
      shippingMethod: method,
      shippingAddress: addr,
      lines,
      goodsSubtotal: 5000,
      freeShippingThresholdRub: 10_000,
    });
    expect(r).toEqual({ cost: 349, method: ShipmentProvider.CDEK });
  });

  it('отклоняет смену адреса', () => {
    expect(() =>
      resolveShippingFromQuote({
        quote: quote({ cost: 349 }),
        shippingMethod: method,
        shippingAddress: { ...addr, city: 'СПб' },
        lines,
        goodsSubtotal: 5000,
        freeShippingThresholdRub: 10_000,
      }),
    ).toThrow(BadRequestException);
  });

  it('force 0 если free сейчас', () => {
    const r = resolveShippingFromQuote({
      quote: quote({ cost: 349, freePvz: false }),
      shippingMethod: method,
      shippingAddress: addr,
      lines,
      goodsSubtotal: 15_000,
      freeShippingThresholdRub: 10_000,
    });
    expect(r.cost).toBe(0);
  });
});
