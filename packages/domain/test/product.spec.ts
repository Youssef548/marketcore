import { describe, expect, it } from 'vitest';
import { ProductStatuses } from '@app/contracts';
import { ProductTransitionOutcomes, planProductTransition } from '../src/product';

describe('planProductTransition', () => {
  it('allows publishing a priced draft', () => {
    expect(planProductTransition(ProductStatuses.DRAFT, ProductStatuses.PUBLISHED, 100)).toBe(
      ProductTransitionOutcomes.ALLOWED,
    );
  });

  it('refuses to publish an unpriced product', () => {
    expect(planProductTransition(ProductStatuses.DRAFT, ProductStatuses.PUBLISHED, 0)).toBe(
      ProductTransitionOutcomes.UNPUBLISHABLE,
    );
  });

  it('refuses a transition to the state it is already in', () => {
    expect(planProductTransition(ProductStatuses.PUBLISHED, ProductStatuses.PUBLISHED, 100)).toBe(
      ProductTransitionOutcomes.ILLEGAL_TRANSITION,
    );
  });

  it('allows unpublishing a published product regardless of price', () => {
    expect(planProductTransition(ProductStatuses.PUBLISHED, ProductStatuses.DRAFT, 0)).toBe(
      ProductTransitionOutcomes.ALLOWED,
    );
  });
});
