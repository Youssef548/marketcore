import type { CurrencyCode } from '@app/contracts';

/** What the storefront query selects — and nothing it does not need. */
export interface PublicProductRow {
  id: string;
  name: string;
  priceMinor: number;
  currency: CurrencyCode;
  inventory: { available: number } | null;
  organization: { name: string; slug: string };
}
