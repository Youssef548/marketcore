import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  CheckoutConflictReasons,
  CheckoutLineConflictDetailsSchema,
  ErrorCodes,
} from '@app/contracts';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { testPrisma } from '../support/db';
import { availableOf, bearer, cartWith, createProduct, createSeller, mintBuyers } from '../support/marketplace';

/**
 * AC-US-CHK-002-3 and SRS-NFR-REL-001 — the flagship race.
 *
 * One unit, one hundred buyers who all hold it in their carts, all placing the
 * order at once. Repeated twenty consecutive times with fresh rows, because a race
 * that passes once may simply not have interleaved (failure-scenarios §4).
 */
jest.setTimeout(600_000);

const RACE_RUNS = 20;
const RACERS = 100;
const PRICE_MINOR = 1000;

describe('the last unit (concurrency)', () => {
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

  it(`sells one unit exactly once to ${RACERS} concurrent buyers, ${RACE_RUNS} runs in a row`, async () => {
    for (let run = 1; run <= RACE_RUNS; run++) {
      const seller = await createSeller(`race${run}`);
      const product = await createProduct(seller.organizationId, { available: 1, priceMinor: PRICE_MINOR });
      const buyers = await mintBuyers(app, RACERS);
      await Promise.all(
        buyers.map((buyer) =>
          cartWith(buyer.id, [{ productId: product.id, quantity: 1, addedUnitPriceMinor: PRICE_MINOR }]),
        ),
      );
      const body = { lines: [{ productId: product.id, quantity: 1, unitPriceMinor: PRICE_MINOR }] };

      const responses = await Promise.all(
        buyers.map((buyer) => request(baseUrl).post('/api/v1/checkouts').set(bearer(buyer.token)).send(body)),
      );

      const statuses: Record<number, number> = {};
      for (const res of responses) statuses[res.status] = (statuses[res.status] ?? 0) + 1;
      // The run number travels with the assertion, so a failure names the run.
      expect({ run, statuses }).toEqual({ run, statuses: { 201: 1, 409: RACERS - 1 } });

      for (const loser of responses.filter((res) => res.status === 409)) {
        expect(loser.body.error.code).toBe(ErrorCodes.CONFLICT);
        // The 99 see "Sold out" (AC-US-CHK-002-3): the reason the web app branches on.
        expect(CheckoutLineConflictDetailsSchema.parse(loser.body.error.details).lines).toEqual([
          { productId: product.id, reason: CheckoutConflictReasons.SOLD_OUT, available: 0, currentUnitPriceMinor: PRICE_MINOR },
        ]);
      }

      expect({ run, available: await availableOf(product.id) }).toEqual({ run, available: 0 });
      expect(await testPrisma.orderItem.count({ where: { productId: product.id } })).toBe(1);
      expect(
        await testPrisma.checkout.count({ where: { orders: { some: { items: { some: { productId: product.id } } } } } }),
      ).toBe(1);
      // D57 for the losers: their carts are exactly as they were.
      expect(await testPrisma.cartItem.count({ where: { productId: product.id } })).toBe(RACERS - 1);
    }
  });
});
