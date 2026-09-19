import { expect, test } from '@playwright/test';
import {
  ErrorEnvelopeSchema,
  HealthSchema,
  ORGANIZATION_ID_HEADER,
  OrganizationSchema,
  ProductSchema,
  ProductStatuses,
  ReadinessSchema,
  TokenPairSchema,
  UserSummarySchema,
} from '@app/contracts';
import { requestLogRecord } from '../support/compose';
import {
  credentials,
  organizationPayload,
  productPayload,
  tenantHeaders,
  unique,
} from '../support/fixtures';

/**
 * The behavioural layer. Everything else in this repository runs in a single Node
 * process on localhost; this suite talks to the built artifact through a reverse
 * proxy over TLS, so it is the only place the following can fail:
 *
 *   - the container image is buildable and starts with its configuration
 *   - the schema migration and seed run against a database reached over the network
 *   - TLS is terminated and the app is told about it (X-Forwarded-Proto)
 *   - the public Host reaches the application (X-Forwarded-Host / Host passthrough)
 *   - CORS decisions hold for a real browser origin across a proxy hop
 *   - the request id and the error envelope survive the hop intact
 *
 * With one exception, each assertion is against an observable HTTP response. The
 * forwarded-header ones read the API's structured log, because behind a proxy the
 * process sees only a connection from the proxy — the scheme and public host exist
 * nowhere else, and no endpoint echoes them.
 */
const API = '/api/v1';

const ALLOWED_ORIGIN = 'http://web.marketcore.test';
const DISALLOWED_ORIGIN = 'http://not-allowed.test';

test.describe('behavioural: the deployed artifact behind a proxy', () => {
  test('serves the health contract over real TLS', async ({ request }) => {
    const response = await request.get(`${API}/health`);

    expect(response.status()).toBe(200);
    expect(HealthSchema.parse(await response.json())).toEqual({ status: 'ok' });
  });

  test('reaches a database on the container network and reports it ready', async ({ request }) => {
    const response = await request.get(`${API}/health/ready`);

    expect(response.status()).toBe(200);
    const readiness = ReadinessSchema.parse(await response.json());
    expect(readiness.checks.database).toBe('up');
  });

  test('carries a whole tenant journey over the wire', async ({ request }) => {
    const email = `${unique('behavioural')}@marketcore.test`;

    const registered = await request.post(`${API}/auth/register`, {
      data: credentials(email),
    });
    expect(registered.status()).toBe(201);
    expect(UserSummarySchema.parse(await registered.json()).email).toBe(email);

    const loggedIn = await request.post(`${API}/auth/login`, { data: credentials(email) });
    expect(loggedIn.status()).toBe(200);
    const tokens = TokenPairSchema.parse(await loggedIn.json());

    const authorization = { authorization: `Bearer ${tokens.accessToken}` };

    const created = await request.post(`${API}/organizations`, {
      data: organizationPayload('behavioural'),
      headers: authorization,
    });
    expect(created.status()).toBe(201);
    const organization = OrganizationSchema.parse(await created.json());

    const headers = tenantHeaders(tokens.accessToken, organization.id);

    const productResponse = await request.post(`${API}/products`, {
      data: productPayload({ priceMinor: 4200 }),
      headers,
    });
    expect(productResponse.status()).toBe(201);
    const product = ProductSchema.parse(await productResponse.json());
    expect(product.status).toBe(ProductStatuses.DRAFT);

    const published = await request.post(`${API}/products/${product.id}/publish`, { headers });
    expect(published.status()).toBe(204);

    const fetched = await request.get(`${API}/products/${product.id}`, { headers });
    expect(ProductSchema.parse(await fetched.json()).status).toBe(ProductStatuses.PUBLISHED);

    const listed = await request.get(`${API}/products`, { headers });
    expect(listed.status()).toBe(200);
  });

  test('tells the application the connection was https, which only a proxy can know', async ({
    request,
  }) => {
    // The assertion that justifies this whole layer. In-process, `x-forwarded-proto`
    // is a header a test invented; here it is written by Caddy, on a connection that
    // really was TLS, and read back out of the application's own log line.
    const marker = unique('forwarded');

    const response = await request.get(`${API}/health`, {
      headers: { 'x-request-id': marker },
    });
    expect(response.status()).toBe(200);

    const record = requestLogRecord(marker);
    expect(record, 'the request should appear in the API log').toBeDefined();
    expect(record?.forwardedProto).toBe('https');
    expect(record?.forwardedFor).toBeTruthy();
  });

  test('passes the public hostname through to the application', async ({ request }) => {
    const marker = unique('host');

    const response = await request.get(`${API}/health`, {
      headers: { 'x-request-id': marker, host: 'api.marketcore.test' },
    });
    expect(response.status()).toBe(200);

    const record = requestLogRecord(marker);
    expect(record, 'the request should appear in the API log').toBeDefined();
    expect(record?.host).toBe('api.marketcore.test');
  });

  test('enforces CORS for a real browser origin across the proxy hop', async ({ request }) => {
    const allowed = await request.get(`${API}/health`, { headers: { origin: ALLOWED_ORIGIN } });
    expect(allowed.headers()['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(allowed.headers()['access-control-allow-credentials']).toBe('true');

    const preflight = await request.fetch(`${API}/health`, {
      method: 'OPTIONS',
      headers: {
        origin: ALLOWED_ORIGIN,
        'access-control-request-method': 'GET',
      },
    });
    expect(preflight.status()).toBe(204);
    expect(preflight.headers()['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  test('refuses to credit an origin outside the allowlist', async ({ request }) => {
    const refused = await request.get(`${API}/health`, { headers: { origin: DISALLOWED_ORIGIN } });

    // Still a 200 — CORS decides whether the browser may *read* the response, not
    // whether the request is served.
    expect(refused.status()).toBe(200);
    expect(refused.headers()['access-control-allow-origin']).toBeUndefined();
  });

  test('leaves a request with no Origin alone', async ({ request }) => {
    const response = await request.get(`${API}/health`);

    expect(response.status()).toBe(200);
    expect(response.headers()['access-control-allow-origin']).toBeUndefined();
  });

  test('preserves the request id and the error envelope through the proxy', async ({ request }) => {
    const marker = unique('req-envelope');

    const response = await request.get(`${API}/no-such-route`, {
      headers: { 'x-request-id': marker },
    });

    expect(response.status()).toBe(404);
    // The id is returned as a header, so a client can quote it without parsing the
    // body — and it must be the caller's id, not one the proxy or the app invented.
    expect(response.headers()['x-request-id']).toBe(marker);
    expect(ErrorEnvelopeSchema.parse(await response.json()).error.requestId).toBe(marker);
  });

  test('requires a token for a tenant-scoped route, even through the proxy', async ({ request }) => {
    const response = await request.get(`${API}/products`);

    expect(response.status()).toBe(401);
    expect(ErrorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  test('requires the tenant header from an authenticated caller', async ({ request }) => {
    const email = `${unique('behavioural-tenantless')}@marketcore.test`;
    await request.post(`${API}/auth/register`, { data: credentials(email) });
    const loggedIn = await request.post(`${API}/auth/login`, { data: credentials(email) });
    const tokens = TokenPairSchema.parse(await loggedIn.json());

    const response = await request.get(`${API}/products`, {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(response.status()).toBe(400);
    const envelope = ErrorEnvelopeSchema.parse(await response.json());
    expect(envelope.error.code).toBe('VALIDATION_ERROR');
    expect(envelope.error.message).toContain(ORGANIZATION_ID_HEADER);
  });
});
