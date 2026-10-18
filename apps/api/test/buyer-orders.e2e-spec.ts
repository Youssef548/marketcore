import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  BUYER_ORDERS_PAGE_SIZE,
  BuyerOrderPageSchema,
  BuyerOrderSchema,
  ErrorCodes,
  OrderStatuses,
} from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { expectContract } from './support/contracts';
import { bearer, createProduct, createSeller, mintBuyers, placedOrder } from './support/marketplace';

/** AC-US-BORD-001-1, AC-US-BORD-002-1, SRS-NFR-SEC-002 (INV-12). */
describe('buyer orders (e2e)', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const list = async (token: string, cursor?: string) =>
    expectContract(
      BuyerOrderPageSchema,
      (
        await request(server())
          .get('/api/v1/buyer/orders')
          .query(cursor === undefined ? {} : { cursor })
          .set(bearer(token))
          .expect(200)
      ).body,
    );

  it("lists only the caller's orders (AC-US-BORD-001-1)", async () => {
    const [x, y] = await mintBuyers(app, 2);
    const seller = await createSeller('bord');
    const product = await createProduct(seller.organizationId, { name: 'Y only widget' });
    const mine = await placedOrder(x.id, product);
    const theirs = await placedOrder(y.id, product);

    const page = await list(x.token);
    expect(page.items.map((order) => order.id)).toEqual([mine.orderId]);
    expect(page.items.map((order) => order.id)).not.toContain(theirs.orderId);
  });

  it("answers 404 for another buyer's order, with no data, and 200 for one's own (AC-US-BORD-002-1)", async () => {
    const [x, y] = await mintBuyers(app, 2);
    const seller = await createSeller('bordd');
    const product = await createProduct(seller.organizationId, { name: 'Private purchase', priceMinor: 18_900 });
    const theirs = await placedOrder(y.id, product, 2);

    const res = await request(server()).get(`/api/v1/buyer/orders/${theirs.orderId}`).set(bearer(x.token)).expect(404);
    expect(res.body.error.code).toBe(ErrorCodes.NOT_FOUND);
    expect(JSON.stringify(res.body)).not.toContain('Private purchase');

    // Control: the owner reads every field SRS-FR-BORD-002 names.
    const own = await request(server()).get(`/api/v1/buyer/orders/${theirs.orderId}`).set(bearer(y.token)).expect(200);
    expect(expectContract(BuyerOrderSchema, own.body)).toEqual({
      id: theirs.orderId,
      checkoutId: theirs.checkoutId,
      status: OrderStatuses.PENDING_PAYMENT,
      totalMinor: 37_800,
      currency: product.currency,
      createdAt: expect.any(String),
      seller: { name: seller.name, slug: seller.slug },
      items: [{ productId: product.id, name: 'Private purchase', quantity: 2, unitPriceMinor: 18_900 }],
    });
  });

  it('lists newest first, 20 per page, without overlap (SRS-FR-BORD-001, D89)', async () => {
    const [x] = await mintBuyers(app, 1);
    const seller = await createSeller('bordp');
    const product = await createProduct(seller.organizationId);
    const created: string[] = [];
    for (let i = 0; i <= BUYER_ORDERS_PAGE_SIZE; i++) created.push((await placedOrder(x.id, product)).orderId);

    const first = await list(x.token);
    expect(first.items).toHaveLength(BUYER_ORDERS_PAGE_SIZE);
    expect(first.items[0].id).toBe(created[created.length - 1]);
    const second = await list(x.token, first.nextCursor!);
    expect(second.items.map((order) => order.id)).toEqual([created[0]]);
    expect(second.nextCursor).toBeNull();
  });

  it('requires a signed-in user', async () => {
    await request(server()).get('/api/v1/buyer/orders').expect(401);
  });
});
