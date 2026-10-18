import { formatMoney } from '@/lib/money';
import { statusLabel } from '@/lib/storefront/status';
import type { OrderViewProps } from './interfaces/order-view.interface';

export function OrderView({ order }: OrderViewProps) {
  return (
    <article className="space-y-4 rounded-brand border border-rule bg-panel p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{order.seller.name}</h1>
        <p className="text-sm">{statusLabel(order.status)}</p>
        <p className="text-sm text-ink-muted">Checkout {order.checkoutId}</p>
      </header>
      <ul>
        {order.items.map((item) => (
          <li key={item.productId} className="flex justify-between py-1">
            <span>
              {item.quantity} × {item.name}
            </span>
            <span>{formatMoney(item.unitPriceMinor, order.currency)}</span>
          </li>
        ))}
      </ul>
      <p className="text-lg font-semibold">Total {formatMoney(order.totalMinor, order.currency)}</p>
    </article>
  );
}
