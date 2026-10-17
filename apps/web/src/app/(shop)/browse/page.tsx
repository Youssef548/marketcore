'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PublicProduct } from '@app/contracts';
import { Alert, Button } from '@app/ui';
import { storefront } from '@/lib/storefront/client';
import { ProductCard } from './product-card';

export default function BrowsePage() {
  const [items, setItems] = useState<PublicProduct[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (after?: string) => {
    setLoading(true);
    try {
      const page = await storefront.products(after);
      setItems((current) => (after === undefined ? page.items : [...current, ...page.items]));
      setCursor(page.nextCursor);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Browse</h1>
      {error !== null ? <Alert>{error}</Alert> : null}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </ul>
      {cursor !== null ? (
        <Button variant="secondary" disabled={loading} onClick={() => void load(cursor)}>
          Load more
        </Button>
      ) : null}
    </section>
  );
}
