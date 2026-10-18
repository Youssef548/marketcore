'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CHECKOUT_PAYMENT_WINDOW_MINUTES } from '@app/contracts';
import { Alert, Button } from '@app/ui';
import { formatMoney } from '@/lib/money';
import { canPlaceOrder, reviewCart } from '@/lib/storefront/review';
import { CART_PATH } from '@/lib/storefront/routes';
import type { ReviewViewProps } from './interfaces/review-view.interface';

/** Stitch 028, without the payment column — payment arrives in phases 6–7 (D62). */
export function ReviewView({ cart, notice, placing, onPlace }: ReviewViewProps) {
  const review = reviewCart(cart);
  const [accepted, setAccepted] = useState(false);
  const allowed = canPlaceOrder(review, accepted) && !placing;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Review your order</h1>
      {notice !== null ? <Alert role="alert">{notice}</Alert> : null}

      {review.mixedCurrency ? (
        <Alert>An order holds one currency. Remove the items in other currencies to continue.</Alert>
      ) : null}

      {review.stockProblems.length > 0 ? (
        <Alert>
          Some items are short of stock: {review.stockProblems.map((p) => `${p.name} (${p.label})`).join(', ')}.{' '}
          <Link href={CART_PATH}>Fix them in your cart</Link>.
        </Alert>
      ) : null}

      {review.priceChanges.length > 0 ? (
        <div className="space-y-2 rounded-brand border border-rule bg-panel p-4">
          <p className="font-semibold">Prices changed since you added these:</p>
          <ul>
            {review.priceChanges.map((change) => (
              <li key={change.productId}>
                {change.name}: <s>{formatMoney(change.fromMinor, change.currency)}</s> →{' '}
                <strong>{formatMoney(change.toMinor, change.currency)}</strong>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
            I accept the new prices
          </label>
        </div>
      ) : null}

      {cart.sellers.map((group) => (
        <div key={group.seller.slug} className="rounded-brand border border-rule bg-panel p-4">
          <h2 className="font-semibold">{group.seller.name}</h2>
          <ul>
            {group.lines.map((line) => (
              <li key={line.productId} className="flex justify-between py-1 text-sm">
                <span>
                  {line.quantity} × {line.name}
                </span>
                <span>{formatMoney(line.currentUnitPriceMinor ?? line.addedUnitPriceMinor, line.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {review.currency !== null ? (
        <p className="text-lg font-semibold">Total {formatMoney(review.totalMinor, review.currency)}</p>
      ) : null}
      <p className="text-sm text-ink-muted">
        Payment is not collected yet. An order left unpaid is cancelled after {CHECKOUT_PAYMENT_WINDOW_MINUTES} minutes.
      </p>
      <Button disabled={!allowed} onClick={() => onPlace(review.confirmedLines)}>
        Place order
      </Button>
    </section>
  );
}
