import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from '@jest/globals';
import { CurrencyCodes } from '@app/contracts';
import { testPrisma } from '../support/db';
import { createBuyer } from '../support/marketplace';
import type { IdempotencyScope } from '../../src/orders/interfaces/idempotency.interface';
import { IdempotencyClaimKinds } from '../../src/orders/orders.constants';
import { IdempotencyRepository } from '../../src/orders/repositories/idempotency.repository';

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

const repository = new IdempotencyRepository();

const aFingerprint = '{"lines":[{"productId":"p1","quantity":1,"unitPriceMinor":1000}]}';

/** A fresh buyer, a key nobody else holds, and the checkout id the caller minted. */
async function newScope(overrides: Partial<IdempotencyScope> = {}): Promise<IdempotencyScope> {
  const buyer = await createBuyer();
  return {
    buyerId: buyer.id,
    key: `key-${randomUUID()}`,
    requestFingerprint: aFingerprint,
    checkoutId: randomUUID(),
    ...overrides,
  };
}

/**
 * The caller's transaction (task 5 wires the real one): claim the key, then create the
 * checkout the claim names. On any outcome but CLAIMED there is nothing to create — and
 * returning early is what keeps a REPLAY from minting a second checkout.
 */
async function claimAndPlace(scope: IdempotencyScope) {
  return testPrisma.$transaction(async (tx) => {
    const claim = await repository.claim(tx, scope);
    if (claim.kind !== IdempotencyClaimKinds.CLAIMED) return claim;
    await tx.checkout.create({
      data: { id: scope.checkoutId, buyerId: scope.buyerId, totalMinor: 1000, currency: CurrencyCodes.EGP },
    });
    return claim;
  });
}

describe('IdempotencyRepository (ADR 003, D94–D100)', () => {
  it('claims a request key and names the checkout the caller minted', async () => {
    const scope = await newScope();

    expect(await claimAndPlace(scope)).toEqual({ kind: IdempotencyClaimKinds.CLAIMED });

    const row = await testPrisma.idempotencyKey.findUniqueOrThrow({
      where: { buyerId_key: { buyerId: scope.buyerId, key: scope.key } },
    });
    expect(row.checkoutId).toBe(scope.checkoutId);
    expect(row.requestFingerprint).toBe(scope.requestFingerprint);
    expect(await testPrisma.checkout.count({ where: { buyerId: scope.buyerId } })).toBe(1);
  });

  it('replays a repeat of the same request with the first checkout, and mints nothing', async () => {
    const scope = await newScope();
    await claimAndPlace(scope);

    // The retry carries its own freshly minted id; the row it finds is the answer.
    const retry = { ...scope, checkoutId: randomUUID() };

    expect(await claimAndPlace(retry)).toEqual({
      kind: IdempotencyClaimKinds.REPLAY,
      checkoutId: scope.checkoutId,
    });
    expect(await testPrisma.idempotencyKey.count({ where: { buyerId: scope.buyerId } })).toBe(1);
    expect(await testPrisma.checkout.count({ where: { buyerId: scope.buyerId } })).toBe(1);
  });

  it('refuses the same key under a different request, and leaves the first claim standing', async () => {
    const scope = await newScope();
    await claimAndPlace(scope);

    const changed = {
      ...scope,
      checkoutId: randomUUID(),
      requestFingerprint: aFingerprint.replace('1000', '2000'),
    };

    expect(await claimAndPlace(changed)).toEqual({ kind: IdempotencyClaimKinds.KEY_REUSED });

    const row = await testPrisma.idempotencyKey.findUniqueOrThrow({
      where: { buyerId_key: { buyerId: scope.buyerId, key: scope.key } },
    });
    expect(row.requestFingerprint).toBe(scope.requestFingerprint);
    expect(await testPrisma.checkout.count({ where: { buyerId: scope.buyerId } })).toBe(1);
  });

  it('releases a claim, leaving no row and a key that can be claimed again (D98)', async () => {
    const scope = await newScope();

    await testPrisma.$transaction(async (tx) => {
      expect(await repository.claim(tx, scope)).toEqual({ kind: IdempotencyClaimKinds.CLAIMED });
      await repository.release(tx, { buyerId: scope.buyerId, key: scope.key });
    });

    expect(await testPrisma.idempotencyKey.count({ where: { buyerId: scope.buyerId } })).toBe(0);
    expect(await claimAndPlace(scope)).toEqual({ kind: IdempotencyClaimKinds.CLAIMED });
    expect(await testPrisma.idempotencyKey.count({ where: { buyerId: scope.buyerId } })).toBe(1);
  });

  it('scopes a key to its buyer, so one key string serves two buyers (D99)', async () => {
    const key = `shared-${randomUUID()}`;
    const first = await newScope({ key });
    const second = await newScope({ key });

    expect((await claimAndPlace(first)).kind).toBe(IdempotencyClaimKinds.CLAIMED);
    expect((await claimAndPlace(second)).kind).toBe(IdempotencyClaimKinds.CLAIMED);
    expect(await testPrisma.idempotencyKey.count({ where: { key } })).toBe(2);
  });

  it('answers REPLAY for a repeat that arrives after the first request released nothing', async () => {
    const scope = await newScope();
    await claimAndPlace(scope);
    await claimAndPlace({ ...scope, checkoutId: randomUUID() });

    expect(await claimAndPlace({ ...scope, checkoutId: randomUUID() })).toEqual({
      kind: IdempotencyClaimKinds.REPLAY,
      checkoutId: scope.checkoutId,
    });
  });
});
