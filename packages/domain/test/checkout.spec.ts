import { describe, expect, it } from 'vitest';
import { CartLineAvailabilities, CheckoutConflictReasons, CurrencyCodes } from '@app/contracts';
import {
  byLockOrder,
  cartLineAvailability,
  evaluateCheckoutLines,
  groupBySeller,
  sameLines,
  singleCurrency,
  sumLineTotals,
} from '../src/checkout';
import type { LockedLineState } from '../src/checkout';

const state = (lines: LockedLineState[]) => new Map(lines.map((line) => [line.productId, line]));
const open = (productId: string, available: number, currentUnitPriceMinor: number) => ({
  productId,
  purchasable: true,
  available,
  currentUnitPriceMinor,
});

describe('cartLineAvailability (SRS-FR-CART-005, -007)', () => {
  it('is OK when stock covers the quantity', () => {
    expect(cartLineAvailability(2, 2, true)).toBe(CartLineAvailabilities.OK);
  });
  it('is SHORT when stock is below the quantity but above zero', () => {
    expect(cartLineAvailability(2, 1, true)).toBe(CartLineAvailabilities.SHORT);
  });
  it('is SOLD_OUT at zero', () => {
    expect(cartLineAvailability(1, 0, true)).toBe(CartLineAvailabilities.SOLD_OUT);
  });
  it('is SOLD_OUT for a product that stopped being purchasable, whatever its stock', () => {
    expect(cartLineAvailability(1, 50, false)).toBe(CartLineAvailabilities.SOLD_OUT);
  });
});

describe('evaluateCheckoutLines (SRS-FR-CHK-003)', () => {
  it('passes lines that are purchasable, covered and still at the confirmed price', () => {
    const lines = [{ productId: 'a', quantity: 2, unitPriceMinor: 500 }];
    expect(evaluateCheckoutLines(lines, state([open('a', 2, 500)]))).toEqual([]);
  });

  it('reports every failing line, not only the first', () => {
    const lines = [
      { productId: 'a', quantity: 1, unitPriceMinor: 500 },
      { productId: 'b', quantity: 3, unitPriceMinor: 700 },
      { productId: 'c', quantity: 1, unitPriceMinor: 900 },
    ];
    const conflicts = evaluateCheckoutLines(
      lines,
      state([open('a', 0, 500), open('b', 2, 700), open('c', 5, 950)]),
    );

    expect(conflicts).toEqual([
      { productId: 'a', reason: CheckoutConflictReasons.SOLD_OUT, available: 0, currentUnitPriceMinor: 500 },
      { productId: 'b', reason: CheckoutConflictReasons.SHORT, available: 2, currentUnitPriceMinor: 700 },
      { productId: 'c', reason: CheckoutConflictReasons.PRICE_CHANGED, available: 5, currentUnitPriceMinor: 950 },
    ]);
  });

  it('reports one reason per line, SHORT before PRICE_CHANGED (D85)', () => {
    const conflicts = evaluateCheckoutLines(
      [{ productId: 'a', quantity: 3, unitPriceMinor: 500 }],
      state([open('a', 1, 600)]),
    );
    expect(conflicts).toEqual([
      { productId: 'a', reason: CheckoutConflictReasons.SHORT, available: 1, currentUnitPriceMinor: 600 },
    ]);
  });

  it('masks a product that is no longer public (D86)', () => {
    const conflicts = evaluateCheckoutLines(
      [{ productId: 'a', quantity: 1, unitPriceMinor: 500 }],
      state([{ productId: 'a', purchasable: false, available: 9, currentUnitPriceMinor: 400 }]),
    );
    expect(conflicts).toEqual([
      { productId: 'a', reason: CheckoutConflictReasons.SOLD_OUT, available: 0, currentUnitPriceMinor: null },
    ]);
  });

  it('treats a product it has no state for as sold out, never as purchasable', () => {
    const conflicts = evaluateCheckoutLines(
      [{ productId: 'ghost', quantity: 1, unitPriceMinor: 500 }],
      state([]),
    );
    expect(conflicts[0]).toMatchObject({ productId: 'ghost', reason: CheckoutConflictReasons.SOLD_OUT });
  });
});

describe('singleCurrency (RULE-CHK-001, D71)', () => {
  it('names the one currency every line shares', () => {
    expect(singleCurrency([CurrencyCodes.EGP, CurrencyCodes.EGP])).toBe(CurrencyCodes.EGP);
  });
  it('is null for a mixed set', () => {
    expect(singleCurrency([CurrencyCodes.EGP, CurrencyCodes.USD])).toBeNull();
  });
  it('is null for nothing at all', () => {
    expect(singleCurrency([])).toBeNull();
  });
});

describe('sameLines (SRS-FR-CHK-006)', () => {
  it('ignores order', () => {
    expect(
      sameLines(
        [{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 2 }],
        [{ productId: 'b', quantity: 2 }, { productId: 'a', quantity: 1 }],
      ),
    ).toBe(true);
  });
  it('refuses a different quantity, a missing line and an extra line', () => {
    const cart = [{ productId: 'a', quantity: 1 }];
    expect(sameLines(cart, [{ productId: 'a', quantity: 2 }])).toBe(false);
    expect(sameLines(cart, [])).toBe(false);
    expect(sameLines(cart, [...cart, { productId: 'b', quantity: 1 }])).toBe(false);
  });
});

describe('groupBySeller (SRS-FR-CART-006, D56)', () => {
  it('keeps first-seen seller order and every line in exactly one group', () => {
    const groups = groupBySeller([
      { sellerId: 's2', productId: 'x' },
      { sellerId: 's1', productId: 'y' },
      { sellerId: 's2', productId: 'z' },
    ]);
    expect(groups.map((group) => [group.sellerId, group.lines.map((line) => line.productId)])).toEqual([
      ['s2', ['x', 'z']],
      ['s1', ['y']],
    ]);
  });
});

describe('sumLineTotals', () => {
  it('sums quantity × unit price in integers', () => {
    expect(sumLineTotals([{ quantity: 2, unitPriceMinor: 24_900 }, { quantity: 1, unitPriceMinor: 18_900 }])).toBe(68_700);
  });
});

describe('byLockOrder (RULE-CHK-002)', () => {
  it('orders ids bytewise, the order Postgres uses under COLLATE "C"', () => {
    // Every inventory lock in the API and the worker is taken in this order, so two
    // transactions that need the same rows can never each hold one the other wants.
    expect(['b', 'A', 'a', '1'].sort(byLockOrder)).toEqual(['1', 'A', 'a', 'b']);
  });
});
