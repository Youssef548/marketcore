import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CheckoutStatuses, OrderStatuses } from '@app/contracts';
import { PrismaClient } from '@app/database';
import { AUTO_CANCEL_BATCH_SIZE, CHECKOUT_PAYMENT_WINDOW_MS } from '@app/domain';
import { AutoCancelJob } from '../src/auto-cancel/auto-cancel.job';
import { AutoCancelRepository } from '../src/auto-cancel/auto-cancel.repository';
import { LONG_AGO, availableOf, placedCheckout, prisma, stockedProduct, type ProductFixture } from './support/fixtures';
import { captureLogger } from './support/logger';

const policy = { windowMs: CHECKOUT_PAYMENT_WINDOW_MS, batchSize: AUTO_CANCEL_BATCH_SIZE };
const MINUTE = 60_000;

// Two clients, two pools: the "two workers" of INV-15 are two processes' worth of connections.
const prismaA = new PrismaClient();
const prismaB = new PrismaClient();
const jobOn = (client: PrismaClient, batchSize = policy.batchSize) =>
  new AutoCancelJob(new AutoCancelRepository(client), captureLogger(), { ...policy, batchSize });

async function drain(): Promise<void> {
  // The database is shared with the API suites, which leave PENDING_PAYMENT
  // checkouts behind. Clear the due backlog so each case reasons about its own rows.
  const job = jobOn(prisma);
  while ((await job.run()).cancelled > 0) {
    /* keep going until nothing is due */
  }
}

async function tenExpiredCheckouts() {
  const p1 = await stockedProduct(100);
  const p2 = await stockedProduct(100);
  const p3 = await stockedProduct(100, p1.organizationId);
  const ordered = new Map<string, number>([[p1.id, 0], [p2.id, 0], [p3.id, 0]]);
  const checkoutIds: string[] = [];

  for (let i = 0; i < 10; i++) {
    const lines: { product: ProductFixture; quantity: number }[] = [
      { product: p1, quantity: 1 + (i % 3) },
      { product: p2, quantity: 1 },
      ...(i % 2 === 0 ? [{ product: p3, quantity: 2 }] : []),
    ];
    for (const line of lines) ordered.set(line.product.id, (ordered.get(line.product.id) ?? 0) + line.quantity);
    checkoutIds.push((await placedCheckout(LONG_AGO(i), lines)).checkoutId);
  }

  const before = new Map<string, number>();
  for (const id of ordered.keys()) before.set(id, await availableOf(id));
  return { checkoutIds, ordered, before };
}

async function expectCancelledAndRestoredOnce(fixture: Awaited<ReturnType<typeof tenExpiredCheckouts>>) {
  const checkouts = await prisma.checkout.findMany({
    where: { id: { in: fixture.checkoutIds } },
    include: { orders: true },
  });
  expect(checkouts.every((c) => c.status === CheckoutStatuses.CANCELLED)).toBe(true);
  expect(checkouts.flatMap((c) => c.orders).every((o) => o.status === OrderStatuses.CANCELLED)).toBe(true);
  for (const [productId, quantity] of fixture.ordered) {
    expect({ productId, available: await availableOf(productId) }).toEqual({
      productId,
      available: (fixture.before.get(productId) ?? 0) + quantity,
    });
  }
}

beforeAll(drain);

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), prismaA.$disconnect(), prismaB.$disconnect()]);
});

describe('auto-cancel (worker integration)', () => {
  it('two runs in parallel over 10 expired checkouts restore each product exactly once (SRS-NFR-REL-003, INV-15)', async () => {
    const fixture = await tenExpiredCheckouts();

    const [a, b] = await Promise.all([jobOn(prismaA).run(), jobOn(prismaB).run()]);

    expect(a.cancelled + b.cancelled).toBeGreaterThanOrEqual(10);
    await expectCancelledAndRestoredOnce(fixture);

    // A third run finds nothing of ours and changes nothing.
    await jobOn(prismaA).run();
    await expectCancelledAndRestoredOnce(fixture);
  });

  it('interleaved one-at-a-time runs in parallel still restore exactly once (SKIP LOCKED under contention)', async () => {
    const fixture = await tenExpiredCheckouts();
    const loop = async (client: PrismaClient) => {
      const job = jobOn(client, 1);
      while ((await job.run()).cancelled > 0) {
        /* one checkout per run, racing the other loop */
      }
    };

    await Promise.all([loop(prismaA), loop(prismaB)]);

    await expectCancelledAndRestoredOnce(fixture);
  });

  it('cancels at 31 minutes and leaves 29 minutes alone (D70)', async () => {
    const product = await stockedProduct(10);
    const due = await placedCheckout(new Date(Date.now() - 31 * MINUTE), [{ product, quantity: 1 }]);
    const notYet = await placedCheckout(new Date(Date.now() - 29 * MINUTE), [{ product, quantity: 2 }]);

    await jobOn(prisma).run();

    expect((await prisma.checkout.findUniqueOrThrow({ where: { id: due.checkoutId } })).status).toBe(CheckoutStatuses.CANCELLED);
    expect((await prisma.checkout.findUniqueOrThrow({ where: { id: notYet.checkoutId } })).status).toBe(
      CheckoutStatuses.PENDING_PAYMENT,
    );
    expect(await availableOf(product.id)).toBe(10 - 2); // the due unit came back; the pending two did not
  });

  it('never touches a checkout that is no longer PENDING_PAYMENT (SRS-FR-CXL-003)', async () => {
    const product = await stockedProduct(10);
    const { checkoutId } = await placedCheckout(LONG_AGO(100), [{ product, quantity: 3 }]);
    // Stand-in for "a payment won the race": phase 6 makes this PAID; today the only
    // other state is CANCELLED, already restocked by whoever cancelled it.
    await prisma.checkout.update({ where: { id: checkoutId }, data: { status: CheckoutStatuses.CANCELLED } });

    await jobOn(prisma).run();

    expect(await availableOf(product.id)).toBe(7);
  });

  it('skips a checkout another transaction holds, without waiting for it, and cancels it on the next run', async () => {
    const product = await stockedProduct(10);
    const { checkoutId } = await placedCheckout(LONG_AGO(200), [{ product, quantity: 1 }]);

    let release!: () => void;
    let locked!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const holder = prismaB.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM checkouts WHERE id = ${checkoutId} FOR UPDATE`;
        locked();
        await held;
      },
      { timeout: 20_000 },
    );

    try {
      await isLocked;
      const started = Date.now();
      await jobOn(prismaA).run();
      expect(Date.now() - started).toBeLessThan(5_000); // skipped, not waited on
      expect((await prisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } })).status).toBe(
        CheckoutStatuses.PENDING_PAYMENT,
      );
    } finally {
      release();
      await holder;
    }

    await jobOn(prismaA).run();
    expect((await prisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } })).status).toBe(CheckoutStatuses.CANCELLED);
    expect(await availableOf(product.id)).toBe(10);
  });

  it('a worker that was down for hours cancels the backlog on its first run (failure-scenarios: worker down)', async () => {
    const product = await stockedProduct(10);
    const { checkoutId } = await placedCheckout(new Date(Date.now() - 6 * 60 * MINUTE), [{ product, quantity: 4 }]);

    // A freshly constructed job is a restarted worker; startInterval runs it at once (Task 17).
    await jobOn(prisma).run();

    expect((await prisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } })).status).toBe(CheckoutStatuses.CANCELLED);
    expect(await availableOf(product.id)).toBe(10);
  });
});
