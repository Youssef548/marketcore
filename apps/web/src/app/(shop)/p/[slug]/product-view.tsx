'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CART_LINE_MAX_QUANTITY } from '@app/contracts';
import { Button } from '@app/ui';
import { formatMoney } from '@/lib/money';
import { stockLabel } from '@/lib/storefront/availability';
import type { ProductViewProps } from './interfaces/product-view.interface';

/** Stitch 077 minus the chrome no feature backs (reviews, wishlist, related items). */
export function ProductView({ product, onAdd, adding, added }: ProductViewProps) {
  const [quantity, setQuantity] = useState(1);
  const choices = Math.min(product.available, CART_LINE_MAX_QUANTITY);

  return (
    <article className="grid gap-6 rounded-brand border border-rule bg-panel p-6 md:grid-cols-2">
      <div className="space-y-2">
        <p className="text-sm text-ink-muted">Sold by {product.seller.name}</p>
        <h1 className="text-2xl font-semibold">{product.name}</h1>
        <p className="text-xl">{formatMoney(product.priceMinor, product.currency)}</p>
        <p className="text-sm">{stockLabel(product.available)}</p>
      </div>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd(quantity);
        }}
      >
        <label className="block text-sm" htmlFor="quantity">
          Quantity
        </label>
        <select
          id="quantity"
          className="rounded-brand border border-rule bg-panel px-2 py-1"
          value={quantity}
          disabled={choices === 0}
          onChange={(event) => setQuantity(Number(event.target.value))}
        >
          {Array.from({ length: choices }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={choices === 0 || adding}>
          Add to cart
        </Button>
        {added ? (
          <p role="status" className="text-sm">
            Added. <Link href="/cart">View cart</Link>
          </p>
        ) : null}
      </form>
    </article>
  );
}
