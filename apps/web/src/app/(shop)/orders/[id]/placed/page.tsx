'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CHECKOUT_PAYMENT_WINDOW_MINUTES, type Checkout } from '@app/contracts';
import { Alert } from '@app/ui';
import { formatMoney } from '@/lib/money';
import { storefront } from '@/lib/storefront/client';
import { MY_ORDERS_PATH, orderPath } from '@/lib/storefront/routes';
import { statusLabel } from '@/lib/storefront/status';

/** Stitch 063: one checkout, one order per seller (D56), payment not yet collected (D62). */
export default function PlacedPage() {
  const { id } = useParams<{ id: string }>();
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    storefront.checkout(id).then(setCheckout).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the order'));
  }, [id]);

  if (error !== null) return <Alert>{error}</Alert>;
  if (checkout === null) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Order placed</h1>
      <p className="text-sm text-ink-muted">
        {checkout.orders.length} {checkout.orders.length === 1 ? 'order' : 'orders'} in one checkout. Payment is not
        collected yet; unpaid orders are cancelled after {CHECKOUT_PAYMENT_WINDOW_MINUTES} minutes.
      </p>
      {checkout.orders.map((order) => (
        <div key={order.id} className="rounded-brand border border-rule bg-panel p-4">
          <h2 className="font-semibold">
            <Link href={orderPath(order.id)}>{order.seller.name}</Link>
          </h2>
          <p className="text-sm">{statusLabel(order.status)}</p>
          <p>{formatMoney(order.totalMinor, order.currency)}</p>
        </div>
      ))}
      <p className="text-lg font-semibold">Total {formatMoney(checkout.totalMinor, checkout.currency)}</p>
      <Link href={MY_ORDERS_PATH}>My orders</Link>
    </section>
  );
}
