import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Cart } from '@app/contracts';

const mocks = vi.hoisted(() => ({
  params: new Map<string, string>(),
  cart: vi.fn(),
  setLine: vi.fn(),
  removeLine: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => mocks.params.get(key) ?? null }),
}));

vi.mock('@/lib/storefront/client', () => ({
  storefront: { cart: mocks.cart, setLine: mocks.setLine, removeLine: mocks.removeLine },
}));

import CartPage from './page';

const loaded: Cart = {
  sellers: [
    {
      seller: { name: 'Nile Traders', slug: 'nile-traders' },
      lines: [
        {
          productId: 'p1',
          name: 'Shirt',
          quantity: 2,
          currency: 'EGP',
          addedUnitPriceMinor: 24_900,
          currentUnitPriceMinor: 24_900,
          available: 5,
          availability: 'OK',
        },
      ],
    },
  ],
};

describe('CartPage', () => {
  beforeEach(() => {
    mocks.params.clear();
    mocks.cart.mockReset();
    mocks.setLine.mockReset();
    mocks.removeLine.mockReset();
  });

  it('keeps the loaded cart on screen when a mutation is refused, and drops the message', async () => {
    mocks.cart.mockResolvedValue(loaded);
    mocks.setLine.mockRejectedValueOnce(new Error('Some lines changed since you reviewed your order'));

    render(<CartPage />);
    fireEvent.change(await screen.findByLabelText('Quantity of Shirt'), { target: { value: '3' } });

    expect((await screen.findByRole('alert')).textContent).toBe('Some lines changed since you reviewed your order');
    // The message is about one attempt, not the page: the cart it was applied to is
    // still the thing a buyer can retry from, and it is still here.
    expect(screen.getByRole('heading', { name: 'Cart' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Shirt' })).toBeTruthy();

    mocks.setLine.mockResolvedValueOnce(loaded);
    fireEvent.change(screen.getByLabelText('Quantity of Shirt'), { target: { value: '4' } });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('reports a cart it cannot load at all', async () => {
    mocks.cart.mockRejectedValue(new Error('Could not load the cart'));

    render(<CartPage />);

    expect((await screen.findByRole('alert')).textContent).toBe('Could not load the cart');
  });

  it('shows the refused-checkout banner for the one value the cart sends (D59)', async () => {
    mocks.cart.mockResolvedValue(loaded);
    mocks.params.set('conflict', 'lines');

    render(<CartPage />);

    expect((await screen.findByRole('alert')).textContent).toMatch(/Fix the flagged lines/);
  });

  it('does not show the refused-checkout banner for any other value', async () => {
    mocks.cart.mockResolvedValue(loaded);
    mocks.params.set('conflict', '');

    render(<CartPage />);

    await screen.findByRole('heading', { name: 'Cart' });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
