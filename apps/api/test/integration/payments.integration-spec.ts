import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from '@jest/globals';
import { CurrencyCodes } from '@app/contracts';
import { testPrisma } from '../support/db';
import { createBuyer } from '../support/marketplace';

/**
 * The payment tables' rules, each proven by writing *around* the application — the week-2
 * pattern, because the question is what the database refuses, not what a service does.
 *
 * The two uniques are the whole of INV-3: one checkout has one payment, and one provider
 * operation cannot become two payments. The CHECKs are the money invariants a service
 * could otherwise store as nonsense: a non-positive amount, an attempt count below zero,
 * a refund with no reason, or a SUCCEEDED payment with no capture time.
 */
afterAll(async () => {
  await testPrisma.$disconnect();
});

const CONSTRAINTS = [
  'payments_checkoutId_key',
  'payments_providerRef_key',
  'payments_amount_positive',
  'payments_attempts_non_negative',
  'payments_refund_marked',
  'payments_captured_when_settled',
  'provider_charges_pkey',
  'provider_charges_amount_positive',
];

/** A checkout a payment may name, created the ordinary way. */
async function aCheckout(): Promise<string> {
  const buyer = await createBuyer();
  const checkout = await testPrisma.checkout.create({
    data: { buyerId: buyer.id, totalMinor: 24_900, currency: CurrencyCodes.EGP },
    select: { id: true },
  });
  return checkout.id;
}

const aPayment = (checkoutId: string) => ({
  checkoutId,
  amountMinor: 24_900,
  currency: CurrencyCodes.EGP,
});

