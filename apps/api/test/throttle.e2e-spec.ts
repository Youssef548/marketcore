import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ErrorEnvelopeSchema } from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AUTH_THROTTLE_LIMIT } from '../src/auth/auth.constants';
import { expectContract } from './support/contracts';
import { credentials, unique } from './support/fixtures';

/**
 * The auth endpoints are the ones worth brute-forcing, so the limiter is proved by
 * a real burst of requests rather than by asserting configuration — a configured
 * limit that nothing trips is a limit that may not be wired.
 */
describe('auth rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses login attempts past the limit, in the shared error envelope', async () => {
    const email = `${unique('throttle')}@marketcore.test`;
    const send = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(credentials(email, 'irrelevant-but-long'));

    const attempts = [];
    for (let i = 0; i < AUTH_THROTTLE_LIMIT + 1; i++) {
      attempts.push(await send());
    }

    // Everything under the cap is an ordinary credential refusal, not a throttle...
    expect(attempts[0].status).toBe(401);
    // ...and the one past it is refused as too-many-requests, in the same envelope
    // every other failure uses, so a client still branches on `code`.
    const limited = attempts[AUTH_THROTTLE_LIMIT];
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('TOO_MANY_REQUESTS');
    expectContract(ErrorEnvelopeSchema, limited.body);
  });
});
