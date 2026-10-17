import { describe, expect, it } from 'vitest';
import { CART_LINE_MAX_QUANTITY, CartLineAvailabilities, CurrencyCodes } from '../src/constants';
import { CartSchema, SetCartLineRequestSchema } from '../src/cart';

describe('SetCartLineRequestSchema (D72, AC-US-CART-001-2)', () => {
  it('accepts 1 to 10', () => {
    expect(SetCartLineRequestSchema.parse({ quantity: 1 })).toEqual({ quantity: 1 });
    expect(SetCartLineRequestSchema.parse({ quantity: CART_LINE_MAX_QUANTITY })).toEqual({ quantity: 10 });
  });
  it.each([0, 11, 2.5, -1])('refuses %s', (quantity) => {
    expect(SetCartLineRequestSchema.safeParse({ quantity }).success).toBe(false);
  });
});

describe('CartSchema', () => {
  const line = {
    productId: 'p1',
    name: 'Shirt',
    quantity: 2,
    currency: CurrencyCodes.EGP,
    addedUnitPriceMinor: 24_900,
    currentUnitPriceMinor: 24_900,
    available: 1,
    availability: CartLineAvailabilities.SHORT,
  };

  it('groups lines under a seller and carries live availability', () => {
    const cart = { sellers: [{ seller: { name: 'Nile', slug: 'nile' }, lines: [line] }] };
    expect(CartSchema.parse(cart)).toEqual(cart);
  });

  it('lets a non-public line hide its current price (D86)', () => {
    const masked = { ...line, currentUnitPriceMinor: null, available: 0, availability: CartLineAvailabilities.SOLD_OUT };
    expect(CartSchema.safeParse({ sellers: [{ seller: { name: 'N', slug: 'n' }, lines: [masked] }] }).success).toBe(true);
  });

  it('never carries a cart id: the route is the buyer, not an identifier (finding 4)', () => {
    expect(CartSchema.safeParse({ id: 'c1', sellers: [] }).success).toBe(false);
  });
});
