import Link from 'next/link';
import { Button } from '@app/ui';
import { formatMoney } from '@/lib/money';
import { orderPath } from '@/lib/storefront/routes';
import { statusLabel } from '@/lib/storefront/status';
import type { OrdersViewProps } from './interfaces/orders-view.interface';

export function OrdersView({ orders, hasMore, onMore }: OrdersViewProps) {
  if (orders.length === 0) return <p className="text-sm text-ink-muted">No orders yet.</p>;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">My orders</h1>
      <ul className="divide-y divide-rule rounded-brand border border-rule bg-panel">
        {orders.map((order) => (
          <li key={order.id} className="flex items-center gap-4 p-4">
            <Link href={orderPath(order.id)} className="flex-1 font-semibold">
              {order.seller.name}
            </Link>
            <span className="text-sm">{statusLabel(order.status)}</span>
            <span>{formatMoney(order.totalMinor, order.currency)}</span>
            <time className="text-sm text-ink-muted" dateTime={order.createdAt}>
              {new Date(order.createdAt).toLocaleDateString()}
            </time>
          </li>
        ))}
      </ul>
      {hasMore ? (
        <Button variant="secondary" onClick={onMore}>
          Load more
        </Button>
      ) : null}
    </section>
  );
}
