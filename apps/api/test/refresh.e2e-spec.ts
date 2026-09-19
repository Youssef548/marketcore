import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { TEST_PASSWORD, unique } from './support/fixtures';

/**
 * The refresh token is the only credential the client holds long-term, so the
 * properties that matter are the ones an attacker would exploit: that a rotated
 * token stops working, and that replaying one is detected rather than tolerated.
 */
describe('refresh rotation (e2e)', () => {
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

  const signUp = async (): Promise<{ accessToken: string; refreshToken: string }> => {
    const email = `${unique('refresh')}@marketcore.test`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);

    return { accessToken: login.body.accessToken, refreshToken: login.body.refreshToken };
  };

  const refreshWith = (refreshToken: string) =>
    request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken });

  it('rotates on refresh and refuses the token it replaced', async () => {
    const { refreshToken } = await signUp();

    const rotated = await refreshWith(refreshToken).expect(200);
    expect(rotated.body.refreshToken).not.toBe(refreshToken);

    const reused = await refreshWith(refreshToken).expect(401);
    expect(reused.body.error.code).toBe('UNAUTHORIZED');
  });

  it('revokes the whole session when a rotated token is replayed', async () => {
    const { refreshToken } = await signUp();
    const rotated = await refreshWith(refreshToken).expect(200);

    // Replay the superseded token.
    await refreshWith(refreshToken).expect(401);

    // The newest token must now be dead too. Without this, a replay would be
    // reported but the attacker's stolen descendant would still work.
    const afterReplay = await refreshWith(rotated.body.refreshToken).expect(401);
    expect(afterReplay.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a refresh token that was never issued', async () => {
    const res = await refreshWith('not-a-real-token').expect(401);

    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('logout revokes the session, so a later refresh fails', async () => {
    const { refreshToken } = await signUp();

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken })
      .expect(204);

    await refreshWith(refreshToken).expect(401);
  });
});
