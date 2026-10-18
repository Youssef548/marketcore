import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  CheckoutKeyReusedDetailsSchema,
  CheckoutSchema,
  CurrencyCodes,
  ErrorCodes,
  IDEMPOTENCY_KEY_HEADER,
  type Checkout,
} from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { expectContract } from './support/contracts';
import { testPrisma } from './support/db';
import { newTenant, publishedProduct, tenantHeaders } from './support/fixtures';
import { availableOf, bearer, mintBuyers } from './support/marketplace';

/**
 * SRS-FR-CHK-008 on the wire: a retry is not a second checkout, and a key is not a lid.
 *
 * Every case here is observable from outside the API — status, body, and the rows the
 * request left behind — because the claim is a promise to the client, not an internal
 * implementation detail. The concurrency half (repeats that arrive together) is
 * `test/concurrency/idempotency.concurrency-spec.ts`.
 */
describe('idempotent checkout (e2e)', () => {
  let app: INestApplication;
  let seller: Awaited<ReturnType<typeof newTenant>>;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    seller = await newTenant(app, 'idem');
  });

  afterAll(async () => {
    await app.close();
    // This spec reads rows directly (the claim is a promise about what was written), so
    // it owns a client of its own — and closes it.
    await testPrisma.$disconnect();
  });

  type Line = { productId: string; quantity: number; unitPriceMinor: number };

  const buyer = async () => (await mintBuyers(app, 1))[0];
  const addToCart = (token: string, productId: string, quantity: number) =>
    request(server()).put(`/api/v1/cart/items/${productId}`).set(bearer(token)).send({ quantity }).expect(200);

  /** One attempt with the key the caller chose. `undefined` sends no header at all. */
  const place = (token: string, key: string | undefined, lines: Line[]) => {
    const call = request(server()).post('/api/v1/checkouts').set(bearer(token));
    return (key === undefined ? call : call.set(IDEMPOTENCY_KEY_HEADER, key)).send({ lines });
  };

  const checkoutIdOf = (body: unknown): string => expectContract(CheckoutSchema, body).id as string;

  /** A published product, a buyer's cart holding it, and the lines that match. */
  async function cartHolding(quantity: number, available = 5) {
    const b = await buyer();
    const product = await publishedProduct(app, seller, { priceMinor: 2_500, available });
    await addToCart(b.token, product.id, quantity);
    const lines: Line[] = [{ productId: product.id, quantity, unitPriceMinor: 2_500 }];
    return { b, product, lines };
  }

  it('answers a repeat with the checkout it already placed, and places nothing again (D95)', async () => {
    const { b, product, lines } = await cartHolding(2);
    const key = `key-${randomUUID()}`;

    const first = await place(b.token, key, lines).expect(201);
    const second = await place(b.token, key, lines).expect(201);

    expect(checkoutIdOf(second.body)).toBe(checkoutIdOf(first.body));
    expect(await testPrisma.checkout.count({ where: { buyerId: b.id } })).toBe(1);
    expect(await testPrisma.order.count({ where: { buyerId: b.id } })).toBe(1);
    expect(await availableOf(product.id)).toBe(3);
    expect(await testPrisma.cartItem.count({ where: { cart: { buyerId: b.id } } })).toBe(0);
  });

  it('replays after the cart was emptied, rather than refusing a cart that no longer exists', async () => {
    const { b, lines } = await cartHolding(1);
    const key = `key-${randomUUID()}`;

    const first = await place(b.token, key, lines).expect(201);
    // The control that makes this test mean something: the cart really is gone, so a
    // second attempt under a *new* key would be CART_CHANGED.
    expect(await testPrisma.cartItem.count({ where: { cart: { buyerId: b.id } } })).toBe(0);
    await place(b.token, `key-${randomUUID()}`, lines).expect(409);

    const replay = await place(b.token, key, lines).expect(201);
    expect(checkoutIdOf(replay.body)).toBe(checkoutIdOf(first.body));
    expect(await testPrisma.checkout.count({ where: { buyerId: b.id } })).toBe(1);
  });

  it('refuses the same key for a different request with 409 and details.reason KEY_REUSED (D95)', async () => {
    const { b, lines } = await cartHolding(2);
    const key = `key-${randomUUID()}`;
    await place(b.token, key, lines).expect(201);

    const changed = [{ ...lines[0], quantity: 1 }];
    const res = await place(b.token, key, changed).expect(409);

    expect(res.body.error.code).toBe(ErrorCodes.CONFLICT);
    expect(CheckoutKeyReusedDetailsSchema.parse(res.body.error.details)).toEqual({ reason: 'KEY_REUSED' });
    expect(await testPrisma.checkout.count({ where: { buyerId: b.id } })).toBe(1);
  });

  it('replays when the same lines arrive in another order (D96)', async () => {
    const b = await buyer();
    const first = await publishedProduct(app, seller, { priceMinor: 1_000 });
    const second = await publishedProduct(app, seller, { priceMinor: 2_000 });
    await addToCart(b.token, first.id, 1);
    await addToCart(b.token, second.id, 1);
    const key = `key-${randomUUID()}`;
    const lines: Line[] = [
      { productId: first.id, quantity: 1, unitPriceMinor: 1_000 },
      { productId: second.id, quantity: 1, unitPriceMinor: 2_000 },
    ];

    const placed = await place(b.token, key, lines).expect(201);
    const reversed = await place(b.token, key, [...lines].reverse()).expect(201);

    expect(checkoutIdOf(reversed.body)).toBe(checkoutIdOf(placed.body));
    expect(await testPrisma.checkout.count({ where: { buyerId: b.id } })).toBe(1);
  });

  it('a refused placement does not consume the key, so a fixed retry still works (D98)', async () => {
    const { b, product, lines } = await cartHolding(1, 1);
    const key = `key-${randomUUID()}`;

    await request(server())
      .put(`/api/v1/products/${product.id}/inventory`)
      .set(tenantHeaders(seller.accessToken, seller.organizationId))
      .send({ available: 0 })
      .expect(200);
    const refused = await place(b.token, key, lines).expect(409);
    expect(refused.body.error.code).toBe(ErrorCodes.CONFLICT);
    expect(await testPrisma.idempotencyKey.count({ where: { buyerId: b.id } })).toBe(0);

    await request(server())
      .put(`/api/v1/products/${product.id}/inventory`)
      .set(tenantHeaders(seller.accessToken, seller.organizationId))
      .send({ available: 5 })
      .expect(200);
    const placed = await place(b.token, key, lines).expect(201);

    expect(checkoutIdOf(placed.body)).toBeTruthy();
    expect(await testPrisma.checkout.count({ where: { buyerId: b.id } })).toBe(1);
  });

  it.each([
    ['missing', undefined],
    ['too long', 'A'.repeat(65)],
    ['with a space', 'has space'],
    ['with a slash', 'has/slash'],
  ])('refuses a %s key with 400 VALIDATION_ERROR and writes no key (D94)', async (_label, key) => {
    const { b, lines } = await cartHolding(1);

    const res = await place(b.token, key, lines).expect(400);

    expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(await testPrisma.idempotencyKey.count({ where: { buyerId: b.id } })).toBe(0);
    expect(await testPrisma.checkout.count({ where: { buyerId: b.id } })).toBe(0);
  });

  it('scopes the key to its buyer: one key string places two separate checkouts (D99)', async () => {
    const key = `shared-${randomUUID()}`;
    const firstBuyer = await cartHolding(1);
    const secondBuyer = await cartHolding(1);

    const first = await place(firstBuyer.b.token, key, firstBuyer.lines).expect(201);
    const second = await place(secondBuyer.b.token, key, secondBuyer.lines).expect(201);

    expect(checkoutIdOf(first.body)).not.toBe(checkoutIdOf(second.body));
    expect(await testPrisma.idempotencyKey.count({ where: { key } })).toBe(2);
  });

  it('reads back the replayed checkout through the detail route, not a frozen body', async () => {
    const { b, lines } = await cartHolding(1);
    const key = `key-${randomUUID()}`;
    const placed = await place(b.token, key, lines).expect(201);

    const replay = expectContract(CheckoutSchema, (await place(b.token, key, lines).expect(201)).body) as Checkout;
    const detail = expectContract(
      CheckoutSchema,
      (await request(server()).get(`/api/v1/checkouts/${placed.body.id}`).set(bearer(b.token)).expect(200)).body,
    );

    expect(replay).toEqual(detail);
    expect(replay.currency).toBe(CurrencyCodes.EGP);
  });

  it('answers 401 to a request with neither a token nor a key (the guard runs first)', async () => {
    const res = await request(server())
      .post('/api/v1/checkouts')
      .send({ lines: [{ productId: 'p', quantity: 1, unitPriceMinor: 100 }] })
      .expect(401);
    expect(res.body.error.code).toBe(ErrorCodes.UNAUTHORIZED);
  });
});
