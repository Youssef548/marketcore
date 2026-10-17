export const CartMessages = { PRODUCT_NOT_FOUND: 'Product not found' } as const;

export const CART_LINE_SELECT = {
  productId: true,
  quantity: true,
  addedUnitPriceMinor: true,
  product: {
    select: {
      name: true,
      priceMinor: true,
      currency: true,
      status: true,
      inventory: { select: { available: true } },
      organization: { select: { id: true, name: true, slug: true, status: true } },
    },
  },
} as const;

/** Lines in the order the buyer added them; the product id breaks a same-millisecond tie. */
export const CART_LINE_ORDER = [{ createdAt: 'asc' }, { productId: 'asc' }] as const;
