import type { CurrencyCode, OrganizationStatus, ProductStatus } from '@app/contracts';

/** One cart line as the cart query reads it, joined to its product and seller. */
export interface CartLineRow {
  productId: string;
  quantity: number;
  addedUnitPriceMinor: number;
  product: {
    name: string;
    priceMinor: number;
    currency: CurrencyCode;
    status: ProductStatus;
    inventory: { available: number } | null;
    organization: { id: string; name: string; slug: string; status: OrganizationStatus };
  };
}
