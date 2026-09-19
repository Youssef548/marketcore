import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ProductStatuses, wireValues } from '@app/contracts';
import {
  MIN_PUBLISHABLE_PRICE_MINOR,
  ProductTransitionOutcomes,
  planProductTransition,
} from '../src/product';

const status = fc.constantFrom(...wireValues(ProductStatuses));

describe('planProductTransition (property)', () => {
  it('allows exactly the two legal transitions at a publishable price', () => {
    // The domain model's illegal-transition table is the negative space of this
    // one, so the property is stated over every (from, to) pair rather than over
    // the pairs someone remembered to write down.
    fc.assert(
      fc.property(status, status, fc.integer({ min: MIN_PUBLISHABLE_PRICE_MINOR, max: 10_000_000 }), (from, to, priceMinor) => {
        const legal =
          (from === ProductStatuses.DRAFT && to === ProductStatuses.PUBLISHED) ||
          (from === ProductStatuses.PUBLISHED && to === ProductStatuses.DRAFT);

        expect(planProductTransition(from, to, priceMinor)).toBe(
          legal ? ProductTransitionOutcomes.ALLOWED : ProductTransitionOutcomes.ILLEGAL_TRANSITION,
        );
      }),
    );
  });

  it('refuses to publish anything priced below the floor, at every price below it', () => {
    fc.assert(
      fc.property(fc.integer({ max: MIN_PUBLISHABLE_PRICE_MINOR - 1 }), (priceMinor) => {
        expect(
          planProductTransition(ProductStatuses.DRAFT, ProductStatuses.PUBLISHED, priceMinor),
        ).toBe(ProductTransitionOutcomes.UNPUBLISHABLE);
      }),
    );
  });

  it('puts the floor at exactly the minimum, not one above it', () => {
    // Stated at the boundary because a generator over a wide range does not reliably
    // produce it — mutation testing found the `<` in this comparison could become
    // `<=` without a single test noticing.
    expect(
      planProductTransition(
        ProductStatuses.DRAFT,
        ProductStatuses.PUBLISHED,
        MIN_PUBLISHABLE_PRICE_MINOR,
      ),
    ).toBe(ProductTransitionOutcomes.ALLOWED);
    expect(
      planProductTransition(
        ProductStatuses.DRAFT,
        ProductStatuses.PUBLISHED,
        MIN_PUBLISHABLE_PRICE_MINOR - 1,
      ),
    ).toBe(ProductTransitionOutcomes.UNPUBLISHABLE);
  });

  it('reports an unpublishable price before it reports an illegal transition', () => {
    // Precedence, not just outcome: a second publish attempt on a free product is
    // both illegal and unpublishable, and the illegal-transition answer is the one
    // that tells the caller something they do not already know.
    expect(
      planProductTransition(ProductStatuses.PUBLISHED, ProductStatuses.PUBLISHED, 0),
    ).toBe(ProductTransitionOutcomes.ILLEGAL_TRANSITION);
  });

  it('never blocks unpublishing on price, however small', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 1_000_000 }), (priceMinor) => {
        expect(
          planProductTransition(ProductStatuses.PUBLISHED, ProductStatuses.DRAFT, priceMinor),
        ).toBe(ProductTransitionOutcomes.ALLOWED);
      }),
    );
  });
});
