import type {
  CheckoutStatus,
  CurrencyCode,
  OrderStatus,
  OrganizationStatus,
  ProductStatus,
} from '@app/contracts';
import type { LineConflict } from '@app/domain';
import type { PlaceCheckoutOutcomes } from '../orders.constants';

export type PlaceCheckoutOutcome =
  | { kind: typeof PlaceCheckoutOutcomes.PLACED; checkoutId: string }
  | { kind: typeof PlaceCheckoutOutcomes.REJECTED; conflicts: LineConflict[] }
  | { kind: typeof PlaceCheckoutOutcomes.CART_CHANGED };

/** A product as the checkout transaction re-reads it after the inventory locks. */
export interface LockedProductRow {
  id: string;
  name: string;
  priceMinor: number;
  currency: CurrencyCode;
  status: ProductStatus;
  organization: { id: string; status: OrganizationStatus };
}

export interface OrderItemRecord {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceMinor: number;
}

export interface CheckoutOrderRecord {
  id: string;
  status: OrderStatus;
  totalMinor: number;
  currency: CurrencyCode;
  organization: { name: string; slug: string };
  items: OrderItemRecord[];
}

export interface CheckoutRecord {
  id: string;
  status: CheckoutStatus;
  totalMinor: number;
  currency: CurrencyCode;
  placedAt: Date;
  orders: CheckoutOrderRecord[];
}
