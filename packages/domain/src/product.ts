import { ProductStatuses, type ProductStatus } from '@app/contracts';
import { ProductTransitionOutcomes, type ProductTransitionOutcome } from './product.interface';

/** The outcome vocabulary ships with its rule, so callers import from one module. */
export * from './product.interface';

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
  // Nothing is sold at zero, so a zero price is not a publishable product.
  if (to === ProductStatuses.PUBLISHED && priceMinor <= 0) {
    return ProductTransitionOutcomes.UNPUBLISHABLE;
  }
  return ProductTransitionOutcomes.ALLOWED;
}
