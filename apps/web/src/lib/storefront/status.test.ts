import { describe, expect, it } from 'vitest';
import { OrderStatuses, wireValues } from '@app/contracts';
import { statusLabel } from './status';

describe('statusLabel', () => {
  it('names every order state, so a new one fails here first', () => {
    expect(wireValues(OrderStatuses).map(statusLabel)).toEqual(
      wireValues(OrderStatuses).map((status) => (status === 'PENDING_PAYMENT' ? 'Pending payment' : 'Cancelled')),
    );
  });
});
