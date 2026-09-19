import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

/**
 * CORS is registered by `configureApp()`, not by `main.ts`, and this suite is what
 * holds that arrangement in place. The e2e harness installs only what
 * `configureApp` installs, so a CORS policy configured in `main.ts` would be
 * invisible here and ship unverified — which is exactly the failure the comment in
 * `app.setup.ts` describes.
 *
 * Deleting the `enableCors` call from `configureApp()` must turn every test below
 * red. If it does not, they are not testing anything.
 */
const ALLOWED_ORIGIN = 'http://allowed.test';
const SECOND_ALLOWED_ORIGIN = 'http://second.test';
const DISALLOWED_ORIGIN = 'http://disallowed.test';

/** One comma-separated list, with the second entry padded, so trimming is exercised. */
const WEB_URL_FIXTURE = `${ALLOWED_ORIGIN}, ${SECOND_ALLOWED_ORIGIN}`;

const PUBLIC_PATH = '/api/v1/health';

describe('cors (e2e)', () => {
  let app: INestApplication;
  const originalWebUrl = process.env.WEB_URL;

  beforeAll(async () => {
    // Set before configureApp reads the environment, so the allowlist under test is
    // the fixture rather than whatever the developer's .env happens to contain.
    process.env.WEB_URL = WEB_URL_FIXTURE;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    // Jest reuses a worker process across files, so a mutated env var leaks into the
    // next suite unless it is put back exactly as it was found.
    if (originalWebUrl === undefined) delete process.env.WEB_URL;
    else process.env.WEB_URL = originalWebUrl;
  });

  it('credits an allowed origin and permits credentials', async () => {
    const res = await request(app.getHttpServer())
      .get(PUBLIC_PATH)
      .set('Origin', ALLOWED_ORIGIN)
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('credits the second origin from the same list, proving the list is parsed and trimmed', async () => {
    const res = await request(app.getHttpServer())
      .get(PUBLIC_PATH)
      .set('Origin', SECOND_ALLOWED_ORIGIN)
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe(SECOND_ALLOWED_ORIGIN);
  });

  it('does not credit an origin outside the list', async () => {
    const res = await request(app.getHttpServer())
      .get(PUBLIC_PATH)
      .set('Origin', DISALLOWED_ORIGIN)
      .expect(200);

    // Reflect rather than reject: the request still succeeds, the browser is simply
    // not told it may read the response. A 403 here would be a different policy.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers a preflight from an allowed origin and names the requested method', async () => {
    const res = await request(app.getHttpServer())
      .options(PUBLIC_PATH)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  it('does not answer a preflight for an origin outside the list', async () => {
    const res = await request(app.getHttpServer())
      .options(PUBLIC_PATH)
      .set('Origin', DISALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('leaves a request with no Origin header unaffected', async () => {
    // The control case: CORS must not change how a server-to-server or curl caller
    // is served, and a missing Origin is not a reason to withhold the response.
    const res = await request(app.getHttpServer()).get(PUBLIC_PATH).expect(200);

    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
