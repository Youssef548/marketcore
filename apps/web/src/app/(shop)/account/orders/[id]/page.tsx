'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { BuyerOrder } from '@app/contracts';
import { Alert } from '@app/ui';
import { storefront } from '@/lib/storefront/client';
import { OrderView } from './order-view';

export default function BuyerOrderPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<BuyerOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    storefront.order(id).then(setOrder).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the order'));
  }, [id]);

  if (error !== null) return <Alert>{error}</Alert>;
  if (order === null) return <p className="text-sm text-ink-muted">Loading…</p>;
  return <OrderView order={order} />;
}
