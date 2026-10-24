import { describe, expect, it } from 'vitest';
import { CheckoutStatuses, OrderStatuses, wireValues } from '@app/contracts';
import {
  StatusTransitionOutcomes,
  planCheckoutTransition,
  planOrderTransition,
} from '../../src/checkout/order';

/**
 * The legal edges, and only these: the worker's auto-cancel (D70) and the capture (phase 6).
 * `PAID` is terminal here — nothing in this code moves a paid order anywhere, and the
 * domain model's `Paid → Fulfilling` belongs to fulfilment.
 */
const LEGAL_EDGES = [
  [OrderStatuses.PENDING_PAYMENT, OrderStatuses.PAID],
  [OrderStatuses.PENDING_PAYMENT, OrderStatuses.CANCELLED],
] as const;

const isLegal = (from: string, to: string): boolean =>
  LEGAL_EDGES.some(([legalFrom, legalTo]) => legalFrom === from && legalTo === to);

describe('planOrderTransition', () => {
  it('allows the capture and the auto-cancel moves', () => {
    expect(planOrderTransition(OrderStatuses.PENDING_PAYMENT, OrderStatuses.PAID)).toBe(
      StatusTransitionOutcomes.ALLOWED,
    );
    expect(planOrderTransition(OrderStatuses.PENDING_PAYMENT, OrderStatuses.CANCELLED)).toBe(
      StatusTransitionOutcomes.ALLOWED,
    );
  });

  it('refuses every other pair, including PAID → anything and CANCELLED → anything', () => {
    // The illegal table is the negative space of the legal one, so it is asserted
    // over every pair rather than over the pairs someone remembered.
    for (const from of wireValues(OrderStatuses)) {
      for (const to of wireValues(OrderStatuses)) {
        if (isLegal(from, to)) continue;
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
  it('moves with its orders: the same two legal edges', () => {
    for (const from of wireValues(CheckoutStatuses)) {
      for (const to of wireValues(CheckoutStatuses)) {
        expect(planCheckoutTransition(from, to)).toBe(
          isLegal(from, to) ? StatusTransitionOutcomes.ALLOWED : StatusTransitionOutcomes.ILLEGAL_TRANSITION,
        );
      }
    }
  });
});
