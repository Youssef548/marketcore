import { describe, expect, it } from 'vitest';
import { CurrencyCodes, OrderStatuses } from '../src/constants';
import { BuyerOrderPageSchema, BuyerOrderSchema } from '../src/buyer-order';

const summary = {
  id: 'o1',
  checkoutId: 'k1',
  status: OrderStatuses.PENDING_PAYMENT,
  totalMinor: 24_900,
  currency: CurrencyCodes.EGP,
  createdAt: '2026-10-16T10:00:00.000Z',
  seller: { name: 'Nile', slug: 'nile' },
  itemCount: 1,
};

describe('buyer orders (SRS-FR-BORD-001, -002)', () => {
  it('lists summaries in a page', () => {
    expect(BuyerOrderPageSchema.parse({ items: [summary], nextCursor: 'o1' }).items).toHaveLength(1);
  });

  it('details items, unit prices, total, status, checkout and seller', () => {
    // A detail carries items, not a count: the summary's `itemCount` is deliberately
    // absent, which is what makes the strict parse meaningful here.
    const detail = {
      id: summary.id,
      checkoutId: summary.checkoutId,
      status: summary.status,
      totalMinor: summary.totalMinor,
      currency: summary.currency,
      createdAt: summary.createdAt,
      seller: summary.seller,
      items: [{ productId: 'p1', name: 'Shirt', quantity: 1, unitPriceMinor: 24_900 }],
    };
    expect(BuyerOrderSchema.parse(detail)).toEqual(detail);
  });

  it('never carries the buyer or the seller organization id', () => {
    expect(BuyerOrderPageSchema.safeParse({ items: [{ ...summary, buyerId: 'u1' }], nextCursor: null }).success).toBe(false);
    expect(BuyerOrderPageSchema.safeParse({ items: [{ ...summary, organizationId: 'org' }], nextCursor: null }).success).toBe(false);
  });
});
