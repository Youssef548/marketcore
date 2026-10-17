import {
  BuyerOrderSchema,
  BuyerOrderSummarySchema,
  type BuyerOrder,
  type BuyerOrderSummary,
} from '@app/contracts';
import type { BuyerOrderRow, BuyerOrderSummaryRow } from './interfaces/buyer-order.interface';

const common = (row: BuyerOrderRow | BuyerOrderSummaryRow) => ({
  id: row.id,
  checkoutId: row.checkoutId,
  status: row.status,
  totalMinor: row.totalMinor,
  currency: row.currency,
  createdAt: row.createdAt.toISOString(),
  seller: { name: row.organization.name, slug: row.organization.slug },
});

export function toBuyerOrderSummary(row: BuyerOrderSummaryRow): BuyerOrderSummary {
  return BuyerOrderSummarySchema.parse({ ...common(row), itemCount: row._count.items });
}

export function toBuyerOrder(row: BuyerOrderRow): BuyerOrder {
  return BuyerOrderSchema.parse({
    ...common(row),
    items: row.items.map((item) => ({
      productId: item.productId,
      name: item.productName,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
    })),
  });
}
