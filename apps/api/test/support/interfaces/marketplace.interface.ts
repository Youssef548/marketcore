import type { CurrencyCode } from '@app/contracts';

export interface SellerFixture {
  organizationId: string;
  name: string;
  slug: string;
}

export interface ProductFixture {
  id: string;
  organizationId: string;
  name: string;
  priceMinor: number;
  currency: CurrencyCode;
}