describe('the payment tables (ADR 004, INV-3)', () => {
  /**
   * Prisma's `@@unique` becomes a unique *index* and its `@id` a primary-key *constraint*
   * with an index behind it, so both catalogues are asked and the two can both match one
   * name. The claim here is that the rule is installed, not that it has one spelling.
   */
  it.each(CONSTRAINTS)('%s is installed, not merely intended', async (name) => {
    const [row] = await testPrisma.$queryRaw<{ found: bigint }[]>`
      SELECT (
        (SELECT count(*) FROM pg_constraint WHERE conname = ${name}) +
        (SELECT count(*) FROM pg_indexes WHERE indexname = ${name})
      ) AS found
    `;
    expect(Number(row.found)).toBeGreaterThanOrEqual(1);
  });

  it('refuses a second payment for one checkout (INV-3)', async () => {
    const checkoutId = await aCheckout();
    await testPrisma.payment.create({ data: aPayment(checkoutId) });

    await expect(testPrisma.payment.create({ data: aPayment(checkoutId) })).rejects.toThrow(
      /Unique constraint failed/i,
    );
    expect(await testPrisma.payment.count({ where: { checkoutId } })).toBe(1);
  });

  it('refuses two payments carrying one provider reference', async () => {
    const first = await aCheckout();
    const second = await aCheckout();
    const providerRef = `sim_pay_${first}`;
    await testPrisma.payment.create({ data: { ...aPayment(first), providerRef } });

    await expect(
      testPrisma.payment.create({ data: { ...aPayment(second), providerRef } }),
    ).rejects.toThrow(/Unique constraint failed/i);
  });

  it('accepts two payments with no provider reference yet — NULLs are not a shared value', async () => {
    const first = await aCheckout();
    const second = await aCheckout();
    await testPrisma.payment.create({ data: aPayment(first) });
    await testPrisma.payment.create({ data: aPayment(second) });

    // Scoped to these two rows: other cases in this file leave NULL references behind, and
    // a count over the whole table would be measuring them.
    expect(
      await testPrisma.payment.count({ where: { checkoutId: { in: [first, second] }, providerRef: null } }),
    ).toBe(2);
  });

  it.each([
    ['a zero amount', { amountMinor: 0 }],
    ['a negative amount', { amountMinor: -1 }],
  ])('refuses %s (payments_amount_positive)', async (_label, override) => {
    const checkoutId = await aCheckout();

    await expect(
      testPrisma.payment.create({ data: { ...aPayment(checkoutId), ...override } }),
    ).rejects.toThrow(/payments_amount_positive/);
  });

  it('refuses a negative attempt count', async () => {
    const checkoutId = await aCheckout();

    await expect(
      testPrisma.payment.create({ data: { ...aPayment(checkoutId), attempts: -1 } }),
    ).rejects.toThrow(/payments_attempts_non_negative/);
  });

  it('refuses a reason on a payment that is not refunded', async () => {
    const checkoutId = await aCheckout();

    await expect(
      testPrisma.payment.create({
        data: { ...aPayment(checkoutId), status: 'FAILED', refundedReason: 'CHECKOUT_CANCELLED' },
      }),
    ).rejects.toThrow(/payments_refund_marked/);
  });

  it('refuses a refund with no reason — an unexplainable row in the books', async () => {
    const checkoutId = await aCheckout();

    await expect(
      testPrisma.payment.create({
        data: { ...aPayment(checkoutId), status: 'REFUNDED', capturedAt: new Date() },
      }),
    ).rejects.toThrow(/payments_refund_marked/);
  });

  it('accepts a refund that has both a reason and a capture time', async () => {
    const checkoutId = await aCheckout();

    const payment = await testPrisma.payment.create({
      data: {
        ...aPayment(checkoutId),
        status: 'REFUNDED',
        capturedAt: new Date(),
        refundedReason: 'CHECKOUT_CANCELLED',
      },
    });

    expect(payment.status).toBe('REFUNDED');
  });

  it("refuses a SUCCEEDED payment with no capture time — money cannot have moved without a moment", async () => {
    const checkoutId = await aCheckout();

    await expect(
      testPrisma.payment.create({ data: { ...aPayment(checkoutId), status: 'SUCCEEDED' } }),
    ).rejects.toThrow(/payments_captured_when_settled/);
  });

  it('refuses a capture time on a payment that has not settled', async () => {
    const checkoutId = await aCheckout();

    await expect(
      testPrisma.payment.create({ data: { ...aPayment(checkoutId), capturedAt: new Date() } }),
    ).rejects.toThrow(/payments_captured_when_settled/);
  });

  it('names a checkout that exists — the foreign key is immediate, unlike the idempotency claim', async () => {
    await expect(
      testPrisma.payment.create({ data: aPayment('00000000-0000-0000-0000-000000000000') }),
    ).rejects.toThrow(/foreign key constraint/i);
  });

  it('refuses the same provider operation twice (the simulator cannot charge twice)', async () => {
    // A fresh key per run: this database persists between runs, and a fixed one would be
    // refused by *this* test's own earlier row rather than by the second insert.
    const operationKey = `pay_${randomUUID()}`;
    const charge = {
      operationKey,
      providerRef: `sim_${operationKey}`,
      amountMinor: 24_900,
      currency: CurrencyCodes.EGP,
      capturedAt: new Date(),
    };
    await testPrisma.providerCharge.create({ data: charge });

    await expect(testPrisma.providerCharge.create({ data: charge })).rejects.toThrow(
      /Unique constraint failed/i,
    );
  });

  it('refuses a provider charge for a non-positive amount', async () => {
    await expect(
      testPrisma.providerCharge.create({
        data: {
          operationKey: `pay_${randomUUID()}`,
          providerRef: `sim_${randomUUID()}`,
          amountMinor: 0,
          currency: CurrencyCodes.EGP,
          capturedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/provider_charges_amount_positive/);
  });

  it('lets the database write PAID — the enum gained the state phase 6 enters', async () => {
    const checkoutId = await aCheckout();

    await testPrisma.checkout.update({ where: { id: checkoutId }, data: { status: 'PAID' } });

    expect((await testPrisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } })).status).toBe('PAID');
  });
});
