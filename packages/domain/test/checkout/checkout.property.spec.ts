import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CART_LINE_MAX_QUANTITY, CheckoutConflictReasons } from '@app/contracts';
import { evaluateCheckoutLines, groupBySeller, sumLineTotals } from '../../src/checkout/checkout';

const line = fc.record({
  productId: fc.uuid(),
  quantity: fc.integer({ min: 1, max: CART_LINE_MAX_QUANTITY }),
  unitPriceMinor: fc.integer({ min: 1, max: 1_000_000 }),
  purchasable: fc.boolean(),
  available: fc.integer({ min: 0, max: 20 }),
  currentUnitPriceMinor: fc.integer({ min: 1, max: 1_000_000 }),
});

describe('evaluateCheckoutLines (property)', () => {
  it('is empty exactly when every line is purchasable, covered and unchanged in price', () => {
    fc.assert(
      fc.property(fc.uniqueArray(line, { selector: (l) => l.productId, minLength: 1, maxLength: 10 }), (lines) => {
        const state = new Map(lines.map((l) => [l.productId, l]));
        const conflicts = evaluateCheckoutLines(lines, state);
        const healthy = lines.every(
          (l) => l.purchasable && l.available >= l.quantity && l.available > 0 && l.currentUnitPriceMinor === l.unitPriceMinor,
        );

        expect(conflicts.length === 0).toBe(healthy);
        // At most one conflict per line, each naming a line that was asked for.
        expect(new Set(conflicts.map((c) => c.productId)).size).toBe(conflicts.length);
        for (const conflict of conflicts) {
          expect(lines.some((l) => l.productId === conflict.productId)).toBe(true);
          expect(Object.values(CheckoutConflictReasons)).toContain(conflict.reason);
        }
      }),
    );
  });
});

describe('groupBySeller + sumLineTotals (property)', () => {
  it('the checkout total is the sum of its seller orders (one order per seller)', () => {
    const pricedLine = fc.record({
      sellerId: fc.constantFrom('s1', 's2', 's3'),
      quantity: fc.integer({ min: 1, max: 10 }),
      unitPriceMinor: fc.integer({ min: 1, max: 1_000_000 }),
    });
    fc.assert(
      fc.property(fc.array(pricedLine, { minLength: 1, maxLength: 50 }), (lines) => {
        const groups = groupBySeller(lines);
        expect(new Set(groups.map((g) => g.sellerId)).size).toBe(groups.length);
        expect(groups.reduce((n, g) => n + g.lines.length, 0)).toBe(lines.length);
        expect(groups.reduce((sum, g) => sum + sumLineTotals(g.lines), 0)).toBe(sumLineTotals(lines));
      }),
    );
  });
});
