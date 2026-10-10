import type { CurrencyCode, ProductStatus } from '@app/contracts';

/**
 * A product row as the catalog reads and writes it.
 *
 * Wider than what a transition needs — `name` and `currency` ride along so a read
 * can be returned to the caller without a second query.
 */
export interface ProductRecord {
  id: string;
  name: string;
  priceMinor: number;
  currency: CurrencyCode;
  status: ProductStatus;
}
