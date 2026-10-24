import {
  CartLineAvailabilities,
  CheckoutConflictReasons,
  type CartLineAvailability,
} from '@app/contracts';
import type {
  ConfirmedLine,
  LineConflict,
  LineQuantity,
  LockedLineState,
  SellerGroup,
} from './checkout.interface';

export * from './checkout.interface';

export function cartLineAvailability(
  quantity: number,
  available: number,
  purchasable: boolean,
): CartLineAvailability {
  if (!purchasable || available === 0) return CartLineAvailabilities.SOLD_OUT;
  if (available < quantity) return CartLineAvailabilities.SHORT;
  return CartLineAvailabilities.OK;
}

/**
 * The all-or-nothing decision (INV-11), as a pure function of what the
 * transaction read under lock. It returns every failing line (SRS-FR-CHK-003),
 * one reason each in D85's order, and masks non-public products (D86).
 */
export function evaluateCheckoutLines(
  confirmed: readonly ConfirmedLine[],
  state: ReadonlyMap<string, LockedLineState>,
): LineConflict[] {
  const conflicts: LineConflict[] = [];

  for (const line of confirmed) {
    const current = state.get(line.productId);
    if (current === undefined || !current.purchasable) {
      conflicts.push({
        productId: line.productId,
        reason: CheckoutConflictReasons.SOLD_OUT,
        available: 0,
        currentUnitPriceMinor: null,
      });
      continue;
    }

    const availability = cartLineAvailability(line.quantity, current.available, true);
    const reason =
      availability === CartLineAvailabilities.SOLD_OUT
        ? CheckoutConflictReasons.SOLD_OUT
        : availability === CartLineAvailabilities.SHORT
          ? CheckoutConflictReasons.SHORT
          : current.currentUnitPriceMinor !== line.unitPriceMinor
            ? CheckoutConflictReasons.PRICE_CHANGED
            : null;

    if (reason !== null) {
      conflicts.push({
        productId: line.productId,
        reason,
        available: current.available,
        currentUnitPriceMinor: current.currentUnitPriceMinor,
      });
    }
  }

  return conflicts;
}

/** The one currency every entry shares, or null when mixed or empty (D71). */
export function singleCurrency<C extends string>(currencies: readonly C[]): C | null {
  const [first, ...rest] = currencies;
  if (first === undefined) return null;
  return rest.every((currency) => currency === first) ? first : null;
}

/** Same products with the same quantities, in any order (SRS-FR-CHK-006). */
export function sameLines(cart: readonly LineQuantity[], requested: readonly LineQuantity[]): boolean {
  if (cart.length !== requested.length) return false;
  const wanted = new Map(cart.map((line) => [line.productId, line.quantity]));
  return requested.every((line) => wanted.get(line.productId) === line.quantity);
}

/** One group per seller, in first-seen order — one order per group (D56). */
export function groupBySeller<T extends { sellerId: string }>(lines: readonly T[]): SellerGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const line of lines) {
    const group = groups.get(line.sellerId);
    if (group === undefined) groups.set(line.sellerId, [line]);
    else group.push(line);
  }
  return [...groups].map(([sellerId, grouped]) => ({ sellerId, lines: grouped }));
}

export function sumLineTotals(lines: readonly { quantity: number; unitPriceMinor: number }[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
}

/**
 * The inventory lock order (RULE-CHK-002): bytewise, matching the SQL
 * `ORDER BY "productId" COLLATE "C"` both processes lock with. Not
 * `localeCompare`, whose order depends on the machine's locale.
 */
export function byLockOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
