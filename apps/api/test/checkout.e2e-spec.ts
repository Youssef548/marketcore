import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  CartSchema,
  CheckoutCartChangedDetailsSchema,
  CheckoutConflictReasons,
  CheckoutLineConflictDetailsSchema,
  CheckoutSchema,
  CheckoutStatuses,
  CurrencyCodes,
  ErrorCodes,
} from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { expectContract } from './support/contracts';
import { testPrisma } from './support/db';
import { newTenant, publishedProduct, tenantHeaders } from './support/fixtures';
import { availableOf, bearer, mintBuyers } from './support/marketplace';

describe('checkout (e2e)', () => {
  let app: INestApplication;
  let sellerA: Awaited<ReturnType<typeof newTenant>>;
  let sellerB: Awaited<ReturnType<typeof newTenant>>;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    sellerA = await newTenant(app, 'chka');
    sellerB = await newTenant(app, 'chkb');
  });

  afterAll(async () => {
    await app.close();
  });

  const buyer = async () => (await mintBuyers(app, 1))[0];
  const addToCart = (token: string, productId: string, quantity: number) =>
    request(server()).put(`/api/v1/cart/items/${productId}`).set(bearer(token)).send({ quantity }).expect(200);
  const place = (token: string, lines: { productId: string; quantity: number; unitPriceMinor: number }[]) =>
    request(server()).post('/api/v1/checkouts').set(bearer(token)).send({ lines });

  it('places one checkout of one order per seller and empties the cart (D56, SRS-FR-CHK-004)', async () => {
    const b = await buyer();
    const a1 = await publishedProduct(app, sellerA, { priceMinor: 24_900, available: 3 });
    const b1 = await publishedProduct(app, sellerB, { priceMinor: 18_900, available: 3 });
    await addToCart(b.token, a1.id, 1);
    await addToCart(b.token, b1.id, 1);

    const res = await place(b.token, [
      { productId: a1.id, quantity: 1, unitPriceMinor: 24_900 },
      { productId: b1.id, quantity: 1, unitPriceMinor: 18_900 },
    ]).expect(201);

    const checkout = expectContract(CheckoutSchema, res.body);
    expect(checkout).toMatchObject({ status: CheckoutStatuses.PENDING_PAYMENT, totalMinor: 43_800, currency: CurrencyCodes.EGP });
    expect(checkout.orders.map((order) => order.seller.slug).sort()).toEqual([sellerA.slug, sellerB.slug].sort());
    const cart = expectContract(CartSchema, (await request(server()).get('/api/v1/cart').set(bearer(b.token)).expect(200)).body);
    expect(cart).toEqual({ sellers: [] });
    expect(await availableOf(a1.id)).toBe(2);
  });

  it('refuses a price that rose since it was confirmed, with old and new visible to the client (AC-US-CHK-001-1)', async () => {
    const b = await buyer();
    const a1 = await publishedProduct(app, sellerA, { priceMinor: 1000 });
    await addToCart(b.token, a1.id, 1);
    await request(server())
      .patch(`/api/v1/products/${a1.id}`)
      .set(tenantHeaders(sellerA.accessToken, sellerA.organizationId))
      .send({ priceMinor: 1200 })
      .expect(204);

    const res = await place(b.token, [{ productId: a1.id, quantity: 1, unitPriceMinor: 1000 }]).expect(409);

    expect(res.body.error.code).toBe(ErrorCodes.CONFLICT);
    expect(CheckoutLineConflictDetailsSchema.parse(res.body.error.details).lines).toEqual([
      { productId: a1.id, reason: CheckoutConflictReasons.PRICE_CHANGED, available: 5, currentUnitPriceMinor: 1200 },
    ]);
    expect(await testPrisma.checkout.count({ where: { buyerId: b.id } })).toBe(0);
  });

  it('refuses a sold-out line and leaves the cart as it was (D59, SRS-FR-CHK-007)', async () => {
    const b = await buyer();
    const a1 = await publishedProduct(app, sellerA, { available: 1 });
    await addToCart(b.token, a1.id, 1);
    await request(server())
      .put(`/api/v1/products/${a1.id}/inventory`)
      .set(tenantHeaders(sellerA.accessToken, sellerA.organizationId))
      .send({ available: 0 })
      .expect(200);

    const res = await place(b.token, [{ productId: a1.id, quantity: 1, unitPriceMinor: a1.priceMinor }]).expect(409);

    expect(CheckoutLineConflictDetailsSchema.parse(res.body.error.details).lines[0].reason).toBe(CheckoutConflictReasons.SOLD_OUT);
    expect(await testPrisma.cartItem.count({ where: { cart: { buyerId: b.id } } })).toBe(1);
  });

  it('refuses mixed currencies with 400 before taking any lock (AC-US-CHK-002-5, SRS-FR-CHK-005)', async () => {
    const b = await buyer();
    const egp = await publishedProduct(app, sellerA, { currency: CurrencyCodes.EGP });
    const usd = await publishedProduct(app, sellerB, { currency: CurrencyCodes.USD });
    await addToCart(b.token, egp.id, 1);
    await addToCart(b.token, usd.id, 1);

    // Hold egp's inventory row locked from outside. If the service took a lock
    // before refusing, this request would block on that lock and time out.
    let release!: () => void;
    let locked!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const holder = testPrisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM inventory WHERE "productId" = ${egp.id} FOR UPDATE`;
        locked();
        await held;
      },
      { timeout: 20_000 },
    );

    try {
      await isLocked;
      const res = await place(b.token, [
        { productId: egp.id, quantity: 1, unitPriceMinor: egp.priceMinor },
        { productId: usd.id, quantity: 1, unitPriceMinor: usd.priceMinor },
      ])
        .timeout(5_000)
        .expect(400);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    } finally {
      release();
      await holder;
    }
  });

  it('refuses lines that are not the cart with 409 CART_CHANGED (SRS-FR-CHK-006)', async () => {
    const b = await buyer();
    const a1 = await publishedProduct(app, sellerA);
    await addToCart(b.token, a1.id, 1);

    const res = await place(b.token, [{ productId: a1.id, quantity: 2, unitPriceMinor: a1.priceMinor }]).expect(409);
    expect(CheckoutCartChangedDetailsSchema.parse(res.body.error.details)).toEqual({ reason: 'CART_CHANGED' });
  });

  it.each([
    { lines: [] },
    { lines: [{ productId: 'p', quantity: 11, unitPriceMinor: 100 }] },
    { lines: [{ productId: 'p', quantity: 1, unitPriceMinor: 0 }] },
    { lines: [{ productId: 'p', quantity: 1, unitPriceMinor: 100 }, { productId: 'p', quantity: 1, unitPriceMinor: 100 }] },
    { lines: Array.from({ length: 51 }, (_, i) => ({ productId: `p${i}`, quantity: 1, unitPriceMinor: 100 })) },
  ])('refuses a malformed body with 400 (§7)', async (body) => {
    const b = await buyer();
    const res = await request(server()).post('/api/v1/checkouts').set(bearer(b.token)).send(body).expect(400);
    expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
  });

  it('a double submit makes one checkout; the second sees an empty cart (D83)', async () => {
    const b = await buyer();
    const a1 = await publishedProduct(app, sellerA, { available: 5 });
    await addToCart(b.token, a1.id, 1);
    const lines = [{ productId: a1.id, quantity: 1, unitPriceMinor: a1.priceMinor }];

    const [first, second] = await Promise.all([place(b.token, lines), place(b.token, lines)]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const refused = first.status === 409 ? first : second;
    expect(CheckoutCartChangedDetailsSchema.parse(refused.body.error.details)).toEqual({ reason: 'CART_CHANGED' });
    expect(await testPrisma.checkout.count({ where: { buyerId: b.id } })).toBe(1);
    expect(await availableOf(a1.id)).toBe(4);
  });

  it("reads a buyer's own checkout and answers 404 to anyone else (SRS-FR-CHK-009, INV-12)", async () => {
    const [x, y] = await mintBuyers(app, 2);
    const a1 = await publishedProduct(app, sellerA);
    await addToCart(x.token, a1.id, 1);
    const placed = await place(x.token, [{ productId: a1.id, quantity: 1, unitPriceMinor: a1.priceMinor }]).expect(201);

    const other = await request(server()).get(`/api/v1/checkouts/${placed.body.id}`).set(bearer(y.token)).expect(404);
    expect(other.body.error.code).toBe(ErrorCodes.NOT_FOUND);
    expect(JSON.stringify(other.body)).not.toContain(a1.name);

    // Control: without it, the 404 above would also pass against a route that 404s everyone.
    const own = await request(server()).get(`/api/v1/checkouts/${placed.body.id}`).set(bearer(x.token)).expect(200);
    expect(expectContract(CheckoutSchema, own.body).id).toBe(placed.body.id);
  });

  it('requires a signed-in user', async () => {
    await request(server()).post('/api/v1/checkouts').send({ lines: [] }).expect(401);
  });
});
