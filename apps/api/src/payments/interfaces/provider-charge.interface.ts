import type { CurrencyCode } from '@app/contracts';

/**
 * One provider operation: what the simulator charged, keyed by the operation key.
 *
 * This is the provider's own idempotency record — the thing a real provider keeps and
 * the reason a retry of a lost response does not charge twice. It is written **before**
 * the verdict is returned (ADR 004), so "the charge happened and the answer was lost" is
 * representable at all.
 */
export interface ProviderChargeRecord {
  operationKey: string;
  providerRef: string;
  amountMinor: number;
  currency: CurrencyCode;
  capturedAt: Date;
}

/**
 * The store behind the provider, as a port.
 *
 * The adapter needs two things and nothing else, which is why this is an interface rather
 * than a Prisma client: the decisions stay unit-testable against a fake, and the table
 * that implements it is proven separately by writing around Prisma.
 */
export interface ProviderChargeStore {
  find(operationKey: string): Promise<ProviderChargeRecord | null>;
  record(charge: ProviderChargeRecord): Promise<void>;
}
