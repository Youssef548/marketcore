export const StatusTransitionOutcomes = {
  ALLOWED: 'ALLOWED',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
} as const;
export type StatusTransitionOutcome =
  (typeof StatusTransitionOutcomes)[keyof typeof StatusTransitionOutcomes];
