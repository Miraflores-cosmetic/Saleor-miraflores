export type PromoType = 'PERCENT' | 'FIXED';

export type AdminPromoRedemption = {
  id: string;
  orderId: string;
  code: string;
  discountAmount: number;
  email: string | null;
  userId: string | null;
  guestId: string | null;
  createdAt: string;
  order?: { number: string; total: number; status: string };
};

export type AdminPromoCode = {
  id: string;
  code: string;
  type: string;
  value: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  maxUses: number | null;
  oneShot: boolean;
  minOrderAmount: number | null;
  usedCount?: number;
  redemptions?: AdminPromoRedemption[];
  redemptionsTotal?: number;
  redemptionsPage?: number;
  redemptionsLimit?: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminPromoListResponse = {
  items: AdminPromoCode[];
  total: number;
  page: number;
  limit: number;
};

export type PromoValidateResponse = {
  code: string;
  type: string;
  value: number;
  discountAmount: number;
  subtotal: number;
  total: number;
};

export function formatPromoReward(type: string, value: number): string {
  if (type === 'PERCENT') return `${value}%`;
  if (type === 'FIXED') {
    return `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`;
  }
  return `${type}: ${value}`;
}
