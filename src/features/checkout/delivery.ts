import type { CheckoutTotals } from './types';

// Delivery is free from Rs 500; below that the shop charges a flat Rs 49.
// Both values are integer paise and the rule lives on the server only.
export const FREE_DELIVERY_THRESHOLD_PAISE = 50_000;
export const STANDARD_DELIVERY_CHARGE_PAISE = 4_900;

export function deliveryChargePaise(subtotalPaise: number): number {
  if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise < 0) {
    throw new TypeError(`subtotalPaise must be a non-negative integer, received ${subtotalPaise}`);
  }
  return subtotalPaise >= FREE_DELIVERY_THRESHOLD_PAISE ? 0 : STANDARD_DELIVERY_CHARGE_PAISE;
}

export function totalsForSubtotal(subtotalPaise: number): CheckoutTotals {
  const deliveryCharge = deliveryChargePaise(subtotalPaise);
  return {
    subtotalPaise,
    deliveryChargePaise: deliveryCharge,
    totalPaise: subtotalPaise + deliveryCharge,
  };
}
