/**
 * INR money helpers.
 *
 * Every amount in Demo_Ecom is an integer number of paise. Arithmetic happens
 * in paise; only the display step divides by 100 for Intl.NumberFormat, and
 * that formatter supplies the Indian grouping (₹1,24,500).
 */

const wholeRupeeFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const paiseFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function assertIntegerPaise(value: number, label = 'amount'): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be an integer number of paise, received ${value}`);
  }
}

export function formatINR(paise: number): string {
  assertIntegerPaise(paise, 'price');
  const formatter = paise % 100 === 0 ? wholeRupeeFormatter : paiseFormatter;
  return formatter.format(paise / 100);
}

export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) {
    throw new TypeError(`rupees must be a finite number, received ${rupees}`);
  }
  return Math.round(rupees * 100);
}

export function sumPaise(values: readonly number[]): number {
  return values.reduce((total, value) => {
    assertIntegerPaise(value, 'line amount');
    return total + value;
  }, 0);
}

export function lineTotalPaise(unitPricePaise: number, quantity: number): number {
  assertIntegerPaise(unitPricePaise, 'unit price');
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new TypeError(`quantity must be a non-negative integer, received ${quantity}`);
  }
  return unitPricePaise * quantity;
}
