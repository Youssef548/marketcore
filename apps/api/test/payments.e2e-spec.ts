import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  CheckoutConflictDetailsSchema,
  CheckoutSchema,
  CheckoutStatuses,
  CurrencyCodes,
  ErrorCodes,
  IDEMPOTENCY_KEY_HEADER,
  OrderStatuses,
} from '@app/contracts';
import { providerOperationKey } from '@app/domain';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { expectContract } from './support/contracts';
import { testPrisma } from './support/db';
import { newTenant, publishedProduct } from './support/fixtures';
import { bearer, mintBuyers } from './support/marketplace';

/**
 * Paying a checkout, on the wire (SRS-FR-PAY-001…-004).
 *
 * The price decides the simulator's verdict (ADR 004), so each case is a different product
 * price rather than a different mock — which is why these tests can be read as "a seller
 * priced it at 1,013" rather than as a sequence of stubs.
 */
describe('payments (e2e)', () => {
  let app: INestApplication;
  let seller: Awaited<ReturnType<typeof newTenant>>;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    seller = await newTenant(app, 'paid');
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  const AMOUNT_CAPTURED = 24_900;
  const AMOUNT_DECLINED = 1_013;
  const AMOUNT_TIMEOUT = 2_517;

  /** A buyer with a cart holding one product, and the lines that place it. */
  async function cart(priceMinor: number, available = 5) {
    const b = (await mintBuyers(app, 1))[0];
    const product = await publishedProduct(app, seller, { priceMinor, available });
    await request(server()).put(`/api/v1/cart/items/${product.id}`).set(bearer(b.token)).send({ quantity: 1 }).expect(200);
    return { b, product, lines: [{ productId: product.id, quantity: 1, unitPriceMinor: priceMinor }] };
  }

  const place = (token: string, lines: { productId: string; quantity: number; unitPriceMinor: number }[]) =>
    request(server())
      .post('/api/v1/checkouts')
      .set(bearer(token))
      .set(IDEMPOTENCY_KEY_HEADER, `key-${randomUUID()}`)
      .send({ lines });

  const pay = (token: string, checkoutId: string) =>
    request(server()).post(`/api/v1/checkouts/${checkoutId}/pay`).set(bearer(token));

  it('pays the checkout, answers with it, and charges nothing on a repeat (D105, SRS-FR-PAY-003)', async () => {
    const { b, lines } = await cart(AMOUNT_CAPTURED);
    const placed = expectContract(CheckoutSchema, (await place(b.token, lines).expect(201)).body);

    const paid = expectContract(CheckoutSchema, (await pay(b.token, placed.id).expect(200)).body);

    expect(paid.status).toBe(CheckoutStatuses.PAID);
    expect(paid.orders.every((order) => order.status === OrderStatuses.PAID)).toBe(true);
    expect(paid.currency).toBe(CurrencyCodes.EGP);

    const again = expectContract(CheckoutSchema, (await pay(b.token, placed.id).expect(200)).body);
    expect(again.id).toBe(paid.id);
    // One charge, however many times it is asked: the operation key is derived from the
    // checkout, so every attempt is the same provider operation.
    expect(await testPrisma.providerCharge.count({ where: { operationKey: providerOperationKey(paid.id) } })).toBe(1);
  });

  it('answers a declined charge with 409 PAYMENT_DECLINED and leaves the checkout payable (D106)', async () => {
    const { b, lines } = await cart(AMOUNT_DECLINED);
    const placed = expectContract(CheckoutSchema, (await place(b.token, lines).expect(201)).body);

    const refused = await pay(b.token, placed.id).expect(409);

    expect(refused.body.error.code).toBe(ErrorCodes.CONFLICT);
    expect(CheckoutConflictDetailsSchema.parse(refused.body.error.details)).toEqual({ reason: 'PAYMENT_DECLINED' });
    const still = expectContract(
      CheckoutSchema,
      (await request(server()).get(`/api/v1/checkouts/${placed.id}`).set(bearer(b.token)).expect(200)).body,
    );
    expect(still.status).toBe(CheckoutStatuses.PENDING_PAYMENT);
    expect(await testPrisma.payment.findUniqueOrThrow({ where: { checkoutId: placed.id } })).toMatchObject({
      status: 'FAILED',
      attempts: 1,
    });
  });

  it('answers an unconfirmable charge with 409 PAYMENT_PENDING, and the retry settles it (D111)', async () => {
    const { b, lines } = await cart(AMOUNT_TIMEOUT);
    const placed = expectContract(CheckoutSchema, (await place(b.token, lines).expect(201)).body);

    const pending = await pay(b.token, placed.id).expect(409);

    expect(CheckoutConflictDetailsSchema.parse(placed === null ? {} : pending.body.error.details)).toEqual({
      reason: 'PAYMENT_PENDING',
    });
    // Nothing was settled and nothing was refused: the row is the record of not knowing.
    expect(await testPrisma.payment.findUniqueOrThrow({ where: { checkoutId: placed.id } })).toMatchObject({
      status: 'PROCESSING',
    });

    const retry = expectContract(CheckoutSchema, (await pay(b.token, placed.id).expect(200)).body);
    expect(retry.status).toBe(CheckoutStatuses.PAID);
    expect(await testPrisma.providerCharge.count({ where: { operationKey: providerOperationKey(placed.id) } })).toBe(1);
  });

  it("answers another buyer's checkout as unknown, charging nothing (INV-12)", async () => {
    const { b, lines } = await cart(AMOUNT_CAPTURED);
    const placed = expectContract(CheckoutSchema, (await place(b.token, lines).expect(201)).body);
    const [stranger] = await mintBuyers(app, 1);

    const refused = await pay(stranger.token, placed.id).expect(404);

    expect(refused.body.error.code).toBe(ErrorCodes.NOT_FOUND);
    expect(await testPrisma.payment.count({ where: { checkoutId: placed.id } })).toBe(0);
    expect(await testPrisma.providerCharge.count({ where: { operationKey: providerOperationKey(placed.id) } })).toBe(0);
  });

  it('requires a signed-in buyer', async () => {
    await request(server()).post('/api/v1/checkouts/anything/pay').expect(401);
  });
});
