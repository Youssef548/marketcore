'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BuyerOrderSummary } from '@app/contracts';
import { Alert } from '@app/ui';
import { storefront } from '@/lib/storefront/client';
import { OrdersView } from './orders-view';

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<BuyerOrderSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (after?: string) => {
    try {
      const page = await storefront.orders(after);
      setOrders((current) => (after === undefined || current === null ? page.items : [...current, ...page.items]));
      setCursor(page.nextCursor);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load your orders');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error !== null) return <Alert>{error}</Alert>;
  if (orders === null) return <p className="text-sm text-ink-muted">Loading…</p>;
  return <OrdersView orders={orders} hasMore={cursor !== null} onMore={() => void load(cursor ?? undefined)} />;
}
