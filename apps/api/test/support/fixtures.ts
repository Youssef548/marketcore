import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

/** Suffixed, because the e2e suites share one database and must not collide. */
export const unique = (prefix: string): string => `${prefix}-${randomUUID().slice(0, 8)}`;

export const TEST_PASSWORD = 'correct-horse-battery';

/**
 * Shared fixtures, built from the shared value sets rather than hand-written per
 * suite (conventions Rule 7): a payload written by hand is a copy of the contract
 * that goes stale silently.
 */
export async function registerAndLogin(
  app: INestApplication,
  email: string,
  password: string = TEST_PASSWORD,
): Promise<string> {
  await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email, password })
    .expect(201);
  const login = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return login.body.accessToken as string;
}
