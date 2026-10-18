import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProductView } from './product-view';

const product = {
  id: 'p1',
  name: 'Nile Cotton Shirt',
  priceMinor: 24_900,
  currency: 'EGP' as const,
  available: 1,
  seller: { name: 'Nile Traders', slug: 'nile-traders' },
};

describe('ProductView (Stitch 077)', () => {
  it('shows "1 left" and the seller name (AC-US-CAT-002-1)', () => {
    render(<ProductView product={product} onAdd={vi.fn()} adding={false} added={false} />);

    expect(screen.getByRole('heading', { name: 'Nile Cotton Shirt' })).toBeTruthy();
    expect(screen.getByText('1 left')).toBeTruthy();
    expect(screen.getByText(/Nile Traders/)).toBeTruthy();
    expect(screen.getByText(/249\.00/)).toBeTruthy();
  });

  it('offers no more than stock allows, and never more than 10 (D72)', () => {
    render(<ProductView product={{ ...product, available: 40 }} onAdd={vi.fn()} adding={false} added={false} />);
    expect(screen.getByLabelText('Quantity').querySelectorAll('option')).toHaveLength(10);
  });

  it('adds the chosen quantity', () => {
    const onAdd = vi.fn();
    render(<ProductView product={{ ...product, available: 3 }} onAdd={onAdd} adding={false} added={false} />);

    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(onAdd).toHaveBeenCalledWith(2);
  });

  it('cannot add a sold-out product', () => {
    render(<ProductView product={{ ...product, available: 0 }} onAdd={vi.fn()} adding={false} added={false} />);
    expect(screen.getByText('Sold out')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Add to cart' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
