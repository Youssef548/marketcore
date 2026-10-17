import type { BuyerContext, BuyerScope } from './buyer.interface';

export * from './buyer.interface';

/** The only sanctioned way to construct a BuyerContext. */
export function buildBuyerContext(buyerId: string): BuyerContext {
  if (buyerId.length === 0) {
    throw new Error('buildBuyerContext requires a buyerId');
  }
  return { buyerId };
}

/**
 * The single definition of the buyer filter — ADR 010's amendment. Cart, checkout
 * and buyer-order repositories compose from this and never from tenantScope.
 */
export function buyerScope(buyer: BuyerContext): BuyerScope {
  return { buyerId: buyer.buyerId };
}
