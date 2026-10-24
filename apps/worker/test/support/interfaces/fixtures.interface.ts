import type { CurrencyCode } from '@app/contracts';

export interface ProductFixture {
  id: string;
  organizationId: string;
  name: string;
  priceMinor: number;
  currency: CurrencyCode;
}

/** A product and how many of it a placed checkout holds. */
export interface FixtureLine {
  product: ProductFixture;
  quantity: number;
}
