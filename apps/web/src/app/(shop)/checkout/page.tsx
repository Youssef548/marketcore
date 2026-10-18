'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CheckoutConflictDetailsSchema, ErrorCodes, type Cart, type CheckoutLineRequest } from '@app/contracts';
import { Alert } from '@app/ui';
import { newAttemptKey } from '@/lib/storefront/attempt';
import { StorefrontError, storefront } from '@/lib/storefront/client';
import { CART_PATH, CONFLICT_LINES, CONFLICT_QUERY, placedPath } from '@/lib/storefront/routes';
import { ReviewView } from './review-view';

const CART_CHANGED_NOTICE = 'Your cart changed while you were reviewing it. Check it again.';
const PAYMENT_DECLINED_NOTICE = 'That payment was declined. Nothing was charged — try again.';
const PAYMENT_PENDING_NOTICE =
  'We could not confirm the payment. If it went through, trying again will not charge you twice.';

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  /**
   * One key per mount of this step (D100), which is one placement attempt: every retry of
   * this screen carries it, and a reload mints a new one. Lazily initialised — passing
   * `newAttemptKey()` would call it on every render and make each retry a new attempt.
   */
  const [idempotencyKey] = useState(newAttemptKey);

  const load = useCallback(() => {
    storefront.cart().then(setCart).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the cart'));
  }, []);
  useEffect(load, [load]);

  /** One button, two operations: place, then pay (D108). A refusal names which of them. */
  const place = async (lines: CheckoutLineRequest[]) => {
    setPlacing(true);
    try {
      // The key is per mount, so a retry after a refusal replays this same checkout rather
      // than placing a second one — which is what makes "try again" safe to offer.
      const checkout = await storefront.placeCheckout({ lines }, idempotencyKey);

      try {
        await storefront.payCheckout(checkout.id);
      } catch (e: unknown) {
        if (e instanceof StorefrontError && e.code === ErrorCodes.CONFLICT) {
          // The money's refusal, not the cart's: stay here so the buyer can try again.
          const details = CheckoutConflictDetailsSchema.safeParse(e.details);
          const reason = details.success && 'reason' in details.data ? details.data.reason : null;
          setNotice(reason === 'PAYMENT_PENDING' ? PAYMENT_PENDING_NOTICE : PAYMENT_DECLINED_NOTICE);
          return;
        }
        // Anything else while paying is reported as the failure it is, and the checkout stays
        // placed and unpaid: the buyer's order exists, and the orders screen shows it.
        throw e;
      }

      router.push(placedPath(checkout.id));
    } catch (e: unknown) {
      // Branch on code and details, never on message (SRS §8).
      if (e instanceof StorefrontError && e.code === ErrorCodes.CONFLICT) {
        const details = CheckoutConflictDetailsSchema.safeParse(e.details);
        if (details.success && 'lines' in details.data) {
          router.push(`${CART_PATH}?${CONFLICT_QUERY}=${CONFLICT_LINES}`);
          return;
        }
        setNotice(CART_CHANGED_NOTICE);
        load();
      } else {
        setError(e instanceof Error ? e.message : 'Could not place the order');
      }
    } finally {
      setPlacing(false);
    }
  };

  if (error !== null) return <Alert>{error}</Alert>;
  if (cart === null) return <p className="text-sm text-ink-muted">Loading…</p>;
  return <ReviewView cart={cart} notice={notice} placing={placing} onPlace={(lines) => void place(lines)} />;
}
