import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CurrencyCodes } from '@app/contracts';
import { providerOperationKey } from '@app/domain';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { testPrisma } from '../support/db';
import { bearer, createProduct, createSeller, mintBuyers } from '../support/marketplace';

/**
 * One checkout, fifty payments at once (INV-3, ADR 004).
 *
 * The claim's lock is released *before* the provider is called — that is the design, because a
 * network call must not be held inside a transaction — so fifty requests really can reach the
 * provider together. What stops that becoming fifty charges is the operation key: it is
 * derived from the checkout, so all fifty are the same provider operation and the store records
 * the charge once, answering the other forty-nine with the winner's reference.
 *
 * Ten consecutive runs with fresh rows, because a race that passes once may simply not have
 * interleaved.
 */
jest.setTimeout(600_000);

const RUNS = 10;
const RACERS = 50;
const AMOUNT_CAPTURED = 24_900;
const AMOUNT_TIMEOUT = 2_517;

describe('paying one checkout at once (concurrency)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  /** A buyer with a checkout of one order, built directly: this spec is about paying it. */
  async function aCheckout(label: string, totalMinor: number) {
    const [buyer] = await mintBuyers(app, 1);
    const seller = await createSeller(label);
    const product = await createProduct(seller.organizationId, { priceMinor: totalMinor });
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
    // An order with no items is not a checkout the wire contract will serialize, and the
    // route answers with the checkout — so the fixture has to be a real one.
    await testPrisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPriceMinor: totalMinor,
      },
    });
    return { buyer, checkoutId: checkout.id };
  }

  const pay = (token: string, checkoutId: string) =>
    request(baseUrl).post(`/api/v1/checkouts/${checkoutId}/pay`).set(bearer(token));

  it(`${RACERS} simultaneous payments charge once, ${RUNS} runs in a row`, async () => {
    for (let run = 1; run <= RUNS; run++) {
      const { buyer, checkoutId } = await aCheckout(`payrace${run}`, AMOUNT_CAPTURED);

      const responses = await Promise.all(
        Array.from({ length: RACERS }, () => pay(buyer.token, checkoutId)),
      );

      // The run number travels with every assertion, so a failure names the run.
      const refused = responses.filter((response) => response.status !== 200);
      expect({ run, refused: refused.map((r) => r.status) }).toEqual({ run, refused: [] });
      expect({ run, ids: new Set(responses.map((r) => r.body.id)).size }).toEqual({ run, ids: 1 });

      // One provider operation, however many requests reached it.
      expect({
        run,
        charges: await testPrisma.providerCharge.count({ where: { operationKey: providerOperationKey(checkoutId) } }),
      }).toEqual({ run, charges: 1 });
      expect({ run, payments: await testPrisma.payment.count({ where: { checkoutId } }) }).toEqual({
        run,
        payments: 1,
      });
      expect({
        run,
        unpaidOrders: await testPrisma.order.count({ where: { checkoutId, status: { not: 'PAID' } } }),
      }).toEqual({ run, unpaidOrders: 0 });
      expect({
        run,
        status: (await testPrisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } })).status,
      }).toEqual({ run, status: 'PAID' });
    }
  });

  it('never leaves a checkout half-settled when a cancellation lands mid-flight (SRS-FR-PAY-004)', async () => {
    // The cancellation is issued alongside the payments rather than from a provider stub, so
    // the two really do race. The branch taken depends on the interleaving; what must hold is
    // the invariant: either the charge settled and every order is paid, or it was refunded and
    // no order is — never a paid order beside a refunded payment, and never a paid checkout
    // with an order left behind.
    for (let run = 1; run <= RUNS; run++) {
      const { buyer, checkoutId } = await aCheckout(`paycancel${run}`, AMOUNT_TIMEOUT);

      const payments = Promise.all(Array.from({ length: 5 }, () => pay(buyer.token, checkoutId)));
      const cancellation = testPrisma.$transaction([
        testPrisma.checkout.update({ where: { id: checkoutId }, data: { status: 'CANCELLED' } }),
        testPrisma.order.updateMany({ where: { checkoutId }, data: { status: 'CANCELLED' } }),
      ]);
      const [responses] = await Promise.all([payments, cancellation]);

      // No 5xx, and every answer is one of the three the route documents.
      const statuses = responses.map((response) => response.status);
      expect({ run, unexpected: statuses.filter((status) => ![200, 409].includes(status)) }).toEqual({
        run,
        unexpected: [],
      });

      const checkout = await testPrisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } });
      // No row at all is a legitimate outcome: a request that found the checkout already
      // cancelled writes nothing, because refusing a checkout must not create a payment.
      const payment = await testPrisma.payment.findUnique({ where: { checkoutId } });
      const paidOrders = await testPrisma.order.count({ where: { checkoutId, status: 'PAID' } });
      const orders = await testPrisma.order.count({ where: { checkoutId } });

      if (payment?.status === 'SUCCEEDED') {
        expect({ run, checkout: checkout.status, paidOrders, orders }).toEqual({
          run,
          checkout: 'PAID',
          paidOrders: orders,
          orders,
        });
      } else {
        // REFUNDED (the charge landed on the cancelled checkout) or PROCESSING (the charge was
        // never confirmed). Either way no order may be paid.
        expect({ run, paidOrders }).toEqual({ run, paidOrders: 0 });
      }
    }
  });
});
