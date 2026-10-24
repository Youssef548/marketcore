import type { CheckoutLineRequest } from '@app/contracts';
import { byLockOrder } from './checkout';

/**
 * The request's fingerprint (ADR 003, D96).
 *
 * SRS-FR-CHK-008 compares a repeat's body with the body the key was first used for,
 * so the comparison needs one string per request. This is it: the confirmed lines,
 * ordered bytewise by `productId` and projected to exactly the three wire fields.
 *
 * Two properties are the point. Order does not matter — a client that rebuilds its
 * lines from a map may submit them in any order and it is still the same operation.
 * Everything else does: a changed quantity or price, an added line or a missing one is
 * a different request, and the buyer is told `KEY_REUSED` rather than being replayed
 * the order they did not ask for.
 *
 * The order is `byLockOrder`, the same bytewise order the checkout locks inventory rows
 * in, not `localeCompare` — a fingerprint must not depend on the machine's locale.
 * There is no hash: the string is the comparison, so a mismatch stays readable.
 */
export function checkoutRequestFingerprint(lines: readonly CheckoutLineRequest[]): string {
  const canonical = [...lines]
    .sort((left, right) => byLockOrder(left.productId, right.productId))
    .map(({ productId, quantity, unitPriceMinor }) => ({ productId, quantity, unitPriceMinor }));

  return JSON.stringify({ lines: canonical });
}
