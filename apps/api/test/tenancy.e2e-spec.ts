import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CurrencyCodes, ORGANIZATION_ID_HEADER } from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { newTenant, productPayload, tenantHeaders } from './support/fixtures';

/**
 * INV-9, and the exit gate for the week:
 *
 *   A user may not access a private resource owned by another organization.
 *
 * Two tenants, one product, and every route that could reach it from the wrong
 * side. The last test matters as much as the others: without it, every assertion
 * above would also pass against a system that returns 404 for everything, which
 * is the failure mode a cross-tenant suite is most likely to hide.
 */
describe('tenant isolation (e2e)', () => {
  let app: INestApplication;
  let alice: { accessToken: string; organizationId: string; productId: string };
  let bob: { accessToken: string; organizationId: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const aliceTenant = await newTenant(app, 'alice');
    bob = await newTenant(app, 'bob');

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(tenantHeaders(aliceTenant.accessToken, aliceTenant.organizationId))
      .send(productPayload({ name: 'Alice Widget', priceMinor: 500, currency: CurrencyCodes.USD }))
      .expect(201);

    // Built in one assignment: `alice` is only ever the complete shape, so no
    // partial state exists for a later assertion to trip over.
    alice = { ...aliceTenant, productId: product.body.id as string };
  });

  afterAll(async () => {
    await app.close();
  });

  /** Bob, acting inside his own organization, reaching for Alice's product. */
  const bobReaches = (method: 'get' | 'patch' | 'post', path: string) =>
    request(app.getHttpServer())
      [method](path)
      .set(tenantHeaders(bob.accessToken, bob.organizationId));

  it("cannot read another organization's product by identifier", async () => {
    const res = await bobReaches('get', `/api/v1/products/${alice.productId}`).expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
    // Not merely a 404: the response must not carry the data it refused to serve.
    expect(JSON.stringify(res.body)).not.toContain('Alice Widget');
  });

  it("cannot update another organization's product", async () => {
    await bobReaches('patch', `/api/v1/products/${alice.productId}`)
      .send({ name: 'Stolen' })
      .expect(404);

    const stillAlice = await request(app.getHttpServer())
      .get(`/api/v1/products/${alice.productId}`)
      .set(tenantHeaders(alice.accessToken, alice.organizationId))
      .expect(200);
    expect(stillAlice.body.name).toBe('Alice Widget');
  });

  it("cannot publish another organization's product", async () => {
    await bobReaches('post', `/api/v1/products/${alice.productId}/publish`).expect(404);
  });

  it("cannot read another organization's inventory", async () => {
    await bobReaches('get', `/api/v1/products/${alice.productId}/inventory`).expect(404);
  });

  it("does not list another organization's products", async () => {
    const res = await bobReaches('get', '/api/v1/products').expect(200);

    expect(res.body).toEqual([]);
  });

  it('refuses a header naming an organization the caller does not belong to', async () => {
    // The header is an explicit claim, so refusing it is a 403 rather than a 404:
    // nothing is disclosed that the caller did not already assert.
    const res = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set(ORGANIZATION_ID_HEADER, alice.organizationId)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('refuses a tenant-scoped request that names no organization at all', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain(ORGANIZATION_ID_HEADER);
  });

  it('still lets the owner read their own product', async () => {
    // The control case. Without it, every assertion above would pass against a
    // system that answers 404 to everything.
    const res = await request(app.getHttpServer())
      .get(`/api/v1/products/${alice.productId}`)
      .set(tenantHeaders(alice.accessToken, alice.organizationId))
      .expect(200);

    expect(res.body.name).toBe('Alice Widget');
  });
});
