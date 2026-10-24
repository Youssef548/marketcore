import { describe, expect, it } from 'vitest';
import {
  CHECKOUT_MAX_LINES,
  CheckoutConflictReasons,
  CheckoutRefusals,
  CheckoutStatuses,
  CurrencyCodes,
  OrderStatuses,
  POSTGRES_INT_MAX,
} from '../src/constants';
import {
  CheckoutConflictDetailsSchema,
  CheckoutKeyReusedDetailsSchema,
  CheckoutLineConflictDetailsSchema,
  CheckoutSchema,
  CreateCheckoutRequestSchema,
} from '../src/checkout';

const line = (productId: string) => ({ productId, quantity: 1, unitPriceMinor: 100 });

describe('CreateCheckoutRequestSchema (SRS-FR-CHK-001, §7)', () => {
  it('accepts the confirmed lines', () => {
    expect(CreateCheckoutRequestSchema.parse({ lines: [line('a')] })).toEqual({ lines: [line('a')] });
  });
  it('refuses no lines and more than 50', () => {
    expect(CreateCheckoutRequestSchema.safeParse({ lines: [] }).success).toBe(false);
    const many = Array.from({ length: CHECKOUT_MAX_LINES + 1 }, (_, i) => line(`p${i}`));
    expect(CreateCheckoutRequestSchema.safeParse({ lines: many }).success).toBe(false);
  });
  it('refuses the same product twice', () => {
    expect(CreateCheckoutRequestSchema.safeParse({ lines: [line('a'), line('a')] }).success).toBe(false);
  });
  it('refuses a total the database cannot store', () => {
    // The columns are INTEGER, the price may be up to POSTGRES_INT_MAX and quantity up
    // to 10, so a line total can exceed the column by an order of magnitude. Refusing
    // it here is a 400 before the transaction; the service cannot fix it later because
    // it stores the same arithmetic.
    const overflowing = { productId: 'a', quantity: 2, unitPriceMinor: POSTGRES_INT_MAX };
    expect(CreateCheckoutRequestSchema.safeParse({ lines: [overflowing] }).success).toBe(false);

    const exactlyFits = { productId: 'a', quantity: 1, unitPriceMinor: POSTGRES_INT_MAX };
    expect(CreateCheckoutRequestSchema.safeParse({ lines: [exactlyFits] }).success).toBe(true);
  });
  it('refuses a total that only overflows across lines', () => {
    const half = Math.floor(POSTGRES_INT_MAX / 2) + 1;
    const lines = [1, 2].map((n) => ({ productId: `p${n}`, quantity: 1, unitPriceMinor: half }));

    expect(CreateCheckoutRequestSchema.safeParse({ lines }).success).toBe(false);
  });
  it.each([
    { quantity: 11 },
    { quantity: 0 },
    { unitPriceMinor: 0 },
    { unitPriceMinor: 99.5 },
  ])('refuses a line with %o', (override) => {
    expect(CreateCheckoutRequestSchema.safeParse({ lines: [{ ...line('a'), ...override }] }).success).toBe(false);
  });
});

describe('CheckoutSchema', () => {
  it('is one checkout of one order per seller, with snapshotted items', () => {
    const checkout = {
      id: 'k1',
      status: CheckoutStatuses.PENDING_PAYMENT,
      totalMinor: 43_800,
      currency: CurrencyCodes.EGP,
      placedAt: '2026-10-16T10:00:00.000Z',
      orders: [
        {
          id: 'o1',
          status: OrderStatuses.PENDING_PAYMENT,
          totalMinor: 24_900,
          currency: CurrencyCodes.EGP,
          seller: { name: 'Nile', slug: 'nile' },
          items: [{ productId: 'p1', name: 'Shirt', quantity: 1, unitPriceMinor: 24_900 }],
        },
      ],
    };
    expect(CheckoutSchema.parse(checkout)).toEqual(checkout);
  });
});

describe('the 409 details (SRS-FR-CHK-003, -006, §8)', () => {
  it('lists failing lines with reason, stock and current price', () => {
    const details = {
      lines: [{ productId: 'p1', reason: CheckoutConflictReasons.SOLD_OUT, available: 0, currentUnitPriceMinor: 100 }],
    };
    expect(CheckoutLineConflictDetailsSchema.parse(details)).toEqual(details);
    expect(CheckoutConflictDetailsSchema.parse(details)).toEqual(details);
  });
  it('names a changed cart', () => {
    expect(CheckoutConflictDetailsSchema.parse({ reason: CheckoutRefusals.CART_CHANGED })).toEqual({
      reason: CheckoutRefusals.CART_CHANGED,
    });
  });
  it('names a key that was already used for a different body (ADR 003)', () => {
    const details = { reason: CheckoutRefusals.KEY_REUSED };
    expect(CheckoutKeyReusedDetailsSchema.parse(details)).toEqual(details);
    expect(CheckoutConflictDetailsSchema.parse(details)).toEqual(details);
  });
  it('refuses an empty line list, an unknown reason and extra keys beside KEY_REUSED', () => {
    expect(CheckoutLineConflictDetailsSchema.safeParse({ lines: [] }).success).toBe(false);
    expect(CheckoutConflictDetailsSchema.safeParse({ reason: 'NOPE' }).success).toBe(false);
    expect(
      CheckoutConflictDetailsSchema.safeParse({ reason: CheckoutRefusals.KEY_REUSED, extra: 1 }).success,
    ).toBe(false);
  });
});
