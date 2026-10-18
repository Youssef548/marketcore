import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IDEMPOTENCY_KEY_HEADER } from '@app/contracts';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { testPrisma } from '../support/db';
import { availableOf, bearer, cartWith, createProduct, createSeller, mintBuyers } from '../support/marketplace';

/**
 * SRS-FR-CHK-008 and INV-2 — the same key, arriving all at once.
 *
 * A double-click is not one request after another; it is two requests whose claims race
 * for the same unique index entry before either has committed. Two calls in sequence
 * would prove nothing about that: the second would read a committed row. So this spec
 * fires the same key at the same cart from one buyer, a hundred at a time, and asserts
 * the thing the client was promised — a hundred `201`s naming **one** checkout.
 *
 * What makes that a real claim is that the losers are not doing nothing: they block on
 * the uncommitted index entry, wake when the winner commits, read its row, and answer
 * from it. If the claim were taken after the locks instead of before them, or if the
 * read happened before the wait, this would leave several checkouts and fail the count.
 *
 * Ten consecutive runs with fresh rows, because a race that passes once may simply not
 * have interleaved (failure-scenarios §4) — the same reason the last-unit race repeats.
 */
jest.setTimeout(600_000);

const RUNS = 10;
const RACERS = 100;
const PRICE_MINOR = 1000;
const STOCK = 10;

describe('repeated key (concurrency)', () => {
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

  it(
    `${RACERS} simultaneous repeats of one key place one checkout, ${RUNS} runs in a row`,
    async () => {
      for (let run = 1; run <= RUNS; run++) {
        const sellers = await Promise.all([`idem${run}a`, `idem${run}b`].map(createSeller));
        const products = await Promise.all(
          sellers.map((seller) => createProduct(seller.organizationId, { available: STOCK, priceMinor: PRICE_MINOR })),
        );
        const [buyer] = await mintBuyers(app, 1);
        await cartWith(
          buyer.id,
          products.map((product) => ({
            productId: product.id,
            quantity: 1,
            addedUnitPriceMinor: PRICE_MINOR,
          })),
        );
        const lines = products.map((product) => ({
          productId: product.id,
          quantity: 1,
          unitPriceMinor: PRICE_MINOR,
        }));
        const key = `race-${run}`;

        const responses = await Promise.all(
          Array.from({ length: RACERS }, () =>
            request(baseUrl)
              .post('/api/v1/checkouts')
              .set(bearer(buyer.token))
              .set(IDEMPOTENCY_KEY_HEADER, key)
              .send({ lines }),
          ),
        );

        // The run number travels with every assertion, so a failure names the run.
        const notPlaced = responses.filter((response) => response.status !== 201);
        expect({ run, notPlaced: notPlaced.map((r) => r.status) }).toEqual({ run, notPlaced: [] });

        const ids = new Set(responses.map((response) => response.body.id));
        expect({ run, distinctCheckouts: ids.size }).toEqual({ run, distinctCheckouts: 1 });

        expect({ run, checkouts: await testPrisma.checkout.count({ where: { buyerId: buyer.id } }) }).toEqual({
          run,
          checkouts: 1,
        });
        // One order per seller, not one order per request.
        expect({ run, orders: await testPrisma.order.count({ where: { buyerId: buyer.id } }) }).toEqual({
          run,
          orders: sellers.length,
        });
        expect({ run, keys: await testPrisma.idempotencyKey.count({ where: { buyerId: buyer.id } }) }).toEqual({
          run,
          keys: 1,
        });
        expect({ run, cart: await testPrisma.cartItem.count({ where: { cart: { buyerId: buyer.id } } }) }).toEqual({
          run,
          cart: 0,
        });
        // The stock moved once, which is the effect the 100 answers describe.
        for (const product of products) {
          expect({ run, product: product.id, available: await availableOf(product.id) }).toEqual({
            run,
            product: product.id,
            available: STOCK - 1,
          });
        }
      }
    },
  );

  it('does not confuse one key with another: two keys racing on one cart place one checkout', async () => {
    // Two *different* keys are two attempts, and the cart is the arbiter for those: the
    // first empties it and the second is refused CART_CHANGED, not replayed. This is the
    // control the case above needs — otherwise "one checkout" could be a cart that only
    // one request could ever use.
    const seller = await createSeller('idemdup');
    const product = await createProduct(seller.organizationId, { available: STOCK, priceMinor: PRICE_MINOR });
    const [buyer] = await mintBuyers(app, 1);
    await cartWith(buyer.id, [{ productId: product.id, quantity: 1, addedUnitPriceMinor: PRICE_MINOR }]);
    const body = { lines: [{ productId: product.id, quantity: 1, unitPriceMinor: PRICE_MINOR }] };

    const responses = await Promise.all([
      request(baseUrl).post('/api/v1/checkouts').set(bearer(buyer.token)).set(IDEMPOTENCY_KEY_HEADER, 'dup-a').send(body),
      request(baseUrl).post('/api/v1/checkouts').set(bearer(buyer.token)).set(IDEMPOTENCY_KEY_HEADER, 'dup-b').send(body),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await testPrisma.checkout.count({ where: { buyerId: buyer.id } })).toBe(1);
    expect(await testPrisma.idempotencyKey.count({ where: { buyerId: buyer.id } })).toBe(1);
  });
});
