/**
 * Единый итог к оплате: товары (после промо) + доставка.
 * null — доставка ещё не готова (не показываем сумму «без shipping» на CTA).
 */
export function calcPayableTotal(opts: {
  goodsTotal: number;
  shippingCost: number | null | undefined;
}): number | null {
  const goods = Math.max(0, Math.floor(opts.goodsTotal || 0));
  if (opts.shippingCost == null || !Number.isFinite(opts.shippingCost)) {
    return null;
  }
  const shipping = Math.max(0, Math.floor(opts.shippingCost));
  return goods + shipping;
}
