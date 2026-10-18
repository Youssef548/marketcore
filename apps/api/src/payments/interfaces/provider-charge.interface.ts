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

/** What `record` did, and what is stored: `created` is false when the key already had a charge. */
export interface RecordedCharge {
  charge: ProviderChargeRecord;
  created: boolean;
}

/**
 * The store behind the provider, as a port.
 *
 * The adapter needs two things and nothing else, which is why this is an interface rather
 * than a Prisma client: the decisions stay unit-testable against a fake, and the table
 * that implements it is proven separately by writing around Prisma.
 *
 * `record` is **insert-if-absent, then return what is stored** — `INSERT … ON CONFLICT DO
 * NOTHING` followed by a read, the same shape ADR 003 used for a request key. It must not
 * throw when the key is taken: two captures for one operation can arrive together, and a
 * duplicate insert that escaped as an exception would turn a retry into a 500 instead of
 * the idempotent answer the port promises.
 */
export interface ProviderChargeStore {
  find(operationKey: string): Promise<ProviderChargeRecord | null>;
  record(charge: ProviderChargeRecord): Promise<RecordedCharge>;
}
