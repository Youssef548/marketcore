import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from '@jest/globals';
import { CurrencyCodes } from '@app/contracts';
import { testPrisma } from '../support/db';
import { createBuyer } from '../support/marketplace';

/**
 * ADR 003's storage rules, each proven by writing around the application (the week-2
 * pattern), because the question is what the database refuses, not what a service does.
 *
 * The deferrable foreign key is the one rule whose *behaviour* matters as much as its
 * existence. The claim is inserted before the checkout it names, so a test that only
 * proved "a key naming a missing checkout is refused" would pass against an immediate
 * constraint too. The pair of tests below — claim the key, then create the checkout, in
 * one transaction, and commit — is what tells deferred from immediate: only a deferral
 * lets that succeed.
 */
afterAll(async () => {
  await testPrisma.$disconnect();
});

const CONSTRAINTS = [
  'idempotency_keys_buyerId_key_key',
  'idempotency_keys_checkoutId_key',
  'idempotency_keys_checkoutId_fkey',
  'idempotency_keys_key_length',
];

/** A fresh buyer and a key nobody else holds. */
async function buyerAndKey(): Promise<{ buyerId: string; key: string }> {
  const buyer = await createBuyer();
  return { buyerId: buyer.id, key: `key-${randomUUID()}` };
}

/** A checkout the key may name, created the ordinary way, with no key involved. */
async function checkoutIdFor(buyerId: string): Promise<string> {
  const checkout = await testPrisma.checkout.create({
    data: { buyerId, totalMinor: 1000, currency: CurrencyCodes.EGP },
    select: { id: true },
  });
  return checkout.id;
}

describe('idempotency constraints (ADR 003)', () => {
  /**
   * The two UNIQUEs are indexes, so they are in `pg_indexes`; the foreign key and the
   * CHECK are in `pg_constraint`. Asking both catalogues keeps one list of names.
   */
  it.each(CONSTRAINTS)('%s is installed, not merely intended', async (name) => {
    const [row] = await testPrisma.$queryRaw<{ found: bigint }[]>`
      SELECT (
        (SELECT count(*) FROM pg_constraint WHERE conname = ${name}) +
        (SELECT count(*) FROM pg_indexes WHERE indexname = ${name})
      ) AS found
    `;
    expect(Number(row.found)).toBe(1);
  });

  it('defers the checkout foreign key, so a key may precede its checkout (D95)', async () => {
    const [row] = await testPrisma.$queryRaw<{ condeferrable: boolean; condeferred: boolean }[]>`
      SELECT condeferrable, condeferred
      FROM pg_constraint
      WHERE conname = 'idempotency_keys_checkoutId_fkey'
    `;
    expect(row).toEqual({ condeferrable: true, condeferred: true });
  });

  it('lets the key be claimed before the checkout it names exists (the FK is deferred)', async () => {
    const { buyerId, key } = await buyerAndKey();
    const checkoutId = randomUUID();

    await testPrisma.$transaction(async (tx) => {
      await tx.idempotencyKey.create({
        data: { buyerId, key, requestFingerprint: 'f', checkoutId },
      });
      await tx.checkout.create({
        data: { id: checkoutId, buyerId, totalMinor: 1000, currency: CurrencyCodes.EGP },
      });
    });

    expect(await testPrisma.idempotencyKey.count({ where: { key } })).toBe(1);
  });

  it('refuses a committed key that names no checkout', async () => {
    const { buyerId, key } = await buyerAndKey();

    await expect(
      testPrisma.$transaction(async (tx) => {
        await tx.idempotencyKey.create({
          data: { buyerId, key, requestFingerprint: 'f', checkoutId: randomUUID() },
        });
      }),
    ).rejects.toThrow(/foreign key constraint/i);

    expect(await testPrisma.idempotencyKey.count({ where: { key } })).toBe(0);
  });

  it('refuses the same (buyerId, key) twice', async () => {
    const { buyerId, key } = await buyerAndKey();
    await testPrisma.idempotencyKey.create({
      data: { buyerId, key, requestFingerprint: 'f', checkoutId: await checkoutIdFor(buyerId) },
    });

    await expect(
      testPrisma.idempotencyKey.create({
        data: { buyerId, key, requestFingerprint: 'f', checkoutId: await checkoutIdFor(buyerId) },
      }),
    ).rejects.toThrow(/Unique constraint failed/i);
  });

  it('accepts one key string for two buyers (D99)', async () => {
    const key = `shared-${randomUUID()}`;
    const first = await createBuyer();
    const second = await createBuyer();

    for (const buyer of [first, second]) {
      await testPrisma.idempotencyKey.create({
        data: { buyerId: buyer.id, key, requestFingerprint: 'f', checkoutId: await checkoutIdFor(buyer.id) },
      });
    }

    expect(await testPrisma.idempotencyKey.count({ where: { key } })).toBe(2);
  });

  it('gives one checkout at most one key', async () => {
    const { buyerId } = await buyerAndKey();
    const checkoutId = await checkoutIdFor(buyerId);
    await testPrisma.idempotencyKey.create({
      data: { buyerId, key: `first-${randomUUID()}`, requestFingerprint: 'f', checkoutId },
    });

    await expect(
      testPrisma.idempotencyKey.create({
        data: { buyerId, key: `second-${randomUUID()}`, requestFingerprint: 'f', checkoutId },
      }),
    ).rejects.toThrow(/Unique constraint failed/i);
  });

  it.each([
    ['an empty key', ''],
    ['a key above the wire bound', 'A'.repeat(65)],
  ])('refuses %s (SRS §7)', async (_label, key) => {
    const { buyerId } = await buyerAndKey();

    await expect(
      testPrisma.idempotencyKey.create({
        data: { buyerId, key, requestFingerprint: 'f', checkoutId: await checkoutIdFor(buyerId) },
      }),
    ).rejects.toThrow(/idempotency_keys_key_length/);
  });

  it('refuses a row with no checkoutId, inserted around the client', async () => {
    const { buyerId, key } = await buyerAndKey();

    await expect(
      testPrisma.$executeRaw`
        INSERT INTO "idempotency_keys" ("id", "buyerId", "key", "requestFingerprint", "checkoutId", "createdAt")
        VALUES (${`row-${key}`}, ${buyerId}, ${key}, 'f', NULL, NOW())
      `,
    ).rejects.toThrow(/23502/); // 23502 is PostgreSQL's not_null_violation
  });

  it("reads back a row it just wrote, with the client's default id and timestamp", async () => {
    const { buyerId, key } = await buyerAndKey();
    const row = await testPrisma.idempotencyKey.create({
      data: { buyerId, key, requestFingerprint: 'f', checkoutId: await checkoutIdFor(buyerId) },
    });

    expect(row.id).toBeTruthy();
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.requestFingerprint).toBe('f');
  });
});
