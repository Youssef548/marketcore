import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CurrencyCodes, ORGANIZATION_ID_HEADER } from '@app/contracts';

/** Suffixed, because the e2e suites share one database and must not collide. */
export const unique = (prefix: string): string => `${prefix}-${randomUUID().slice(0, 8)}`;

export const TEST_PASSWORD = 'correct-horse-battery';

/**
 * A register or login body. One definition, so a change to the credential contract
 * breaks in one place rather than in whichever suite is run first.
 *
 * A suite that needs a *deliberately* invalid password ("short", "wrong-…") builds
 * it inline and says why — routing that through here would hide the intent.
 */
export function credentials(email: string, password: string = TEST_PASSWORD) {
  return { email, password };
}

/** A create-organization body. The slug is derived from the prefix, so it is unique and valid. */
export function organizationPayload(
  prefix: string,
  overrides: Partial<{ name: string; slug: string }> = {},
) {
  return { name: `${prefix} co`, slug: unique(prefix), ...overrides };
}

/**
 * A create-product body. `priceMinor` is integer minor units; the suite that proves
 * a float is rejected overrides it on purpose.
 */
export function productPayload(
  overrides: Partial<{ name: string; priceMinor: number; currency: string }> = {},
) {
  return { name: 'Test Widget', priceMinor: 1000, currency: CurrencyCodes.EGP, ...overrides };
}

export async function registerAndLogin(
  app: INestApplication,
  email: string,
  password: string = TEST_PASSWORD,
): Promise<string> {
  await request(app.getHttpServer()).post('/api/v1/auth/register').send(credentials(email, password)).expect(201);
  const login = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send(credentials(email, password))
    .expect(200);
  return login.body.accessToken as string;
}

/** Logs an existing user in and returns the access token. */
export async function login(
  app: INestApplication,
  email: string,
  password: string = TEST_PASSWORD,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send(credentials(email, password))
    .expect(200);
  return response.body.accessToken as string;
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
    .send(organizationPayload(prefix))
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
