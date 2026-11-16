import { expect, test } from '@playwright/test';
import { formatINR, lineTotalPaise, sumPaise, toPaise } from '../src/lib/money';

function plain(value: string): string {
  return value.replace(/\u00a0/g, ' ');
}

test.describe('INR money helpers', () => {
  test('formats integer paise with the Indian grouping', () => {
    expect(plain(formatINR(12_450_000))).toBe('₹1,24,500');
    expect(plain(formatINR(49_900))).toBe('₹499');
    expect(plain(formatINR(49_950))).toBe('₹499.50');
    expect(plain(formatINR(0))).toBe('₹0');
  });

  test('rounds rupee input to paise and rejects fractional paise', () => {
    expect(toPaise(285.5)).toBe(28_550);
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(() => formatINR(1.5)).toThrow(/integer number of paise/);
    expect(() => sumPaise([100, 2.5])).toThrow(/integer number of paise/);
  });

  test('adds and multiplies without floating-point currency arithmetic', () => {
    expect(sumPaise([49_900, 28_550])).toBe(78_450);
    expect(lineTotalPaise(28_550, 3)).toBe(85_650);
    expect(lineTotalPaise(13_500, 2) + 14_900).toBe(41_900);
    expect(() => lineTotalPaise(100, -1)).toThrow(/quantity/);
  });
});
