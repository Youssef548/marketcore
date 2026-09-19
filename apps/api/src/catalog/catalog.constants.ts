import { ProductTransitionOutcomes, type ProductTransitionOutcome } from '@app/domain';

/** Human-facing message for a miss. Clients branch on `code`, never on this. */
export const ProductMessages = {
  NOT_FOUND: 'Product not found',
} as const;

/**
 * One message per refused transition, keyed by the domain's outcome enum. A
 * mapping rather than a conditional chain, so adding an outcome is one line and
 * the compiler reports the omission until it is added.
 */
export const ProductTransitionMessages: Record<
  Exclude<ProductTransitionOutcome, typeof ProductTransitionOutcomes.ALLOWED>,
  string
> = {
  [ProductTransitionOutcomes.ILLEGAL_TRANSITION]:
    'That transition is not legal from the current state',
  [ProductTransitionOutcomes.UNPUBLISHABLE]:
    'A product needs a price greater than zero to be published',
};
