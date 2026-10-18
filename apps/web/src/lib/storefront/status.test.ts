import { describe, expect, it } from 'vitest';
import { OrderStatuses, wireValues } from '@app/contracts';
import { statusLabel } from './status';

const EXPECTED: Record<(typeof OrderStatuses)[keyof typeof OrderStatuses], string> = {
  [OrderStatuses.PENDING_PAYMENT]: 'Pending payment',
  [OrderStatuses.PAID]: 'Paid',
  [OrderStatuses.CANCELLED]: 'Cancelled',
};

describe('statusLabel', () => {
  it('names every order state, so a new one fails here first', () => {
    expect(wireValues(OrderStatuses).map(statusLabel)).toEqual(
      wireValues(OrderStatuses).map((status) => EXPECTED[status]),
    );
  });
});
