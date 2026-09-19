import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ORGANIZATION_ID_HEADER } from '@app/contracts';

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

/** Registers, logs in, creates an organization, and returns everything a tenant request needs. */
export async function newTenant(
  app: INestApplication,
  prefix: string,
): Promise<{ accessToken: string; organizationId: string }> {
  const accessToken = await registerAndLogin(app, `${unique(prefix)}@marketcore.test`);
  const created = await request(app.getHttpServer())
    .post('/api/v1/organizations')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: `${prefix} co`, slug: unique(prefix) })
    .expect(201);

  return { accessToken, organizationId: created.body.id as string };
}

/** The headers a tenant-scoped request needs: the token and the organization it acts in. */
export function tenantHeaders(accessToken: string, organizationId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    [ORGANIZATION_ID_HEADER]: organizationId,
  };
}
