import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ErrorCodes, InventorySchema } from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { expectContract } from './support/contracts';
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
});
