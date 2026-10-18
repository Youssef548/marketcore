import { OrderStatuses, type OrderStatus } from '@app/contracts';

/** A mapping, not a conditional, so a new state is a compile error here (Record exhaustiveness). */
const LABELS: Record<OrderStatus, string> = {
  [OrderStatuses.PENDING_PAYMENT]: 'Pending payment',
  [OrderStatuses.PAID]: 'Paid',
  [OrderStatuses.CANCELLED]: 'Cancelled',
};

export function statusLabel(status: OrderStatus): string {
  return LABELS[status];
}
