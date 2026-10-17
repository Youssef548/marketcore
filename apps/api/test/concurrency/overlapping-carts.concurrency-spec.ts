import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { LogEvents } from '@app/runtime';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ORDERS_LOGGER } from '../../src/orders/orders.constants';
import { testPrisma } from '../support/db';
import { captureLogger } from '../support/logger';
import {
  availableOf,
  bearer,
  cartWith,
  createProduct,
  createSeller,
  mintBuyers,
  type ProductFixture,
} from '../support/marketplace';

/**
 * SRS-NFR-REL-002 and RISK-003: overlapping multi-seller checkouts never
 * deadlock-fail. Fifty buyers each want the same three products from three
 * sellers, each listing them in a different order. Ordered locks, not retries,
 * must be what makes this pass — so the suite also asserts zero retries.
 */
jest.setTimeout(600_000);

const BUYERS = 50;
const PRICE_MINOR = 500;
const ORDERINGS = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
] as const;

describe('overlapping carts (concurrency)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const logger = captureLogger();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ORDERS_LOGGER)
      .useValue(logger)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  async function race(stock: number) {
    const sellers = await Promise.all(['ova', 'ovb', 'ovc'].map(createSeller));
    const products: ProductFixture[] = await Promise.all(
      sellers.map((seller) => createProduct(seller.organizationId, { available: stock, priceMinor: PRICE_MINOR })),
    );
    const buyers = await mintBuyers(app, BUYERS);
    const linesFor = (i: number) =>
      ORDERINGS[i % ORDERINGS.length].map((index) => ({ productId: products[index].id, quantity: 1 }));

    await Promise.all(
      buyers.map((buyer, i) =>
        cartWith(buyer.id, linesFor(i).map((line) => ({ ...line, addedUnitPriceMinor: PRICE_MINOR }))),
      ),
    );
    const retriesBefore = logger.lines.filter((line) => line.event === LogEvents.CHECKOUT_TRANSACTION_RETRIED).length;

    const responses = await Promise.all(
      buyers.map((buyer, i) =>
        request(baseUrl)
          .post('/api/v1/checkouts')
          .set(bearer(buyer.token))
          .send({ lines: linesFor(i).map((line) => ({ ...line, unitPriceMinor: PRICE_MINOR })) }),
      ),
    );

    const retries = logger.lines.filter((line) => line.event === LogEvents.CHECKOUT_TRANSACTION_RETRIED).length - retriesBefore;
    return { products, responses, retries };
  }

  it('50 buyers, ample stock: all 50 succeed, no deadlock reaches anyone, no retry was needed', async () => {
    const { products, responses, retries } = await race(1000);

    expect(responses.map((res) => res.status).filter((status) => status !== 201)).toEqual([]);
    expect(retries).toBe(0);
    for (const product of products) expect(await availableOf(product.id)).toBe(1000 - BUYERS);
    expect(await testPrisma.order.count({ where: { items: { some: { productId: products[0].id } } } })).toBe(BUYERS);
  });

  it('50 buyers, stock 20: 20 succeed, 30 are refused with 409, nothing 5xx, stock exactly 0', async () => {
    const { products, responses, retries } = await race(20);

    const statuses = responses.map((res) => res.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(20);
    expect(statuses.filter((status) => status === 409)).toHaveLength(BUYERS - 20);
    expect(statuses.filter((status) => status >= 500)).toEqual([]);
    expect(retries).toBe(0);
    for (const product of products) expect(await availableOf(product.id)).toBe(0);
  });
});
