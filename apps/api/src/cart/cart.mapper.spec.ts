import {
  CartLineAvailabilities,
  CurrencyCodes,
  OrganizationStatuses,
  ProductStatuses,
} from '@app/contracts';
import { toCart } from './cart.mapper';
import type { CartLineRow } from './interfaces/cart.interface';

function row(
  productId: string,
  overrides: Partial<CartLineRow['product']> & { quantity?: number; sellerId?: string } = {},
): CartLineRow {
  const sellerId = overrides.sellerId ?? 's1';
  return {
    productId,
    quantity: overrides.quantity ?? 1,
    addedUnitPriceMinor: 1000,
    product: {
      name: overrides.name ?? 'Item',
      priceMinor: overrides.priceMinor ?? 1000,
      currency: CurrencyCodes.EGP,
      status: overrides.status ?? ProductStatuses.PUBLISHED,
      inventory: overrides.inventory ?? { available: 5 },
      organization: overrides.organization ?? {
        id: sellerId,
        name: `Seller ${sellerId}`,
        slug: `seller-${sellerId}`,
        status: OrganizationStatuses.ACTIVE,
      },
    },
  };
}

describe('toCart', () => {
  it('groups lines by seller (SRS-FR-CART-006)', () => {
    const cart = toCart([row('a', { sellerId: 's1' }), row('b', { sellerId: 's2' })]);
    expect(cart.sellers.map((group) => group.seller.slug)).toEqual(['seller-s1', 'seller-s2']);
  });

  it('flags a line short of stock (AC-US-CART-002-1)', () => {
    const cart = toCart([row('a', { quantity: 2, inventory: { available: 1 } })]);
    expect(cart.sellers[0].lines[0]).toMatchObject({ available: 1, availability: CartLineAvailabilities.SHORT });
  });

  it('keeps an unpublished line, sold out and masked (SRS-FR-CART-007, D86)', () => {
    const cart = toCart([row('a', { status: ProductStatuses.DRAFT, inventory: { available: 9 } })]);
    expect(cart.sellers[0].lines[0]).toMatchObject({
      availability: CartLineAvailabilities.SOLD_OUT,
      available: 0,
      currentUnitPriceMinor: null,
    });
  });

  it('shows the added price beside the current one (D82)', () => {
    const cart = toCart([row('a', { priceMinor: 1200 })]);
    expect(cart.sellers[0].lines[0]).toMatchObject({ addedUnitPriceMinor: 1000, currentUnitPriceMinor: 1200 });
  });
});
