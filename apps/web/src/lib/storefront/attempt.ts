import { IdempotencyKeySchema, type IdempotencyKey } from '@app/contracts';

/**
 * One key per placement attempt (D100): minted when the review step mounts, reused by
 * every retry of that attempt.
 *
 * It is deliberately not derived from the cart. A key derived from the lines would change
 * when the buyer fixes a refused cart and would silently become a *new* request — the one
 * thing a retry token must not do. It is also not "one key per session": two orders placed
 * in one sitting are two operations, and a session key would make the second answer with
 * the first's checkout.
 *
 * `parse` is not decoration. The key is minted here and validated at two other boundaries
 * (the BFF and the API) against the same schema; running it through that schema at the
 * point of minting means a change to the wire rule fails here, in a unit test, rather than
 * as a 400 in a browser.
 */
export const newAttemptKey = (): IdempotencyKey => IdempotencyKeySchema.parse(crypto.randomUUID());
