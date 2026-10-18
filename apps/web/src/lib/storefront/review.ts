import { CartLineAvailabilities, type Cart } from '@app/contracts';
import { lineAvailabilityLabel } from './availability';
import type { Review } from './interfaces/review.interface';

export type { PriceChange, Review, StockProblem } from './interfaces/review.interface';

/** Everything the review step shows and posts, derived from the live cart (D60). */
export function reviewCart(cart: Cart): Review {
  const lines = cart.sellers.flatMap((group) => group.lines);
  const currencies = new Set(lines.map((line) => line.currency));

  const priceChanges = lines.flatMap((line) =>
    line.currentUnitPriceMinor !== null && line.currentUnitPriceMinor !== line.addedUnitPriceMinor
      ? [{ productId: line.productId, name: line.name, fromMinor: line.addedUnitPriceMinor, toMinor: line.currentUnitPriceMinor, currency: line.currency }]
      : [],
  );
  const stockProblems = lines.flatMap((line) => {
    const label = lineAvailabilityLabel(line);
    return line.availability !== CartLineAvailabilities.OK && label !== null
      ? [{ productId: line.productId, name: line.name, label }]
      : [];
  });
  const confirmedLines = lines.flatMap((line) =>
    line.currentUnitPriceMinor === null
      ? []
      : [{ productId: line.productId, quantity: line.quantity, unitPriceMinor: line.currentUnitPriceMinor }],
  );

  return {
    lines,
    priceChanges,
    stockProblems,
    mixedCurrency: currencies.size > 1,
    currency: currencies.size === 1 ? [...currencies][0] : null,
    totalMinor: confirmedLines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0),
    confirmedLines,
  };
}

export function canPlaceOrder(review: Review, priceChangesAccepted: boolean): boolean {
  return (
    review.lines.length > 0 &&
    !review.mixedCurrency &&
    review.stockProblems.length === 0 &&
    (review.priceChanges.length === 0 || priceChangesAccepted)
  );
}
