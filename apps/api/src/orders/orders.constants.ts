import type { Prisma } from '@app/database';

/** DI token for the orders module's structured logger, the AUTH_LOGGER pattern. */
export const ORDERS_LOGGER = 'ORDERS_LOGGER';

export const PlaceCheckoutOutcomes = {
  PLACED: 'PLACED',
  REJECTED: 'REJECTED',
  CART_CHANGED: 'CART_CHANGED',
} as const;

/** Human-facing. Clients branch on `code` and `details`, never on these. */
export const CheckoutMessages = {
  LINES_CONFLICT: 'Some lines cannot be ordered as confirmed',
  CART_CHANGED: 'The cart changed since it was reviewed',
  MIXED_CURRENCY: 'A checkout holds one currency',
  CONTENDED: 'Checkout is busy; try again',
  NOT_FOUND: 'Checkout not found',
} as const;

export const BuyerOrderMessages = { NOT_FOUND: 'Order not found' } as const;

/** Reasons logged for refusals that are not line conflicts. */
export const CheckoutLogReasons = { MIXED_CURRENCY: 'MIXED_CURRENCY', CONTENDED: 'CONTENDED' } as const;

export const LOCKED_PRODUCT_SELECT = {
  id: true,
  name: true,
  priceMinor: true,
  currency: true,
  status: true,
  organization: { select: { id: true, status: true } },
} as const;

export const ORDER_ITEM_SELECT = {
  productId: true,
  productName: true,
  quantity: true,
  unitPriceMinor: true,
} as const;

export const BUYER_ORDER_SUMMARY_SELECT = {
  id: true,
  checkoutId: true,
  status: true,
  totalMinor: true,
  currency: true,
  createdAt: true,
  organization: { select: { name: true, slug: true } },
  _count: { select: { items: true } },
} as const;

export const BUYER_ORDER_DETAIL_SELECT = {
  id: true,
  checkoutId: true,
  status: true,
  totalMinor: true,
  currency: true,
  createdAt: true,
  organization: { select: { name: true, slug: true } },
  items: { select: ORDER_ITEM_SELECT, orderBy: { productId: 'asc' } },
} as const;

export const CHECKOUT_SELECT = {
  id: true,
  status: true,
  totalMinor: true,
  currency: true,
  placedAt: true,
  orders: {
    select: {
      id: true,
      status: true,
      totalMinor: true,
      currency: true,
      organization: { select: { name: true, slug: true } },
      items: { select: ORDER_ITEM_SELECT, orderBy: { productId: 'asc' } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.CheckoutSelect;
