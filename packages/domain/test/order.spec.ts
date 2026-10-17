import { describe, expect, it } from 'vitest';
import { CheckoutStatuses, OrderStatuses, wireValues } from '@app/contracts';
import {
  StatusTransitionOutcomes,
  planCheckoutTransition,
  planOrderTransition,
} from '../src/order';

describe('planOrderTransition', () => {
  it('allows the auto-cancel move, PENDING_PAYMENT → CANCELLED', () => {
    expect(planOrderTransition(OrderStatuses.PENDING_PAYMENT, OrderStatuses.CANCELLED)).toBe(
      StatusTransitionOutcomes.ALLOWED,
    );
  });

  it('refuses every other pair, including CANCELLED → anything', () => {
    // The illegal table is the negative space of the legal one, so it is asserted
    // over every pair rather than over the pairs someone remembered.
    for (const from of wireValues(OrderStatuses)) {
      for (const to of wireValues(OrderStatuses)) {
        if (from === OrderStatuses.PENDING_PAYMENT && to === OrderStatuses.CANCELLED) continue;
        expect({ from, to, outcome: planOrderTransition(from, to) }).toEqual({
          from,
          to,
          outcome: StatusTransitionOutcomes.ILLEGAL_TRANSITION,
        });
      }
    }
  });
});

describe('planCheckoutTransition', () => {
  it('moves with its orders: the same single legal edge', () => {
    for (const from of wireValues(CheckoutStatuses)) {
      for (const to of wireValues(CheckoutStatuses)) {
        const legal = from === CheckoutStatuses.PENDING_PAYMENT && to === CheckoutStatuses.CANCELLED;
        expect(planCheckoutTransition(from, to)).toBe(
          legal ? StatusTransitionOutcomes.ALLOWED : StatusTransitionOutcomes.ILLEGAL_TRANSITION,
        );
      }
    }
  });
});
