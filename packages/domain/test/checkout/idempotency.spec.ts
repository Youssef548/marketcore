import { describe, expect, it } from 'vitest';
import { byLockOrder } from '../../src/checkout/checkout';
import { checkoutRequestFingerprint } from '../../src/checkout/idempotency';
import type { CheckoutLineRequest } from '@app/contracts';

const line = (productId: string, quantity = 1, unitPriceMinor = 100): CheckoutLineRequest => ({
  productId,
  quantity,
  unitPriceMinor,
});

describe('checkoutRequestFingerprint (D96)', () => {
  it('is the same request when only the line order differs', () => {
    const confirmed = [line('a'), line('b'), line('c')];
    expect(checkoutRequestFingerprint([...confirmed].reverse())).toBe(
      checkoutRequestFingerprint(confirmed),
    );
    expect(checkoutRequestFingerprint([confirmed[1]!, confirmed[2]!, confirmed[0]!])).toBe(
      checkoutRequestFingerprint(confirmed),
    );
  });

  it('orders the lines bytewise, not by the machine’s locale', () => {
    expect(checkoutRequestFingerprint([line('B'), line('a')])).toBe(
      checkoutRequestFingerprint([line('a'), line('B')]),
    );
    const [first, second] = JSON.parse(checkoutRequestFingerprint([line('B'), line('a')])).lines;
    expect(byLockOrder(first.productId, second.productId)).toBeLessThan(0);
  });

  it.each([
    ['a changed quantity', [line('a', 2)]],
    ['a changed price', [line('a', 1, 101)]],
    ['a different product', [line('b')]],
    ['a missing line', []],
    ['an extra line', [line('a'), line('z')]],
  ])('is a different request for %s', (_label, other) => {
    expect(checkoutRequestFingerprint(other)).not.toBe(
      checkoutRequestFingerprint([line('a')]),
    );
  });

  it('is the empty request for no lines', () => {
    expect(checkoutRequestFingerprint([])).toBe('{"lines":[]}');
  });

  it('is stable across calls and carries exactly the three wire fields', () => {
    const confirmed = [line('b', 2, 300), line('a', 1, 100)];
    const fingerprint = checkoutRequestFingerprint(confirmed);
    expect(checkoutRequestFingerprint(confirmed)).toBe(fingerprint);
    expect(JSON.parse(fingerprint)).toEqual({
      lines: [
        { productId: 'a', quantity: 1, unitPriceMinor: 100 },
        { productId: 'b', quantity: 2, unitPriceMinor: 300 },
      ],
    });
  });

  it('does not mutate the lines it was given', () => {
    const confirmed = [line('b'), line('a')];
    checkoutRequestFingerprint(confirmed);
    expect(confirmed.map((entry) => entry.productId)).toEqual(['b', 'a']);
  });
});
