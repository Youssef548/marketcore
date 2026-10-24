import { afterAll, describe, expect, it } from '@jest/globals';
import { CurrencyCodes, OrderStatuses } from '@app/contracts';
import { SimulatorVerdicts, buildBuyerContext, providerOperationKey, simulatedProviderRef } from '@app/domain';
import type { PrismaService } from '@app/runtime';
import { PaymentService } from '../../src/payments/payment.service';
import { PayCheckoutOutcomes } from '../../src/payments/payments.constants';
import type { PaymentProvider } from '../../src/payments/interfaces/payment-provider.interface';
import { PaymentRepository } from '../../src/payments/repositories/payment.repository';
import { SimulatorPaymentProvider } from '../../src/payments/simulator-payment.provider';
import { ProviderChargeRepository } from '../../src/payments/repositories/provider-charge.repository';
import { testPrisma } from '../support/db';
import { captureLogger } from '../support/logger';
import { createBuyer, createSeller } from '../support/marketplace';

/**
 * Capture against real PostgreSQL: what the two transactions do to rows.
 *
 * The unit spec proves the service's decisions against fakes. This proves the parts a fake
 * cannot: that tx A's lock and tx B's re-read actually serialize and actually notice a
 * cancellation, and that a refusal leaves the database exactly as it found it.
 *
 * The cancellation is injected *between* the transactions by wrapping the provider — which
 * is the point of the provider being between them. A test that cancelled the checkout
 * before or after the whole capture would be testing a different case.
 */
afterAll(async () => {
  await testPrisma.$disconnect();
});

const repository = new PaymentRepository(testPrisma as unknown as PrismaService);
const store = new ProviderChargeRepository(testPrisma as unknown as PrismaService);
const simulator = new SimulatorPaymentProvider(store);
const logger = captureLogger();

const serviceWith = (provider: PaymentProvider) => new PaymentService(repository, provider, logger);

/** A checkout of one order, with a total that decides the simulator's verdict (ADR 004). */
async function aCheckout(totalMinor: number) {
  const seller = await createSeller('paycap');
  const buyer = await createBuyer();
  const checkout = await testPrisma.checkout.create({
    data: { buyerId: buyer.id, totalMinor, currency: CurrencyCodes.EGP },
    select: { id: true },
  });
  const order = await testPrisma.order.create({
    data: {
      checkoutId: checkout.id,
      organizationId: seller.organizationId,
      buyerId: buyer.id,
      totalMinor,
      currency: CurrencyCodes.EGP,
    },
    select: { id: true },
  });
  return { buyerId: buyer.id, checkoutId: checkout.id, orderId: order.id, buyer: buildBuyerContext(buyer.id) };
}

const AMOUNT_CAPTURED = 24_900;
const AMOUNT_DECLINED = 1_013;
const AMOUNT_TIMEOUT = 2_517;

