import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderView } from './order-view';

describe('OrderView (Stitch 003, PRD-FR-BORD-002)', () => {
  it('shows items, unit prices, total, seller, status and the checkout', () => {
    render(
      <OrderView
        order={{
          id: 'o1',
          checkoutId: 'k-123',
          status: 'CANCELLED',
          totalMinor: 37_800,
          currency: 'EGP',
          createdAt: '2026-10-16T10:00:00.000Z',
          seller: { name: 'Delta Goods', slug: 'delta-goods' },
          items: [{ productId: 'p1', name: 'Delta Olive Oil', quantity: 2, unitPriceMinor: 18_900 }],
        }}
      />,
    );

    expect(screen.getByText('Delta Goods')).toBeTruthy();
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.getByText(/2 × Delta Olive Oil/)).toBeTruthy();
    expect(screen.getByText(/189\.00/)).toBeTruthy();
    expect(screen.getByText(/378\.00/)).toBeTruthy();
    expect(screen.getByText(/k-123/)).toBeTruthy();
  });
});
