import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Cart } from '@app/contracts';
import { CartView } from './cart-view';

const line = (overrides: Partial<Cart['sellers'][number]['lines'][number]> = {}) => ({
  productId: 'p1',
  name: 'Shirt',
  quantity: 2,
  currency: 'EGP' as const,
  addedUnitPriceMinor: 24_900,
  currentUnitPriceMinor: 24_900,
  available: 5,
  availability: 'OK' as const,
  ...overrides,
});

const cart = (lines: ReturnType<typeof line>[][]): Cart => ({
  sellers: lines.map((group, i) => ({ seller: { name: `Seller ${i}`, slug: `s${i}` }, lines: group })),
});

const noop = { onQuantity: vi.fn(), onRemove: vi.fn() };

describe('CartView (Stitch 056)', () => {
  it('groups lines under each seller (AC-US-CART-001-1)', () => {
    render(<CartView cart={cart([[line()], [line({ productId: 'p2', name: 'Oil' })]])} conflict={false} {...noop} />);
    expect(screen.getAllByRole('region').map((region) => within(region).getByRole('heading').textContent)).toEqual([
      'Seller 0',
      'Seller 1',
    ]);
  });

  it('flags "Only 1 left" (AC-US-CART-002-1) and "Sold out"', () => {
    render(
      <CartView
        cart={cart([[line({ availability: 'SHORT', available: 1 }), line({ productId: 'p2', availability: 'SOLD_OUT', available: 0, currentUnitPriceMinor: null })]])}
        conflict={false}
        {...noop}
      />,
    );
    expect(screen.getByText('Only 1 left')).toBeTruthy();
    expect(screen.getByText('Sold out')).toBeTruthy();
  });

  it('shows the old and the new price when it moved (D82)', () => {
    render(<CartView cart={cart([[line({ currentUnitPriceMinor: 26_000 })]])} conflict={false} {...noop} />);
    expect(screen.getByText(/249\.00/)).toBeTruthy();
    expect(screen.getByText(/260\.00/)).toBeTruthy();
  });

  it('explains why the buyer is back after a refused checkout (D59)', () => {
    render(<CartView cart={cart([[line({ availability: 'SOLD_OUT', available: 0, currentUnitPriceMinor: null })]])} conflict {...noop} />);
    expect(screen.getByRole('alert').textContent).toMatch(/changed/i);
  });

  it('changes a quantity and removes a line', () => {
    const onQuantity = vi.fn();
    const onRemove = vi.fn();
    render(<CartView cart={cart([[line()]])} conflict={false} onQuantity={onQuantity} onRemove={onRemove} />);

    fireEvent.change(screen.getByLabelText('Quantity of Shirt'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Shirt' }));
    expect(onQuantity).toHaveBeenCalledWith('p1', 3);
    expect(onRemove).toHaveBeenCalledWith('p1');
  });

  it('links to the review step only when there is something to review', () => {
    const { rerender } = render(<CartView cart={cart([[line()]])} conflict={false} {...noop} />);
    expect(screen.getByRole('link', { name: 'Review order' }).getAttribute('href')).toBe('/checkout');

    rerender(<CartView cart={{ sellers: [] }} conflict={false} {...noop} />);
    expect(screen.queryByRole('link', { name: 'Review order' })).toBeNull();
    expect(screen.getByText(/your cart is empty/i)).toBeTruthy();
  });
});
