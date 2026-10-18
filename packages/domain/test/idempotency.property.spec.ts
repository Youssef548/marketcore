import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { checkoutRequestFingerprint } from '../src/idempotency';

const linesOf = (lines: readonly { productId: string; quantity: number; unitPriceMinor: number }[]) =>
  lines as unknown as Parameters<typeof checkoutRequestFingerprint>[0];

const aLine = fc.record({
  productId: fc.string({ minLength: 1, maxLength: 8 }),
  quantity: fc.integer({ min: 1, max: 10 }),
  unitPriceMinor: fc.integer({ min: 1, max: 1_000_000 }),
});

describe('checkoutRequestFingerprint properties (D96)', () => {
  it('is invariant under any permutation of the lines', () => {
    fc.assert(
      fc.property(fc.array(aLine, { maxLength: 12 }), (lines) => {
        const shuffled = fc.sample(fc.shuffledSubarray(lines, { minLength: lines.length }), 1)[0]!;
        return checkoutRequestFingerprint(linesOf(shuffled)) === checkoutRequestFingerprint(linesOf(lines));
      }),
    );
  });

  it('always produces a JSON object with one entry per line and the three wire fields', () => {
    fc.assert(
      fc.property(fc.array(aLine, { maxLength: 12 }), (lines) => {
        const parsed = JSON.parse(checkoutRequestFingerprint(linesOf(lines))) as {
          lines: { productId: string; quantity: number; unitPriceMinor: number }[];
        };
        expect(parsed.lines).toHaveLength(lines.length);
        for (const entry of parsed.lines) {
          expect(Object.keys(entry).sort()).toEqual(['productId', 'quantity', 'unitPriceMinor']);
        }
      }),
    );
  });

  it('separates requests that differ in exactly one field of one line', () => {
    fc.assert(
      fc.property(aLine, aLine, (one, other) => {
        fc.pre(one.productId !== other.productId);
        return (
          checkoutRequestFingerprint(linesOf([one])) !==
          checkoutRequestFingerprint(linesOf([{ ...one, productId: other.productId }]))
        );
      }),
    );
  });
});
