import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ErrorCodes, InventorySchema } from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { expectContract } from './support/contracts';
import { testPrisma } from './support/db';
import { newTenant, productPayload, tenantHeaders } from './support/fixtures';

describe('set inventory (e2e, D81)', () => {
  let app: INestApplication;
  let owner: Awaited<ReturnType<typeof newTenant>>;
  let other: Awaited<ReturnType<typeof newTenant>>;
  let productId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    owner = await newTenant(app, 'stock');
    other = await newTenant(app, 'otherstock');
    const created = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(tenantHeaders(owner.accessToken, owner.organizationId))
      .send(productPayload())
      .expect(201);
    productId = created.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const put = (tenant: typeof owner, body: object) =>
    request(app.getHttpServer())
      .put(`/api/v1/products/${productId}/inventory`)
      .set(tenantHeaders(tenant.accessToken, tenant.organizationId))
      .send(body);

  it('sets an absolute count and returns the inventory', async () => {
    const res = await put(owner, { available: 7 }).expect(200);

    expect(res.body).toEqual({ productId, available: 7, reserved: 0 });
    expectContract(InventorySchema, res.body);
  });

  it('is idempotent: the same body twice leaves the same count', async () => {
    await put(owner, { available: 3 }).expect(200);
    expect((await put(owner, { available: 3 }).expect(200)).body.available).toBe(3);
  });

  it('answers 404 to another tenant and leaves the stock alone (INV-9)', async () => {
    await put(owner, { available: 4 }).expect(200);
    const res = await put(other, { available: 999 }).expect(404);

    expect(res.body.error.code).toBe(ErrorCodes.NOT_FOUND);
    const inventory = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}/inventory`)
      .set(tenantHeaders(owner.accessToken, owner.organizationId))
      .expect(200);
    expect(inventory.body.available).toBe(4);
  });

  it.each([{ available: -1 }, { available: 1.5 }, {}])('refuses %o with 400', async (body) => {
    const res = await put(owner, body).expect(400);
    expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
  });

  it('reads zero as a real count, not as absent', async () => {
    const res = await put(owner, { available: 0 }).expect(200);

    expect(res.body.available).toBe(0);
  });

  it('sets available only, and leaves reserved alone', async () => {
    // `reserved` is not this route's business. Held units are set out of band, then
    // the absolute write must leave them untouched rather than re-announcing them.
    await testPrisma.inventory.update({ where: { productId }, data: { reserved: 4 } });

    const res = await put(owner, { available: 11 }).expect(200);

    expect(res.body).toMatchObject({ available: 11, reserved: 4 });
  });

  it('answers 404 for a product that does not exist', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/v1/products/00000000-0000-0000-0000-000000000000/inventory')
      .set(tenantHeaders(owner.accessToken, owner.organizationId))
      .send({ available: 1 })
      .expect(404);

    expect(res.body.error.code).toBe(ErrorCodes.NOT_FOUND);
  });

  it('refuses an extra key, because the request contract is strict', async () => {
    await put(owner, { available: 1, reserved: 2 }).expect(400);
  });

  it('refuses a count above the column, as a 400 rather than a 500', async () => {
    // `z.int()` alone accepted 2^31, which then died inside Prisma as an internal
    // error (phase-4 review finding).
    const res = await put(owner, { available: 2_147_483_648 }).expect(400);

    expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
  });
});
