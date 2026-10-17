'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { Cart } from '@app/contracts';
import { Alert } from '@app/ui';
import { storefront } from '@/lib/storefront/client';
import { CONFLICT_QUERY } from '@/lib/storefront/routes';
import { CartView } from './cart-view';

function CartPageBody() {
  const params = useSearchParams();
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = (pending: Promise<Cart>) =>
    pending.then(setCart).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the cart'));

  useEffect(() => {
    void apply(storefront.cart());
  }, []);

  if (error !== null) return <Alert>{error}</Alert>;
  if (cart === null) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <CartView
      cart={cart}
      conflict={params.get(CONFLICT_QUERY) !== null}
      onQuantity={(productId, quantity) => void apply(storefront.setLine(productId, quantity))}
      onRemove={(productId) => void apply(storefront.removeLine(productId))}
    />
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
