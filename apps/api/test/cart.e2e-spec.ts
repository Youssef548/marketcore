import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  CART_LINE_MAX_QUANTITY,
  CartLineAvailabilities,
  CartSchema,
  ErrorCodes,
  type Cart,
} from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { expectContract } from './support/contracts';
import { testPrisma } from './support/db';
import {
  newTenant,
  productPayload,
  publishedProduct,
  registerAndLogin,
  tenantHeaders,
  unique,
} from './support/fixtures';
import { bearer } from './support/marketplace';

describe('cart (e2e)', () => {
  let app: INestApplication;
  let sellerA: Awaited<ReturnType<typeof newTenant>>;
  let sellerB: Awaited<ReturnType<typeof newTenant>>;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    sellerA = await newTenant(app, 'carta');
    sellerB = await newTenant(app, 'cartb');
  });

  afterAll(async () => {
    await app.close();
  });

  const newBuyer = () => registerAndLogin(app, `${unique('cartbuyer')}@marketcore.test`);
  const getCart = async (token: string): Promise<Cart> =>
    expectContract(CartSchema, (await request(server()).get('/api/v1/cart').set(bearer(token)).expect(200)).body);
  const setLine = (token: string, productId: string, quantity: unknown) =>
    request(server()).put(`/api/v1/cart/items/${productId}`).set(bearer(token)).send({ quantity });
  const sellerHeaders = (seller: typeof sellerA) => tenantHeaders(seller.accessToken, seller.organizationId);
  const stockOf = async (seller: typeof sellerA, productId: string): Promise<number> =>
    (await request(server()).get(`/api/v1/products/${productId}/inventory`).set(sellerHeaders(seller)).expect(200))
      .body.available;
  const lines = (cart: Cart) => cart.sellers.flatMap((group) => group.lines);

  it('creates an empty cart on first read (SRS-FR-CART-001)', async () => {
    expect(await getCart(await newBuyer())).toEqual({ sellers: [] });
  });

  it('holds two sellers in one cart and leaves both stocks alone (AC-US-CART-001-1)', async () => {
    const token = await newBuyer();
    const a = await publishedProduct(app, sellerA, { available: 5 });
    const b = await publishedProduct(app, sellerB, { available: 5 });

    await setLine(token, a.id, 1).expect(200);
    const cart = expectContract(CartSchema, (await setLine(token, b.id, 2).expect(200)).body);

    expect(cart.sellers.map((group) => group.seller.slug).sort()).toEqual([sellerA.slug, sellerB.slug].sort());
    expect(await stockOf(sellerA, a.id)).toBe(5);
    expect(await stockOf(sellerB, b.id)).toBe(5);
  });

  it('refuses an eleventh unit and keeps the line at 10 (AC-US-CART-001-2)', async () => {
    const token = await newBuyer();
    const a = await publishedProduct(app, sellerA, { available: 50 });

    await setLine(token, a.id, CART_LINE_MAX_QUANTITY).expect(200);
    const refused = await setLine(token, a.id, CART_LINE_MAX_QUANTITY + 1).expect(400);

    expect(refused.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(lines(await getCart(token))[0].quantity).toBe(CART_LINE_MAX_QUANTITY);
  });

  it.each([0, 2.5, '3'])('refuses quantity %p with 400', async (quantity) => {
    const a = await publishedProduct(app, sellerA);
    await setLine(await newBuyer(), a.id, quantity).expect(400);
  });

  it('flags "only N left" once stock drops below the quantity (AC-US-CART-002-1)', async () => {
    const token = await newBuyer();
    const a = await publishedProduct(app, sellerA, { available: 5 });
    await setLine(token, a.id, 2).expect(200);

    await request(server())
      .put(`/api/v1/products/${a.id}/inventory`)
      .set(sellerHeaders(sellerA))
      .send({ available: 1 })
      .expect(200);

    expect(lines(await getCart(token))[0]).toMatchObject({ available: 1, availability: CartLineAvailabilities.SHORT });
  });

  it('keeps a line that was unpublished, sold out and masked (SRS-FR-CART-007, D86)', async () => {
    const token = await newBuyer();
    const a = await publishedProduct(app, sellerA, { available: 5 });
    await setLine(token, a.id, 1).expect(200);

    await request(server()).post(`/api/v1/products/${a.id}/unpublish`).set(sellerHeaders(sellerA)).expect(204);

    expect(lines(await getCart(token))[0]).toMatchObject({
      productId: a.id,
      availability: CartLineAvailabilities.SOLD_OUT,
      available: 0,
      currentUnitPriceMinor: null,
    });
  });

  it('keeps the price a line was added at when the seller changes it (D82)', async () => {
    const token = await newBuyer();
    const a = await publishedProduct(app, sellerA, { priceMinor: 1000 });
    await setLine(token, a.id, 1).expect(200);

    await request(server())
      .patch(`/api/v1/products/${a.id}`)
      .set(sellerHeaders(sellerA))
      .send({ priceMinor: 1200 })
      .expect(204);
    await setLine(token, a.id, 2).expect(200); // a quantity change is not a price confirmation

    expect(lines(await getCart(token))[0]).toMatchObject({ addedUnitPriceMinor: 1000, currentUnitPriceMinor: 1200 });
  });

  it('refuses a draft or unknown product with 404 (SRS-FR-CART-003)', async () => {
    const token = await newBuyer();
    const draft = await request(server())
      .post('/api/v1/products')
      .set(sellerHeaders(sellerA))
      .send(productPayload())
      .expect(201);

    await setLine(token, draft.body.id, 1).expect(404);
    await setLine(token, '00000000-0000-4000-8000-000000000000', 1).expect(404);
  });

  it('PUT and DELETE are idempotent (SRS-FR-CART-002)', async () => {
    const token = await newBuyer();
    const a = await publishedProduct(app, sellerA);

    await setLine(token, a.id, 3).expect(200);
    await setLine(token, a.id, 3).expect(200);
    expect(lines(await getCart(token))).toHaveLength(1);

    await request(server()).delete(`/api/v1/cart/items/${a.id}`).set(bearer(token)).expect(200);
    const again = await request(server()).delete(`/api/v1/cart/items/${a.id}`).set(bearer(token)).expect(200);
    expect(again.body).toEqual({ sellers: [] });
  });

  it("another buyer can neither read nor change X's cart (AC-US-CART-002-2, INV-12)", async () => {
    const x = await newBuyer();
    const y = await newBuyer();
    const a = await publishedProduct(app, sellerA);
    await setLine(x, a.id, 2).expect(200);

    // There is no cart id on the wire (finding 4): Y's only handle is Y's own cart.
    expect(await getCart(y)).toEqual({ sellers: [] });
    await request(server()).delete(`/api/v1/cart/items/${a.id}`).set(bearer(y)).expect(200);
    await setLine(y, a.id, 5).expect(200);

    // Control: X still has exactly X's line, untouched by Y's writes.
    expect(lines(await getCart(x))).toEqual([expect.objectContaining({ productId: a.id, quantity: 2 })]);
    expect(lines(await getCart(y))).toEqual([expect.objectContaining({ productId: a.id, quantity: 5 })]);
  });

  it('requires a signed-in user', async () => {
    await request(server()).get('/api/v1/cart').expect(401);
  });

  it('accepts a quantity above the stock and flags it SHORT (D58, SRS-FR-CART-004)', async () => {
    // The falsifier for the slice's headline ruling: stock is checked at checkout,
    // not at add-to-cart. An implementation that refused or reserved here would
    // leave this 400 instead of a 200 with `availability: SHORT`.
    const token = await newBuyer();
    const a = await publishedProduct(app, sellerA, { available: 1 });

    const cart = expectContract(CartSchema, (await setLine(token, a.id, 10).expect(200)).body);

    expect(lines(cart)[0]).toMatchObject({ quantity: 10, available: 1 });
    expect(lines(cart)[0].availability).toBe(CartLineAvailabilities.SHORT);
    expect(await stockOf(sellerA, a.id)).toBe(1);
  });

  it('prices a product at zero cannot be added, and does not break the cart', async () => {
    // A published product repriced to 0 is refused at the source now; this proves the
    // read path survives it anyway rather than turning every later cart read into a 500.
    const token = await newBuyer();
    const a = await publishedProduct(app, sellerA, { priceMinor: 1000 });
    await setLine(token, a.id, 1).expect(200);

    const seller = await newTenant(app, 'zeroprice');
    const zero = await publishedProduct(app, seller, { priceMinor: 1000 });
    await testPrisma.product.update({ where: { id: zero.id }, data: { priceMinor: 0 } });

    await setLine(token, zero.id, 1).expect(404);
    expect(lines(await getCart(token))).toHaveLength(1);
  });
});
