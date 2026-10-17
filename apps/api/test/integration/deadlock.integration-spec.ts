import { afterAll, describe, expect, it } from '@jest/globals';
import { Prisma } from '@app/database';
import { isRetryableTransactionError } from '../../src/common/database/retryable-transaction';
import { testPrisma } from '../support/db';
import { createProduct, createSeller } from '../support/marketplace';

const TX = { maxWait: 10_000, timeout: 15_000 };

afterAll(async () => {
  await testPrisma.$disconnect();
});

/**
 * The "forced lock-order test" failure-scenarios §1 promises for a database
 * deadlock: two transactions take the same two rows in opposite orders, so
 * Postgres must kill one. What Prisma raises for the victim is the fact the
 * retry classifier is written against.
 */
describe('a forced deadlock', () => {
  it('kills exactly one transaction, and the classifier calls it retryable', async () => {
    const seller = await createSeller('deadlock');
    const a = await createProduct(seller.organizationId);
    const b = await createProduct(seller.organizationId);

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

    const results = await Promise.allSettled([lockInOrder(a.id, b.id), lockInOrder(b.id, a.id)]);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    expect(rejected).toHaveLength(1);
    const reason = rejected[0].reason as { code?: string; meta?: unknown };
    // If this fails, the printed code/meta is what Prisma 6 really raises: fix the
    // classifier to it. Never loosen this assertion.
    expect({ retryable: isRetryableTransactionError(reason), code: reason.code, meta: reason.meta }).toMatchObject({
      retryable: true,
    });
  });

  it('the cure: the same two transactions locking in one sorted statement both commit', async () => {
    const seller = await createSeller('nodeadlock');
    const a = await createProduct(seller.organizationId);
    const b = await createProduct(seller.organizationId);

    const lockSorted = (ids: string[]) =>
      testPrisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT 1 FROM inventory WHERE "productId" IN (${Prisma.join(ids)})
          ORDER BY "productId" COLLATE "C" FOR UPDATE`;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }, TX);

    const results = await Promise.allSettled([lockSorted([a.id, b.id]), lockSorted([b.id, a.id])]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
  });
});
