import {
  CheckoutStatuses,
  OrderStatuses,
  type CheckoutStatus,
  type OrderStatus,
} from '@app/contracts';
import { StatusTransitionOutcomes, type StatusTransitionOutcome } from './order.interface';

export * from './order.interface';

/**
 * Legal moves, for both aggregates: phase 4's auto-cancel (D70) and phase 6's capture.
 *
 * `PAID` has no outgoing move yet. The domain model's `Paid → Fulfilling` arrives with
 * fulfilment, and this table grants only what this code can actually perform — a state a
 * table let you enter would be a state an endpoint could enter by accident.
 */
const CHECKOUT_TRANSITIONS: Record<CheckoutStatus, readonly CheckoutStatus[]> = {
  [CheckoutStatuses.PENDING_PAYMENT]: [CheckoutStatuses.PAID, CheckoutStatuses.CANCELLED],
  [CheckoutStatuses.PAID]: [],
  [CheckoutStatuses.CANCELLED]: [],
};

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatuses.PENDING_PAYMENT]: [OrderStatuses.PAID, OrderStatuses.CANCELLED],
  [OrderStatuses.PAID]: [],
  [OrderStatuses.CANCELLED]: [],
};

function plan<S extends string>(
  table: Record<S, readonly S[]>,
  from: S,
  to: S,
): StatusTransitionOutcome {
  return table[from].includes(to)
    ? StatusTransitionOutcomes.ALLOWED
    : StatusTransitionOutcomes.ILLEGAL_TRANSITION;
}

export function planCheckoutTransition(
  from: CheckoutStatus,
  to: CheckoutStatus,
): StatusTransitionOutcome {
  return plan(CHECKOUT_TRANSITIONS, from, to);
}

export function planOrderTransition(from: OrderStatus, to: OrderStatus): StatusTransitionOutcome {
  return plan(ORDER_TRANSITIONS, from, to);
}
