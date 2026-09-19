import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ProductStatuses } from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { newTenant, tenantHeaders } from './support/fixtures';

describe('catalog (e2e)', () => {
  let app: INestApplication;
  let tenant: { accessToken: string; organizationId: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    tenant = await newTenant(app, 'catalog');
  });

  afterAll(async () => {
    await app.close();
  });

  const createProduct = async (priceMinor: number) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(tenantHeaders(tenant.accessToken, tenant.organizationId))
      .send({ name: `Widget ${priceMinor}`, priceMinor, currency: 'EGP' })
      .expect(201);
    return res.body as { id: string; status: string; priceMinor: number };
  };

  it('creates a product as a draft with an inventory row', async () => {
    const product = await createProduct(2500);

    expect(product).toMatchObject({ status: ProductStatuses.DRAFT, priceMinor: 2500 });

    const inventory = await request(app.getHttpServer())
      .get(`/api/v1/products/${product.id}/inventory`)
      .set(tenantHeaders(tenant.accessToken, tenant.organizationId))
      .expect(200);

    expect(inventory.body).toEqual({ productId: product.id, available: 0, reserved: 0 });
  });

  it('publishes a priced product and unpublishes it again', async () => {
    const product = await createProduct(1200);
    const headers = tenantHeaders(tenant.accessToken, tenant.organizationId);

    await request(app.getHttpServer())
      .post(`/api/v1/products/${product.id}/publish`)
      .set(headers)
      .expect(204);

    const published = await request(app.getHttpServer())
      .get(`/api/v1/products/${product.id}`)
      .set(headers)
      .expect(200);
    expect(published.body.status).toBe(ProductStatuses.PUBLISHED);

    await request(app.getHttpServer())
      .post(`/api/v1/products/${product.id}/unpublish`)
      .set(headers)
      .expect(204);

    const draft = await request(app.getHttpServer())
      .get(`/api/v1/products/${product.id}`)
      .set(headers)
      .expect(200);
    expect(draft.body.status).toBe(ProductStatuses.DRAFT);
  });

  it('refuses to publish an unpriced product', async () => {
    const product = await createProduct(0);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/products/${product.id}/publish`)
      .set(tenantHeaders(tenant.accessToken, tenant.organizationId))
      .expect(409);

    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toMatch(/greater than zero/);
  });

  it('refuses to publish a product that is already published', async () => {
    const product = await createProduct(900);
    const headers = tenantHeaders(tenant.accessToken, tenant.organizationId);

    await request(app.getHttpServer())
      .post(`/api/v1/products/${product.id}/publish`)
      .set(headers)
      .expect(204);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/products/${product.id}/publish`)
      .set(headers)
      .expect(409);

    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toMatch(/not legal/);
  });

  it('rejects a fractional price, because money is never a float', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(tenantHeaders(tenant.accessToken, tenant.organizationId))
      .send({ name: 'Fractional', priceMinor: 12.5, currency: 'EGP' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('lists only the caller tenant products', async () => {
    const other = await newTenant(app, 'othercatalog');
    const mine = await createProduct(700);

    const theirs = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set(tenantHeaders(other.accessToken, other.organizationId))
      .expect(200);

    expect(theirs.body).toEqual([]);

    const ours = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set(tenantHeaders(tenant.accessToken, tenant.organizationId))
      .expect(200);

    expect(ours.body.map((product: { id: string }) => product.id)).toContain(mine.id);
  });

  it('answers 404 for a product id that does not exist in this tenant', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products/00000000-0000-4000-8000-000000000000')
      .set(tenantHeaders(tenant.accessToken, tenant.organizationId))
      .expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
