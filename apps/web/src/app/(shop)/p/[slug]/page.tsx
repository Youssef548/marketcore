'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PublicProduct } from '@app/contracts';
import { Alert } from '@app/ui';
import { productIdFromSlug } from '@/lib/storefront/product-path';
import { storefront } from '@/lib/storefront/client';
import { ProductView } from './product-view';

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    storefront
      .product(productIdFromSlug(slug))
      .then(setProduct)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the product'));
  }, [slug]);

  if (error !== null) return <Alert>{error}</Alert>;
  if (product === null) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <ProductView
      product={product}
      adding={adding}
      added={added}
      onAdd={(quantity) => {
        setAdding(true);
        storefront
          .setLine(product.id, quantity)
          .then(() => setAdded(true))
          .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not add to cart'))
          .finally(() => setAdding(false));
      }}
    />
  );
}
