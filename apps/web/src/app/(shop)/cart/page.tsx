'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { Cart } from '@app/contracts';
import { Alert } from '@app/ui';
import { storefront } from '@/lib/storefront/client';
import { CONFLICT_LINES, CONFLICT_QUERY } from '@/lib/storefront/routes';
import { CartView } from './cart-view';

function CartPageBody() {
  const params = useSearchParams();
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * The first load and every mutation. The reset matters because the render below
   * reads `error` as this page's own failure: without it a 409 from a quantity
   * change holds the cart hostage, and the cart is the only place to retry from.
   */
  const apply = (pending: Promise<Cart>) => {
    setError(null);
    return pending
      .then(setCart)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the cart'));
  };

  useEffect(() => {
    void apply(storefront.cart());
  }, []);

  if (cart === null) {
    return error !== null ? <Alert>{error}</Alert> : <p className="text-sm text-ink-muted">Loading…</p>;
  }

  return (
    <>
      {/* A cart the server already sent stays on screen while the message about
          the failed attempt is shown: only the first load is fatal. */}
      {error !== null ? <Alert>{error}</Alert> : null}
      <CartView
        cart={cart}
        conflict={params.get(CONFLICT_QUERY) === CONFLICT_LINES}
        onQuantity={(productId, quantity) => void apply(storefront.setLine(productId, quantity))}
        onRemove={(productId) => void apply(storefront.removeLine(productId))}
      />
    </>
  );
}

export default function CartPage() {
  // useSearchParams needs a Suspense boundary, as in (auth)/login/page.tsx.
  return (
    <Suspense fallback={null}>
      <CartPageBody />
    </Suspense>
  );
}
