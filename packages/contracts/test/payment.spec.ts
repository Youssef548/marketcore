import { describe, expect, it } from 'vitest';
import {
  CheckoutRefusals,
  CheckoutStatuses,
  OrderStatuses,
  PaymentRefusals,
  PaymentStatuses,
} from '../src/constants';
import { CheckoutConflictDetailsSchema } from '../src/checkout';
import {
  CheckoutCancelledDetailsSchema,
  PaymentDeclinedDetailsSchema,
  PaymentPendingDetailsSchema,
} from '../src/payment';

describe('the payment wire vocabulary (SRS-FR-PAY-001…-004, D102, D106, D107)', () => {
  it('gives a checkout and its orders the PAID state the capture enters', () => {
    expect(CheckoutStatuses.PAID).toBe('PAID');
    expect(OrderStatuses.PAID).toBe('PAID');
    // Every order of a checkout moves with it (domain-model §5), so the sets stay equal.
    expect(Object.values(OrderStatuses).sort()).toEqual(Object.values(CheckoutStatuses).sort());
  });

  it('has no PENDING payment state, because the row is created by the attempt (D102)', () => {
    expect(Object.values(PaymentStatuses)).toEqual(['PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED']);
    expect(Object.keys(PaymentStatuses)).not.toContain('PENDING');
  });

  it('names the three payment refusals', () => {
    expect(PaymentRefusals.PAYMENT_DECLINED).toBe('PAYMENT_DECLINED');
    expect(PaymentRefusals.CHECKOUT_CANCELLED).toBe('CHECKOUT_CANCELLED');
    // D111: a charge the provider could not confirm is its own answer, because the buyer
    // must be told neither "declined" nor "paid".
    expect(PaymentRefusals.PAYMENT_PENDING).toBe('PAYMENT_PENDING');
  });

  it('keeps the checkout refusal separate from the payment ones', () => {
    expect(CheckoutRefusals).not.toHaveProperty('PAYMENT_DECLINED');
    expect(CheckoutRefusals).not.toHaveProperty('CHECKOUT_CANCELLED');
  });
});

describe('the payment refusal details (D106, D107)', () => {
  it('parses the decline and the cancelled-checkout reasons', () => {
    expect(PaymentDeclinedDetailsSchema.parse({ reason: 'PAYMENT_DECLINED' })).toEqual({
      reason: 'PAYMENT_DECLINED',
    });
    expect(CheckoutCancelledDetailsSchema.parse({ reason: 'CHECKOUT_CANCELLED' })).toEqual({
      reason: 'CHECKOUT_CANCELLED',
    });
    expect(PaymentPendingDetailsSchema.parse({ reason: 'PAYMENT_PENDING' })).toEqual({
      reason: 'PAYMENT_PENDING',
    });
  });

  it.each([
    ['an unknown reason', { reason: 'PAYMENT_FAILED' }],
    ['a missing reason', {}],
    ['an extra key', { reason: 'PAYMENT_DECLINED', detail: 'insufficient funds' }],
  ])('refuses %s', (_label, value) => {
    expect(PaymentDeclinedDetailsSchema.safeParse(value).success).toBe(false);
    expect(CheckoutCancelledDetailsSchema.safeParse(value).success).toBe(false);
  });

  it('joins the union, so a client branches on one schema and keeps the other three', () => {
    const members: unknown[] = [
      { lines: [{ productId: 'p1', reason: 'SOLD_OUT', available: 0, currentUnitPriceMinor: null }] },
      { reason: 'CART_CHANGED' },
      { reason: 'KEY_REUSED' },
      { reason: 'PAYMENT_DECLINED' },
      { reason: 'CHECKOUT_CANCELLED' },
      { reason: 'PAYMENT_PENDING' },
    ];
    for (const member of members) {
      expect(CheckoutConflictDetailsSchema.safeParse(member).success).toBe(true);
    }
    expect(CheckoutConflictDetailsSchema.safeParse({ reason: 'SOMETHING_ELSE' }).success).toBe(false);
  });
});
