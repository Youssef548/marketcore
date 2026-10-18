import type { CurrencyCode, OrderStatus } from '@app/contracts';
import type { OrderItemRecord } from './checkout.interface';

interface BuyerOrderFields {
  id: string;
  checkoutId: string;
  status: OrderStatus;
  totalMinor: number;
  currency: CurrencyCode;
  createdAt: Date;
  organization: { name: string; slug: string };
}

export interface BuyerOrderSummaryRow extends BuyerOrderFields {
  _count: { items: number };
}

export interface BuyerOrderRow extends BuyerOrderFields {
  items: OrderItemRecord[];
}
