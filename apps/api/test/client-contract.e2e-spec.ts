import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import {
  ErrorCodes,
  ORGANIZATION_ID_HEADER,
  OrganizationSchema,
  ProductSchema,
  ProductStatuses,
  TokenPairSchema,
  UserSummarySchema,
} from '@app/contracts';
import { ApiError, createApiClient } from '@app/api-client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { credentials, organizationPayload, productPayload, unique } from './support/fixtures';

/**
 * The api-client is otherwise tested only against MSW mocks, which means the client
 * and the server can drift apart while every test stays green — the mock encodes
 * the same assumption the client makes, so it agrees with it by construction.
 *
 * This suite binds the real app to a real port and drives it with the real client,
 * so a mismatch between the two is a failing test rather than a production
 * surprise. It is the only place that proves the wire contract holds from the
 * client's side of the connection.
 */
describe('api-client against the real server (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    // A real socket, because the client uses `fetch`: supertest's in-process server
    // object is not something it can talk to. Port 0 lets the OS pick a free one.
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
  });

  const anonymous = () => createApiClient({ baseUrl });

  /** Registers, logs in, and returns a client that attaches the access token. */
  const signedIn = async (prefix: string) => {
    const email = `${unique(prefix)}@marketcore.test`;
    const client = anonymous();

    await client.post('/auth/register', UserSummarySchema, { body: credentials(email) });
    const tokens = await client.post('/auth/login', TokenPairSchema, { body: credentials(email) });

    return createApiClient({ baseUrl, getAccessToken: () => tokens.accessToken });
  };

  const tenantHeaders = (organizationId: string) => ({ [ORGANIZATION_ID_HEADER]: organizationId });

  it('parses a registration response with the contract the client validates with', async () => {
    const email = `${unique('client-register')}@marketcore.test`;

    const user = await anonymous().post('/auth/register', UserSummarySchema, {
      body: credentials(email),
    });

    expect(user.email).toBe(email);
  });

  it('drives a whole tenant journey through the real client', async () => {
    const caller = await signedIn('client-journey');

    const organization = await caller.post('/organizations', OrganizationSchema, {
      body: organizationPayload('client-journey'),
    });
    const headers = tenantHeaders(organization.id);

    const product = await caller.post('/products', ProductSchema, {
      body: productPayload({ priceMinor: 4200 }),
      headers,
    });
    expect(product.status).toBe(ProductStatuses.DRAFT);

    // 204 comes back with no body, so the client's contract for it is `null`. If
    // that handling regresses, this line fails rather than silently returning a
    // half-parsed object.
    await caller.post(`/products/${product.id}/publish`, z.null(), { headers });

    const published = await caller.get(`/products/${product.id}`, ProductSchema, { headers });
    expect(published.status).toBe(ProductStatuses.PUBLISHED);

    const listed = await caller.get('/products', z.array(ProductSchema), { headers });
    expect(listed.map((candidate) => candidate.id)).toContain(product.id);
  });

  it("turns the server's error envelope into an ApiError carrying its code", async () => {
    const caller = await signedIn('client-error');
    const organization = await caller.post('/organizations', OrganizationSchema, {
      body: organizationPayload('client-error'),
    });

    const missingId = '00000000-0000-4000-8000-000000000000';
    const failure = await caller
      .get(`/products/${missingId}`, ProductSchema, {
        headers: tenantHeaders(organization.id),
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(404);
    expect((failure as ApiError).code).toBe(ErrorCodes.NOT_FOUND);
    // The message matters: the client replaces the server's message with a generic
    // one when the body is not a valid envelope, so this proves the envelope branch
    // was taken rather than the fallback.
    expect((failure as ApiError).message).not.toContain('Unexpected response');
  });

  it('reports a missing token as UNAUTHORIZED, so the guard chain survives the round trip', async () => {
    const failure = await anonymous()
      .get('/products', z.array(ProductSchema))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(401);
    expect((failure as ApiError).code).toBe(ErrorCodes.UNAUTHORIZED);
  });

  it('rejects a response body that does not satisfy the caller schema', async () => {
    // The counterpart to every other test here: proving the client really parses,
    // rather than trusting the server. Asking for a shape the endpoint never
    // returns must fail loudly.
    const caller = await signedIn('client-strict');

    await expect(caller.get('/health', z.object({ unexpected: z.string() }))).rejects.toThrow();
  });
});
