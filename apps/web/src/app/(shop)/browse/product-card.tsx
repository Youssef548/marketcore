import Link from 'next/link';
import { formatMoney } from '@/lib/money';
import { stockLabel } from '@/lib/storefront/availability';
import { productPath } from '@/lib/storefront/product-path';
import type { ProductCardProps } from './interfaces/product-card.interface';

/** One Stitch 057 card: name, seller, price, exact stock. */
export function ProductCard({ product }: ProductCardProps) {
  return (
    <li className="rounded-brand border border-rule bg-panel p-4">
      <Link href={productPath(product)} className="font-semibold">
        {product.name}
      </Link>
      <p className="text-sm text-ink-muted">{product.seller.name}</p>
      <p className="mt-2">{formatMoney(product.priceMinor, product.currency)}</p>
      <p className="text-sm">{stockLabel(product.available)}</p>
    </li>
  );
}
