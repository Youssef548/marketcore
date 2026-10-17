import type { CheckoutConflictReason } from '@app/contracts';

export interface LineQuantity {
  productId: string;
  quantity: number;
}

/** A line as the buyer confirmed it on the review step (D77). */
export interface ConfirmedLine extends LineQuantity {
  unitPriceMinor: number;
}

/** What the checkout transaction read for one product after locking its inventory row. */
export interface LockedLineState {
  productId: string;
  /** PUBLISHED, and its organization ACTIVE. */
  purchasable: boolean;
  available: number;
  currentUnitPriceMinor: number;
}

/** One refused line, exactly the wire shape of `details.lines[]`. */
export interface LineConflict {
  productId: string;
  reason: CheckoutConflictReason;
  available: number;
  /** null when the product is no longer public (D86). */
  currentUnitPriceMinor: number | null;
}

export interface SellerGroup<T> {
  sellerId: string;
  lines: T[];
}
