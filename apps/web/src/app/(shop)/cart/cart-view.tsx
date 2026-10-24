import Link from 'next/link';
import { CART_LINE_MAX_QUANTITY } from '@app/contracts';
import { Alert, Button } from '@app/ui';
import { formatMoney } from '@/lib/money';
import { lineAvailabilityLabel } from '@/lib/storefront/availability';
import type { CartViewProps, PriceProps } from './interfaces/cart-view.interface';

function Price({ line }: PriceProps) {
  const current = line.currentUnitPriceMinor;
  if (current === null || current === line.addedUnitPriceMinor) {
    return <span>{formatMoney(line.addedUnitPriceMinor, line.currency)}</span>;
  }
  return (
    <span>
      <s className="text-ink-muted">{formatMoney(line.addedUnitPriceMinor, line.currency)}</s>{' '}
      <strong>{formatMoney(current, line.currency)}</strong>
    </span>
  );
}

/** Stitch 056: one panel per seller (SRS-FR-CART-006), live flags per line (PRD-FR-CART-003). */
export function CartView({ cart, conflict, onQuantity, onRemove }: CartViewProps) {
  if (cart.sellers.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Your cart is empty. <Link href="/browse">Browse products</Link>
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Cart</h1>
      {conflict ? (
        <Alert role="alert">Some items changed since you reviewed your order. Fix the flagged lines, then review again.</Alert>
      ) : null}
      {cart.sellers.map((group) => (
        <section
          key={group.seller.slug}
          aria-labelledby={`seller-${group.seller.slug}`}
          className="rounded-brand border border-rule bg-panel p-4"
        >
          <h2 id={`seller-${group.seller.slug}`} className="font-semibold">
            {group.seller.name}
          </h2>
          <ul className="divide-y divide-rule">
            {group.lines.map((line) => {
              const flag = lineAvailabilityLabel(line);
              return (
                <li key={line.productId} className="flex items-center gap-4 py-3">
                  <span className="flex-1">{line.name}</span>
                  {flag !== null ? <span className="text-sm font-semibold">{flag}</span> : null}
                  <Price line={line} />
                  <select
                    aria-label={`Quantity of ${line.name}`}
                    value={line.quantity}
                    onChange={(event) => onQuantity(line.productId, Number(event.target.value))}
                    className="rounded-brand border border-rule bg-panel px-2 py-1"
                  >
                    {Array.from({ length: CART_LINE_MAX_QUANTITY }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <Button variant="quiet" size="sm" aria-label={`Remove ${line.name}`} onClick={() => onRemove(line.productId)}>
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <Link href="/checkout" className="inline-block rounded-brand bg-action px-4 py-2 text-ink-on-action">
        Review order
      </Link>
    </div>
  );
}
