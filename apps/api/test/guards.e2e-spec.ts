import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ORGANIZATION_ID_HEADER } from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { newTenant, tenantHeaders } from './support/fixtures';

/**
 * The guard chain end to end, over a real tenant-scoped route.
 *
 * The 401 cases are the reason this suite exists. The tenancy suite asserts 403
 * and 400, which the *organization* guard produces — so a regression that made the
 * access-token guard pass everything through would leave every existing assertion
 * green. Only a case that expects 401 catches that, and Task 11 mandated one.
 */
describe('guards (e2e)', () => {
  let app: INestApplication;
  let tenant: { accessToken: string; organizationId: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    tenant = await newTenant(app, 'guards');
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a public route with no token', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });

  it('refuses a protected route with no token', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/products').expect(401);

    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('refuses a malformed bearer token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);

    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('refuses a token signed with another secret', async () => {
    // A forged-but-well-formed token, which is what a naive expiry-only check
    // would accept.
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEiLCJpYXQiOjE3MDAwMDAwMDB9.' +
      'Zm9yZ2VkLXNpZ25hdHVyZS1ub3QtdmFsaWQ';

    await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });

  it('authenticates with a valid token but still requires the tenant header', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain(ORGANIZATION_ID_HEADER);
  });

  it('serves the route with both the token and the tenant header', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/products')
      .set(tenantHeaders(tenant.accessToken, tenant.organizationId))
      .expect(200);
  });
});
