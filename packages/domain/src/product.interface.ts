export const ProductTransitionOutcomes = {
  ALLOWED: 'ALLOWED',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  UNPUBLISHABLE: 'UNPUBLISHABLE',
} as const;
export type ProductTransitionOutcome =
  (typeof ProductTransitionOutcomes)[keyof typeof ProductTransitionOutcomes];
