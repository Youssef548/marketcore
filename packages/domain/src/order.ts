import {
  CheckoutStatuses,
  OrderStatuses,
  type CheckoutStatus,
  type OrderStatus,
} from '@app/contracts';
import { StatusTransitionOutcomes, type StatusTransitionOutcome } from './order.interface';

export * from './order.interface';

/** Phase 4's one legal move, for both aggregates: auto-cancel (D70). */
const CHECKOUT_TRANSITIONS: Record<CheckoutStatus, readonly CheckoutStatus[]> = {
  [CheckoutStatuses.PENDING_PAYMENT]: [CheckoutStatuses.CANCELLED],
  [CheckoutStatuses.CANCELLED]: [],
};

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatuses.PENDING_PAYMENT]: [OrderStatuses.CANCELLED],
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
