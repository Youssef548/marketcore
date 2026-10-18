import { z } from 'zod';
import { createApiClient } from '@app/api-client';
import {
  BuyerOrderPageSchema,
  BuyerOrderSchema,
  CartSchema,
  CheckoutSchema,
  IDEMPOTENCY_KEY_HEADER,
  OrganizationSchema,
  ProductSchema,
  PublicProductPageSchema,
  PublicProductSchema,
  TokenPairSchema,
  UserSummarySchema,
  type BuyerOrder,
  type BuyerOrderPage,
  type Cart,
  type Checkout,
  type CreateCheckoutRequest,
  type CreateOrganizationRequest,
  type CreateProductRequest,
  type IdempotencyKey,
  type LoginRequest,
  type Organization,
  type Product,
  type PublicProduct,
  type PublicProductPage,
  type RegisterRequest,
  type SetCartLineRequest,
  type TokenPair,
  type UserSummary,
} from '@app/contracts';
import { apiBaseUrl } from '../api/config';

const withCursor = (path: string, cursor: string | undefined): string =>
  cursor === undefined ? path : `${path}?cursor=${encodeURIComponent(cursor)}`;

/**
 * The calls this app makes to the API.
 *
 * Resource methods belong to the app that owns the resource — that is the reason
 * `@app/api-client` ships none, and it is written in that package's own comment.
 * These live here, on top of its generic verbs.
 *
 * The access token is a parameter rather than construction-time state, so there is
 * no long-lived client holding a token that may already have been rotated. Every
 * call re-parses its response with the contract the API validated it with, so a
 * server that drifts from the contract raises here rather than handing a malformed
 * object to a page.
 */
export function createResources(accessToken?: string) {
  const client = createApiClient({
    baseUrl: apiBaseUrl(),
    getAccessToken: () => accessToken,
  });

  return {
    /** Creates a user and nothing else — no session, deliberately. */
    register: (body: RegisterRequest): Promise<UserSummary> =>
      client.post('/auth/register', UserSummarySchema, { body }),

    login: (body: LoginRequest): Promise<TokenPair> =>
      client.post('/auth/login', TokenPairSchema, { body }),

    /** Rotates a refresh token. The coordinator above decides when this is called. */
    refresh: (refreshToken: string): Promise<TokenPair> =>
      client.post('/auth/refresh', TokenPairSchema, { body: { refreshToken } }),

    /** 204, so the contract for the body is `null` rather than a shape. */
    logout: (refreshToken: string): Promise<null> =>
      client.post('/auth/logout', z.null(), { body: { refreshToken } }),

    me: (): Promise<UserSummary> => client.get('/auth/me', UserSummarySchema),

    /** Tenant-free: this is how a client learns which organizations it may act in. */
    organizations: (): Promise<Organization[]> =>
      client.get('/organizations', z.array(OrganizationSchema)),

    /**
     * Creates an organization, with the caller as its owner — one operation, because an
     * organization nobody belongs to is a row nobody can use.
     *
     * Tenant-free at the API, and it has to be: a user with no memberships has no tenant
     * to name, so a request that required a header could never create the first one.
     * `slug` is left to the API, which derives it from the name.
     */
    createOrganization: (body: CreateOrganizationRequest): Promise<Organization> =>
      client.post('/organizations', OrganizationSchema, { body }),

    /**
     * The caller's products, inside one organization.
     *
     * The organization travels as `x-organization-id` — the header the guard resolves
     * into a `TenantContext` — rather than as a path segment or a query parameter. A
     * request without it is refused with 400 rather than answered with everything,
     * which is what makes a missing header a loud failure instead of a leak.
     */
    products: (organizationId: string): Promise<Product[]> =>
      client.get('/products', z.array(ProductSchema), {
        headers: { 'x-organization-id': organizationId },
      }),

    /** Creates a product inside one organization. The tenant travels exactly as it reads. */
    createProduct: (organizationId: string, body: CreateProductRequest): Promise<Product> =>
      client.post('/products', ProductSchema, {
        body,
        headers: { 'x-organization-id': organizationId },
      }),

    // Buyer routes (D75): tenant-free, so no x-organization-id — the API resolves
    // the buyer from the token alone.
    storefrontProducts: (cursor?: string): Promise<PublicProductPage> =>
      client.get(withCursor('/storefront/products', cursor), PublicProductPageSchema),

    storefrontProduct: (id: string): Promise<PublicProduct> =>
      client.get(`/storefront/products/${encodeURIComponent(id)}`, PublicProductSchema),

    cart: (): Promise<Cart> => client.get('/cart', CartSchema),

    setCartLine: (productId: string, body: SetCartLineRequest): Promise<Cart> =>
      client.put(`/cart/items/${encodeURIComponent(productId)}`, CartSchema, { body }),

    removeCartLine: (productId: string): Promise<Cart> =>
      client.delete(`/cart/items/${encodeURIComponent(productId)}`, CartSchema),

    /**
     * The key travels as `Idempotency-Key` (SRS-FR-CHK-008). It is a parameter, like the
     * body: two attempts to place an order are two operations, and a key held in this
     * client would make the second attempt answer with the first's checkout.
     */
    placeCheckout: (body: CreateCheckoutRequest, idempotencyKey: IdempotencyKey): Promise<Checkout> =>
      client.post('/checkouts', CheckoutSchema, {
        body,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      }),

    checkout: (id: string): Promise<Checkout> =>
      client.get(`/checkouts/${encodeURIComponent(id)}`, CheckoutSchema),

    /** One charge for one checkout (SRS-FR-PAY-001). A repeat charges nothing and replays. */
    payCheckout: (id: string): Promise<Checkout> =>
      client.post(`/checkouts/${encodeURIComponent(id)}/pay`, CheckoutSchema, {}),

    buyerOrders: (cursor?: string): Promise<BuyerOrderPage> =>
      client.get(withCursor('/buyer/orders', cursor), BuyerOrderPageSchema),

    buyerOrder: (id: string): Promise<BuyerOrder> =>
      client.get(`/buyer/orders/${encodeURIComponent(id)}`, BuyerOrderSchema),
  };
}
