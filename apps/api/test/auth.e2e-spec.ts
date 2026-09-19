import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ErrorEnvelopeSchema, TokenPairSchema, UserSummarySchema } from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { expectContract } from './support/contracts';
import { credentials, registerAndLogin, unique } from './support/fixtures';

describe('auth (e2e)', () => {
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

  it('registers a user and never echoes the password or its hash', async () => {
    const email = `${unique('reg')}@marketcore.test`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials(email))
      .expect(201);

    expect(res.body).toEqual({ id: expect.any(String), email });
    expectContract(UserSummarySchema, res.body);
  });

  it('rejects a password below the domain policy, in the error envelope', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `${unique('short')}@marketcore.test`, password: 'short' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/minimum length/);
    expect(res.body.error.requestId).toBeTruthy();
    expectContract(ErrorEnvelopeSchema, res.body);
  });

  it('refuses a duplicate email', async () => {
    const email = `${unique('dup')}@marketcore.test`;
    const payload = credentials(email);
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(payload).expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(payload)
      .expect(409);

    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('logs in and returns an access token and a refresh token', async () => {
    const email = `${unique('login')}@marketcore.test`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials(email))
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(credentials(email))
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expectContract(TokenPairSchema, res.body);
  });

  it('answers an unknown email and a wrong password identically', async () => {
    const email = `${unique('enumeration')}@marketcore.test`;
    await registerAndLogin(app, email);

    const wrongPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-horse-battery' })
      .expect(401);
    const unknownEmail = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(credentials(`${unique('ghost')}@marketcore.test`))
      .expect(401);

    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
    expect(wrongPassword.body.error.code).toBe('UNAUTHORIZED');
  });
});