describe('capturing a checkout (SRS-FR-PAY-001/003/004)', () => {
  it('pays the checkout and every one of its orders in one transaction, for the checkout total', async () => {
    const { buyer, checkoutId, orderId } = await aCheckout(AMOUNT_CAPTURED);

    const outcome = await serviceWith(simulator).pay(buyer, checkoutId, 'req_1');

    expect(outcome).toEqual({ kind: PayCheckoutOutcomes.PAID });
    const checkout = await testPrisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } });
    const order = await testPrisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const payment = await testPrisma.payment.findUniqueOrThrow({ where: { checkoutId } });
    expect(checkout.status).toBe('PAID');
    expect(order.status).toBe('PAID');
    expect(payment).toMatchObject({
      status: 'SUCCEEDED',
      amountMinor: AMOUNT_CAPTURED,
      providerRef: simulatedProviderRef(providerOperationKey(checkoutId)),
      attempts: 1,
    });
    expect(payment.capturedAt).toBeInstanceOf(Date);
  });

  it('does not resurrect a cancelled order when its checkout is paid', async () => {
    const { buyer, checkoutId, orderId } = await aCheckout(AMOUNT_CAPTURED);
    // A diverged order: terminal, while its checkout is still payable. This cannot be
    // produced by the worker (it cancels checkout and orders together), so it is the
    // exact state a future partial-refund or admin path could leave behind.
    await testPrisma.order.update({ where: { id: orderId }, data: { status: OrderStatuses.CANCELLED } });

    expect(await serviceWith(simulator).pay(buyer, checkoutId, 'req_0')).toEqual({
      kind: PayCheckoutOutcomes.PAID,
    });

    const checkout = await testPrisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } });
    const order = await testPrisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(checkout.status).toBe('PAID');
    expect(order.status).toBe(OrderStatuses.CANCELLED);
  });

  it('leaves a declined checkout payable, records FAILED, and counts the next attempt on the same row', async () => {
    const { buyer, checkoutId, orderId } = await aCheckout(AMOUNT_DECLINED);

    expect(await serviceWith(simulator).pay(buyer, checkoutId, 'req_2')).toEqual({
      kind: PayCheckoutOutcomes.DECLINED,
    });
    const afterFirst = await testPrisma.payment.findUniqueOrThrow({ where: { checkoutId } });
    expect(afterFirst).toMatchObject({ status: 'FAILED', attempts: 1, providerRef: null });
    expect((await testPrisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } })).status).toBe(
      'PENDING_PAYMENT',
    );
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING_PAYMENT');

    // One checkout has one payment (INV-3), so a second attempt is the same row, counted.
    expect(await serviceWith(simulator).pay(buyer, checkoutId, 'req_3')).toEqual({
      kind: PayCheckoutOutcomes.DECLINED,
    });
    const afterSecond = await testPrisma.payment.findUniqueOrThrow({ where: { checkoutId } });
    expect(afterSecond.id).toBe(afterFirst.id);
    expect(afterSecond.attempts).toBe(2);
  });

  it('refunds a charge whose checkout the worker cancelled while it was in flight (SRS-FR-PAY-004)', async () => {
    const { buyer, checkoutId, orderId } = await aCheckout(AMOUNT_CAPTURED);
    // The provider records a charge and, before answering, the checkout is cancelled — the
    // window between tx A and tx B, which is the only place this case exists.
    const cancellationInFlight: PaymentProvider = {
      capture: async (request) => {
        // What the worker's cancel does: the checkout and every one of its orders, together.
        await testPrisma.$transaction([
          testPrisma.checkout.update({ where: { id: checkoutId }, data: { status: 'CANCELLED' } }),
          testPrisma.order.updateMany({ where: { checkoutId }, data: { status: 'CANCELLED' } }),
        ]);
        return {
          kind: SimulatorVerdicts.CAPTURED,
          providerRef: simulatedProviderRef(request.operationKey),
          capturedAt: new Date(),
        };
      },
      lookup: async () => null,
    };

    expect(await serviceWith(cancellationInFlight).pay(buyer, checkoutId, 'req_4')).toEqual({
      kind: PayCheckoutOutcomes.CANCELLED,
    });

    const payment = await testPrisma.payment.findUniqueOrThrow({ where: { checkoutId } });
    expect(payment).toMatchObject({ status: 'REFUNDED', refundedReason: 'CHECKOUT_CANCELLED' });
    // The refunded row still carries when the money moved, because it did.
    expect(payment.capturedAt).toBeInstanceOf(Date);
    expect(payment.providerRef).toBe(simulatedProviderRef(providerOperationKey(checkoutId)));
    const order = await testPrisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('CANCELLED');
    expect((await testPrisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } })).status).toBe('CANCELLED');
  });

  it('refunds a charge an earlier attempt left behind when the checkout is already cancelled (D107, D112)', async () => {
    const { buyer, checkoutId } = await aCheckout(AMOUNT_CAPTURED);
    const operationKey = providerOperationKey(checkoutId);
    // An earlier attempt charged and timed out, and the process died before tx B: the charge
    // is on the provider's side and our payment row is still PROCESSING — the state that says
    // "we never found out". Both rows are built directly, because calling pay() now would
    // *resolve* that state (the store answers CAPTURED and tx B settles), which is the retry
    // working rather than the case under test.
    await store.record({
      operationKey,
      providerRef: simulatedProviderRef(operationKey),
      amountMinor: AMOUNT_CAPTURED,
      currency: CurrencyCodes.EGP,
      capturedAt: new Date(),
    });
    await testPrisma.payment.create({
      data: { checkoutId, amountMinor: AMOUNT_CAPTURED, currency: CurrencyCodes.EGP, attempts: 1 },
    });

    // The worker cancels it, and now nothing may charge — but the money that moved must go back.
    await testPrisma.checkout.update({ where: { id: checkoutId }, data: { status: 'CANCELLED' } });
    const neverCharges = {
      capture: async () => {
        throw new Error('a cancelled checkout must never be charged');
      },
      lookup: (key: string) => simulator.lookup(key),
    } satisfies PaymentProvider;

    expect(await serviceWith(neverCharges).pay(buyer, checkoutId, 'req_6')).toEqual({
      kind: PayCheckoutOutcomes.CANCELLED,
    });
    expect(await testPrisma.payment.findUniqueOrThrow({ where: { checkoutId } })).toMatchObject({
      status: 'REFUNDED',
      refundedReason: 'CHECKOUT_CANCELLED',
    });
  });

  it('never reaches the provider for a checkout cancelled before any charge, and records nothing', async () => {
    const { buyer, checkoutId } = await aCheckout(AMOUNT_CAPTURED);
    await testPrisma.checkout.update({ where: { id: checkoutId }, data: { status: 'CANCELLED' } });
    const neverCharges = {
      capture: async () => {
        throw new Error('a cancelled checkout must never be charged');
      },
      lookup: async () => null,
    } satisfies PaymentProvider;

    expect(await serviceWith(neverCharges).pay(buyer, checkoutId, 'req_7')).toEqual({
      kind: PayCheckoutOutcomes.CANCELLED,
    });
    expect(await testPrisma.payment.count({ where: { checkoutId } })).toBe(0);
    expect(await testPrisma.providerCharge.count({ where: { operationKey: providerOperationKey(checkoutId) } })).toBe(0);
  });

  it('leaves a timed-out charge PROCESSING with nothing settled, so the next attempt can resolve it', async () => {
    const { buyer, checkoutId } = await aCheckout(AMOUNT_TIMEOUT);

    expect(await serviceWith(simulator).pay(buyer, checkoutId, 'req_8')).toEqual({
      kind: PayCheckoutOutcomes.PENDING,
    });
    expect(await testPrisma.payment.findUniqueOrThrow({ where: { checkoutId } })).toMatchObject({
      status: 'PROCESSING',
    });
    expect((await testPrisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } })).status).toBe('PENDING_PAYMENT');
    // The charge exists on the provider's side; only the answer was lost.
    expect(await testPrisma.providerCharge.count({ where: { operationKey: providerOperationKey(checkoutId) } })).toBe(1);

    // And the retry settles on the charge that already happened rather than making a second.
    expect(await serviceWith(simulator).pay(buyer, checkoutId, 'req_9')).toEqual({
      kind: PayCheckoutOutcomes.PAID,
    });
    expect(await testPrisma.providerCharge.count({ where: { operationKey: providerOperationKey(checkoutId) } })).toBe(1);
  });

  it("answers another buyer's checkout as unknown, charging nothing (INV-12)", async () => {
    const { checkoutId } = await aCheckout(AMOUNT_CAPTURED);
    const stranger = await createBuyer();

    await expect(
      serviceWith(simulator).pay(buildBuyerContext(stranger.id), checkoutId, 'req_10'),
    ).rejects.toThrow(/not found/i);
    expect(await testPrisma.payment.count({ where: { checkoutId } })).toBe(0);
    expect(await testPrisma.providerCharge.count({ where: { operationKey: providerOperationKey(checkoutId) } })).toBe(0);
  });
});
