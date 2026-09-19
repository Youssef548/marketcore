import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp, configureSwagger } from '../src/app.setup';

/**
 * Boots the real composition root through the same configureApp() the server
 * uses. This is what proves the global pipe, filter and request-id middleware
 * are actually installed on the app the API serves, not merely defined.
 */
describe('app (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    configureSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/v1/health/ready reports the database up against real Postgres', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ok', checks: { database: 'up' } });
  });

  it('documents both health contracts as named OpenAPI components', async () => {
    // Proves Swagger describes the contract rather than merely existing: a
    // response that ships without a contract loses its named component here.
    //
    // The names come from the DTO classes, not from `.meta({ id })` on the
    // schema — see the comment in packages/contracts/src/health.ts for why those
    // two cannot both be used on one schema.
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(Object.keys(res.body.components.schemas)).toEqual(
      expect.arrayContaining(['HealthDto', 'ReadinessDto']),
    );
  });

  it('an unknown route returns the error envelope, not a bare 404', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
    expect(res.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(typeof res.body.error.message).toBe('string');
  });

  it('every failure carries the request id, so a client can quote it', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/nope')
      .set('x-request-id', 'req_test123')
      .expect(404);

    expect(res.body.error.requestId).toBe('req_test123');
    expect(res.headers['x-request-id']).toBe('req_test123');
  });

  it('assigns a request id even when the caller sends none', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);

    expect(res.body.error.requestId).toMatch(/^req_/);
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });
});
