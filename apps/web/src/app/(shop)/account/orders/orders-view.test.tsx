import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrdersView } from './orders-view';

const order = (id: string, seller: string) => ({
  id,
  checkoutId: 'k1',
  status: 'PENDING_PAYMENT' as const,
  totalMinor: 24_900,
  currency: 'EGP' as const,
  createdAt: '2026-10-16T10:00:00.000Z',
  seller: { name: seller, slug: seller.toLowerCase() },
  itemCount: 1,
});

describe('OrdersView (Stitch 017)', () => {
  it('lists each order with seller, status, total and a link to its detail', () => {
    render(<OrdersView orders={[order('o1', 'Nile'), order('o2', 'Delta')]} hasMore={false} onMore={vi.fn()} />);

    expect(screen.getAllByText('Pending payment')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Nile/ }).getAttribute('href')).toBe('/account/orders/o1');
    expect(screen.getAllByText(/249\.00/)).toHaveLength(2);
  });

  it('says so when there are none', () => {
    render(<OrdersView orders={[]} hasMore={false} onMore={vi.fn()} />);
    expect(screen.getByText(/no orders yet/i)).toBeTruthy();
  });
});
