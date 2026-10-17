import { CheckoutSchema, type Checkout } from '@app/contracts';
import type { CheckoutRecord } from './interfaces/checkout.interface';

export function toCheckout(record: CheckoutRecord): Checkout {
  return CheckoutSchema.parse({
    id: record.id,
    status: record.status,
    totalMinor: record.totalMinor,
    currency: record.currency,
    placedAt: record.placedAt.toISOString(),
    orders: record.orders.map((order) => ({
      id: order.id,
      status: order.status,
      totalMinor: order.totalMinor,
      currency: order.currency,
      seller: { name: order.organization.name, slug: order.organization.slug },
      items: order.items.map((item) => ({
        productId: item.productId,
        name: item.productName,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
      })),
    })),
  });
}
