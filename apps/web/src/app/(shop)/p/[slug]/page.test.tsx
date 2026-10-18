import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  params: { slug: '' },
  product: vi.fn(),
  setLine: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useParams: () => mocks.params }));
vi.mock('@/lib/storefront/client', () => ({
  storefront: { product: mocks.product, setLine: mocks.setLine },
}));

import ProductPage from './page';

const SHIRT_ID = '00000000-0000-4000-8000-000000000001';
const OIL_ID = '00000000-0000-4000-8000-000000000002';

const item = (id: string, name: string) => ({
  id,
  name,
  priceMinor: 24_900,
  currency: 'EGP' as const,
  available: 5,
  seller: { name: 'Nile Traders', slug: 'nile-traders' },
});

const shirt = item(SHIRT_ID, 'Nile Cotton Shirt');
const oil = item(OIL_ID, 'Argan Oil');

/** The slug is cosmetic (D76); only its trailing 36 characters are the id. */
const slugOf = (name: string, id: string): string => `${name}-${id}`;

beforeEach(() => {
  mocks.params.slug = slugOf('nile-cotton-shirt', SHIRT_ID);
  mocks.product.mockReset();
  mocks.setLine.mockReset();
});

describe('ProductPage', () => {
  it('shows the product after one that failed to load', async () => {
    // The render returns early on `error`, so an error left behind by the previous
    // slug hides every product after it — the URL is not the only state on screen.
    mocks.product.mockRejectedValueOnce(new Error('Product not found'));
    const { rerender } = render(<ProductPage />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Product not found'));

    mocks.params.slug = slugOf('argan-oil', OIL_ID);
    mocks.product.mockResolvedValue(oil);
    rerender(<ProductPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Argan Oil' })).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not carry an "Added" notice across products', async () => {
    mocks.product.mockResolvedValue(shirt);
    mocks.setLine.mockResolvedValue(undefined);
    const { rerender } = render(<ProductPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Nile Cotton Shirt' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());

    mocks.params.slug = slugOf('argan-oil', OIL_ID);
    mocks.product.mockResolvedValue(oil);
    rerender(<ProductPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Argan Oil' })).toBeTruthy());
    expect(screen.queryByRole('status')).toBeNull();
  });
});
