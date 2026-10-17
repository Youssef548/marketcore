import { afterAll, describe, expect, it } from '@jest/globals';
import {
  INTERACTIVE_TRANSACTION_MAX_WAIT_MS,
  INTERACTIVE_TRANSACTION_TIMEOUT_MS,
  TRANSACTION_RETRIES,
  TRANSACTION_RETRY_BASE_DELAY_MS,
} from '../../src/common/database/database.constants';
import {
  isRetryableTransactionError,
  withTransactionRetry,
} from '../../src/common/database/retryable-transaction';
import { testPrisma } from '../support/db';
import { createProduct, createSeller } from '../support/marketplace';

/** The production budget, not a second copy of it. */
const TX = {
  maxWait: INTERACTIVE_TRANSACTION_MAX_WAIT_MS,
  timeout: INTERACTIVE_TRANSACTION_TIMEOUT_MS,
};

afterAll(async () => {
  await testPrisma.$disconnect();
});

/**
 * The "forced lock-order test" failure-scenarios §1 promises for a database
 * deadlock: two transactions take the same two rows in opposite orders, so
 * Postgres must kill one.
 *
 * Both sides run through `withTransactionRetry`, so this case does two jobs the
 * earlier version did not: it pins what Prisma raises for the victim, and it proves
 * the retry loop actually recovers from a real deadlock — not only from a mocked
 * error (phase-4 review finding).
 */
describe('a forced deadlock', () => {
  it('kills one transaction, calls it retryable, and the retry loop recovers', async () => {
    const seller = await createSeller('deadlock');
    const a = await createProduct(seller.organizationId);
    const b = await createProduct(seller.organizationId);

    // A deterministic cycle: neither transaction can reach its second lock until
    // both hold their first, so the deadlock does not depend on timing luck.
    let arrived = 0;
    let release!: () => void;
    const bothHoldOne = new Promise<void>((resolve) => (release = resolve));
    const meet = async () => {
      arrived += 1;
      if (arrived === 2) release();
      await bothHoldOne;
    };

    const lockInOrder = (first: string, second: string) =>
      testPrisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM inventory WHERE "productId" = ${first} FOR UPDATE`;
        await meet();
        await tx.$queryRaw`SELECT 1 FROM inventory WHERE "productId" = ${second} FOR UPDATE`;
      }, TX);

    const retried = (first: string, second: string, onRetry: (attempt: number, error: unknown) => void) =>
      withTransactionRetry(() => lockInOrder(first, second), {
        retries: TRANSACTION_RETRIES,
        baseDelayMs: TRANSACTION_RETRY_BASE_DELAY_MS,
        onRetry,
      });

    const seen: unknown[] = [];
    const onRetry = (_attempt: number, error: unknown) => void seen.push(error);

    const results = await Promise.allSettled([
      retried(a.id, b.id, onRetry),
      retried(b.id, a.id, onRetry),
    ]);

    // Both end fulfilled: Postgres killed one, and its next attempt found the rows free
    // because the survivor had committed. A classifier that missed the real shape
    // would leave one rejected here.
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(seen).toHaveLength(1);

    const reason = seen[0] as { code?: string; meta?: unknown };
    // Measured on Prisma 6: P2010 ("Raw query failed") carrying meta.code 40P01.
    // The assertion stays on the functional claim and the known shape rather than
    // hard-coding one code, so a Prisma upgrade that surfaces P2034 still passes —
    // but a shape the classifier does not know fails here, loudly.
    expect(isRetryableTransactionError(reason)).toBe(true);
    expect(['P2034', 'P2010']).toContain(reason.code);
  });
});
