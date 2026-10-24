/**
 * The buyer a request acts for. Built by BuyerGuard from the access token's
 * subject (D75), never from a request field.
 */
export interface BuyerContext {
  buyerId: string;
}

/** The filter shape every buyer-scoped query composes its `where` from. */
export interface BuyerScope {
  buyerId: string;
}
