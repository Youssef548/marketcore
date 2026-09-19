import { ProductStatuses, type ProductStatus } from '@app/contracts';
import { ProductTransitionOutcomes, type ProductTransitionOutcome } from './product.interface';

/** The outcome vocabulary ships with its rule, so callers import from one module. */
export * from './product.interface';

/** A price below this cannot be published: nothing is sold for nothing. */
export const MIN_PUBLISHABLE_PRICE_MINOR = 1;

/**
 * The legal transitions, as a table. The domain model's illegal-transition table
 * is the negative space of this one, and a rejected transition is a test case
 * rather than a comment.
 */
const LEGAL_TRANSITIONS: Record<ProductStatus, readonly ProductStatus[]> = {
  [ProductStatuses.DRAFT]: [ProductStatuses.PUBLISHED],
  [ProductStatuses.PUBLISHED]: [ProductStatuses.DRAFT],
};

export function planProductTransition(
  from: ProductStatus,
  to: ProductStatus,
  priceMinor: number,
): ProductTransitionOutcome {
  if (!LEGAL_TRANSITIONS[from].includes(to)) {
    return ProductTransitionOutcomes.ILLEGAL_TRANSITION;
  }
  if (to === ProductStatuses.PUBLISHED && priceMinor < MIN_PUBLISHABLE_PRICE_MINOR) {
    return ProductTransitionOutcomes.UNPUBLISHABLE;
  }
  return ProductTransitionOutcomes.ALLOWED;
}
