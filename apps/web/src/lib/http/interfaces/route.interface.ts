/** The dynamic params of a Next route handler, as Next hands them (a Promise). */
export interface RouteContext<TParams> {
  params: Promise<TParams>;
}

/** A single `[id]` segment: `/api/storefront/products/[id]`, `/api/checkouts/[id]`, `/api/buyer/orders/[id]`. */
export interface IdRouteParams {
  id: string;
}

/** The `[productId]` segment of `/api/cart/items/[productId]`. */
export interface ProductIdRouteParams {
  productId: string;
}
