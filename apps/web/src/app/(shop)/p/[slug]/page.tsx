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
    // A new slug is a new product, so nothing from the last one may survive here.
    // `error` is what makes the clearing load-bearing rather than tidy: the render
    // below returns early on it, so an error left over from a URL that did not
    // resolve would be the only thing this page could ever show again. `product`
    // nulled is the loading state, and it also drops the previous selection — that
    // `quantity` lives in ProductView, where it would outlive the product it was
    // chosen for.
    setError(null);
    setProduct(null);
    setAdding(false);
    setAdded(false);

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
