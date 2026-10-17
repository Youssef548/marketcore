'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CheckoutConflictDetailsSchema, ErrorCodes, type Cart, type CheckoutLineRequest } from '@app/contracts';
import { Alert } from '@app/ui';
import { StorefrontError, storefront } from '@/lib/storefront/client';
import { CART_PATH, CONFLICT_LINES, CONFLICT_QUERY, placedPath } from '@/lib/storefront/routes';
import { ReviewView } from './review-view';

const CART_CHANGED_NOTICE = 'Your cart changed while you were reviewing it. Check it again.';

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  const load = useCallback(() => {
    storefront.cart().then(setCart).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the cart'));
  }, []);
  useEffect(load, [load]);

  const place = async (lines: CheckoutLineRequest[]) => {
    setPlacing(true);
    try {
      const checkout = await storefront.placeCheckout({ lines });
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
