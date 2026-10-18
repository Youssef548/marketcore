import type { IdempotencyClaimKinds } from '../orders.constants';

/**
 * What one request claims (ADR 003).
 *
 * The checkout id is minted by the caller *before* the row exists, because the claim is
 * the transaction's first statement and the row must name the checkout the transaction is
 * about to create. The foreign key is deferred to commit for exactly this reason.
 */
export interface IdempotencyScope {
  buyerId: string;
  key: string;
  requestFingerprint: string;
  checkoutId: string;
}

/**
 * The three answers a claim can give.
 *
 * `REPLAY` carries the first request's checkout id, so a client that retried receives the
 * order it already has rather than a second one. `KEY_REUSED` is a refusal, not an error:
 * the key is valid and the request is not the one it was first used for.
 */
export type IdempotencyClaim =
  | { kind: typeof IdempotencyClaimKinds.CLAIMED }
  | { kind: typeof IdempotencyClaimKinds.REPLAY; checkoutId: string }
  | { kind: typeof IdempotencyClaimKinds.KEY_REUSED };
