import { z } from 'zod';
import {
  BuyerOrderPageSchema,
  BuyerOrderSchema,
  CartSchema,
  CheckoutSchema,
  ErrorCodes,
  ErrorEnvelopeSchema,
  PublicProductPageSchema,
  PublicProductSchema,
  type CreateCheckoutRequest,
} from '@app/contracts';

/** A refusal from the BFF, with the API's code and typed details intact. */
export class StorefrontError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'StorefrontError';
  }
}

async function call<T>(input: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = ErrorEnvelopeSchema.safeParse(body);
    throw envelope.success
      ? new StorefrontError(response.status, envelope.data.error.code, envelope.data.error.message, envelope.data.error.details)
      : new StorefrontError(response.status, ErrorCodes.INTERNAL, `Unexpected response (${response.status})`);
  }
  return schema.parse(body);
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const cursorQuery = (cursor?: string) => (cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`);
const segment = encodeURIComponent;

/** The browser's only way to the buyer API: through this app's BFF, never the API directly. */
export const storefront = {
  products: (cursor?: string) => call(`/api/storefront/products${cursorQuery(cursor)}`, PublicProductPageSchema),
  product: (id: string) => call(`/api/storefront/products/${segment(id)}`, PublicProductSchema),
  cart: () => call('/api/cart', CartSchema),
  setLine: (productId: string, quantity: number) =>
    call(`/api/cart/items/${segment(productId)}`, CartSchema, json('PUT', { quantity })),
  removeLine: (productId: string) => call(`/api/cart/items/${segment(productId)}`, CartSchema, { method: 'DELETE' }),
  placeCheckout: (body: CreateCheckoutRequest) => call('/api/checkouts', CheckoutSchema, json('POST', body)),
  checkout: (id: string) => call(`/api/checkouts/${segment(id)}`, CheckoutSchema),
  orders: (cursor?: string) => call(`/api/buyer/orders${cursorQuery(cursor)}`, BuyerOrderPageSchema),
  order: (id: string) => call(`/api/buyer/orders/${segment(id)}`, BuyerOrderSchema),
};
