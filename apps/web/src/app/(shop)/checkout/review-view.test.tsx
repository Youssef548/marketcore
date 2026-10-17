import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Cart } from '@app/contracts';
import { ReviewView } from './review-view';

const cart = (current: number, currency: 'EGP' | 'USD' = 'EGP'): Cart => ({
  sellers: [
    {
      seller: { name: 'Nile', slug: 'nile' },
      lines: [
        { productId: 'p1', name: 'Shirt', quantity: 1, currency: 'EGP', addedUnitPriceMinor: 24_900, currentUnitPriceMinor: current, available: 5, availability: 'OK' },
      ],
    },
    {
      seller: { name: 'Delta', slug: 'delta' },
      lines: [
        { productId: 'p2', name: 'Oil', quantity: 1, currency, addedUnitPriceMinor: 18_900, currentUnitPriceMinor: 18_900, available: 5, availability: 'OK' },
      ],
    },
  ],
});

const placeButton = () => screen.getByRole('button', { name: 'Place order' }) as HTMLButtonElement;

describe('ReviewView (Stitch 028)', () => {
  it('shows the old and new price and keeps "Place order" disabled until confirmed (AC-US-CHK-001-1)', () => {
    const onPlace = vi.fn();
    render(<ReviewView cart={cart(26_000)} notice={null} placing={false} onPlace={onPlace} />);

    // The old price appears once (struck through); the new one in the change list and on the line.
    expect(screen.getAllByText(/249\.00/)).toHaveLength(1);
    expect(screen.getAllByText(/260\.00/).length).toBeGreaterThanOrEqual(1);
    expect(placeButton().disabled).toBe(true);

    fireEvent.click(screen.getByLabelText(/accept the new prices/i));
    expect(placeButton().disabled).toBe(false);
    fireEvent.click(placeButton());
    expect(onPlace).toHaveBeenCalledWith([
      { productId: 'p1', quantity: 1, unitPriceMinor: 26_000 },
      { productId: 'p2', quantity: 1, unitPriceMinor: 18_900 },
    ]);
  });

  it('disables "Place order" with a message for a mixed-currency cart (AC-US-CHK-002-5)', () => {
    render(<ReviewView cart={cart(24_900, 'USD')} notice={null} placing={false} onPlace={vi.fn()} />);
    expect(screen.getByText(/one currency/i)).toBeTruthy();
    expect(placeButton().disabled).toBe(true);
  });

  it('says payment is not collected yet and when an unpaid order is cancelled (D62, D70)', () => {
    render(<ReviewView cart={cart(24_900)} notice={null} placing={false} onPlace={vi.fn()} />);
    expect(screen.getByText(/payment is not collected yet/i).textContent).toMatch(/30 minutes/);
  });
});
