import { describe, expect, it } from 'vitest';
import type { Cart } from '@app/contracts';
import { canPlaceOrder, reviewCart } from './review';

const line = (overrides: Partial<Cart['sellers'][number]['lines'][number]> = {}) => ({
  productId: 'p1',
  name: 'Shirt',
  quantity: 1,
  currency: 'EGP' as const,
  addedUnitPriceMinor: 1000,
  currentUnitPriceMinor: 1000,
  available: 5,
  availability: 'OK' as const,
  ...overrides,
});
const cartOf = (...lines: ReturnType<typeof line>[]): Cart => ({
  sellers: [{ seller: { name: 'S', slug: 's' }, lines }],
});

describe('reviewCart', () => {
  it('lists a risen price with the old and the new (AC-US-CHK-001-1)', () => {
    const review = reviewCart(cartOf(line({ currentUnitPriceMinor: 1200 })));
    expect(review.priceChanges).toEqual([{ productId: 'p1', name: 'Shirt', fromMinor: 1000, toMinor: 1200, currency: 'EGP' }]);
  });

  it('confirms every line at its current price (D77)', () => {
    const review = reviewCart(cartOf(line({ quantity: 2, currentUnitPriceMinor: 1200 })));
    expect(review.confirmedLines).toEqual([{ productId: 'p1', quantity: 2, unitPriceMinor: 1200 }]);
    expect(review.totalMinor).toBe(2400);
  });

  it('flags a mixed-currency cart (AC-US-CHK-002-5, D71)', () => {
    const review = reviewCart(cartOf(line(), line({ productId: 'p2', currency: 'USD' })));
    expect(review.mixedCurrency).toBe(true);
    expect(review.currency).toBeNull();
  });
});

describe('canPlaceOrder (PRD-FR-CHK-002)', () => {
  it('is disabled until a price change is confirmed', () => {
    const review = reviewCart(cartOf(line({ currentUnitPriceMinor: 1200 })));
    expect(canPlaceOrder(review, false)).toBe(false);
    expect(canPlaceOrder(review, true)).toBe(true);
  });

  it('is disabled for a mixed-currency cart, confirmed or not', () => {
    const review = reviewCart(cartOf(line(), line({ productId: 'p2', currency: 'USD' })));
    expect(canPlaceOrder(review, true)).toBe(false);
  });

  it('is disabled while any line is short or sold out', () => {
    expect(canPlaceOrder(reviewCart(cartOf(line({ availability: 'SHORT', available: 0, quantity: 2 }))), true)).toBe(false);
    expect(
      canPlaceOrder(reviewCart(cartOf(line({ availability: 'SOLD_OUT', available: 0, currentUnitPriceMinor: null }))), true),
    ).toBe(false);
  });

  it('is disabled for an empty cart', () => {
    expect(canPlaceOrder(reviewCart({ sellers: [] }), true)).toBe(false);
  });
});
