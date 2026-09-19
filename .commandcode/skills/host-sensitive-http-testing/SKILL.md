---
name: host-sensitive-http-testing
description: Use when testing or reviewing behaviour that depends on Host, scheme, TLS, a reverse proxy, X-Forwarded-* headers, cookies, Secure/SameSite flags, or CORS — or when a header or security control works locally but is unverified in a real deployment.
---

# Testing host-, scheme- and proxy-sensitive behaviour

**Core principle:** `request(app.getHttpServer())` never binds a port. Every "request" it makes is
plain HTTP, from inside the same process, with `Host: 127.0.0.1`. Any logic that branches on host,
scheme, forwarded headers or cookie security is therefore **unreachable** under the in-process
harness — a test that appears to cover it is covering nothing.

You cannot test behaviour that does not exist. Before writing anything, check whether the code
actually reads these inputs. If it does not, the correct output is "nothing to verify yet", not a
test.

---

## When to use

- The code branches on `Host`, `X-Forwarded-Proto`, `X-Forwarded-For`, `req.secure`, or `req.ip`.
- Cookies are set with `Secure`, `SameSite`, `Domain`, or signing.
- CORS is configured, or a browser origin is involved.
- A header or security control is being added, reviewed, or questioned.
- Someone says "it works locally" about any of the above.

---

## Step 0 — Is there anything to reach?

```bash
grep -rnE "X-Forwarded|forwarded|host|secure|sameSite|cookie|trust proxy" apps/api/src --include='*.ts'
```

If that returns nothing relevant, stop. Report "no host-sensitive behaviour exists" and point at the
feature that would need it. Do not add `trust proxy` speculatively.

---

## Layer 1 — Fake the environment with Supertest (cheap, incomplete)

Supertest can set any header, so in-process e2e can cover *decisions the app makes from headers*:

```ts
const res = await request(app.getHttpServer())
  .get('/api/v1/health/ready')
  .set('Host', 'api.marketcore.test')
  .set('X-Forwarded-Proto', 'https')
  .set('X-Forwarded-For', '203.0.113.5')
  .expect(200);
```

**Precondition — this only works if the app trusts the proxy:**

```ts
// apps/api/src/app.setup.ts — NOT main.ts, or the test never installs it
app.set('trust proxy', TRUST_PROXY_HOPS);
```

Without `trust proxy`, Express ignores `X-Forwarded-*` and `req.secure` stays `false`. A test that
sets the header against an app that does not trust the proxy passes for the wrong reason and proves
the opposite of what it claims.

**What this still cannot do:** TLS, a real proxy rewriting headers, real DNS, cookie behaviour as a
browser would observe it, or anything about how the connection was actually established.

---

## Layer 2 — Cross a real boundary (Playwright + Caddy)

For everything Layer 1 cannot reach.

> The harness exists: `docker-compose.e2e.yml`, `infra/caddy/Caddyfile` and `apps/e2e`.
> `RequestLogFields` carries `host`, `forwardedProto` and `forwardedFor` precisely because
> those headers are unobservable from inside the process — read them back with
> `requestLogRecord()` in `apps/e2e/support/compose.ts`.

The harness:

```
docker-compose.e2e.yml
  db      → postgres:16, healthcheck pg_isready
  api     → built from apps/api/Dockerfile, HEALTHCHECK on /api/v1/health/ready
  caddy   → infra/caddy/Caddyfile, tls internal, reverse_proxy api:3001
```

```caddy
api.marketcore.test {
  tls internal
  reverse_proxy api:3001
}
```

Caddy sets `Host`, `X-Forwarded-For` and `X-Forwarded-Proto` itself, so the app is genuinely reached
at a non-localhost hostname over real TLS.

```bash
docker compose -f docker-compose.e2e.yml up -d --build --wait
pnpm --filter e2e test
docker compose -f docker-compose.e2e.yml logs api | grep -i forwarded
docker compose -f docker-compose.e2e.yml down -v
```

Playwright needs `ignoreHTTPSErrors: true` for Caddy's internal CA, and `baseURL:
https://api.marketcore.test`.

Assert the observable contract, then assert the environment reached the app:

```ts
const res = await request.get('/api/v1/health/ready');
expect(res.status()).toBe(200);

// Prove the request was not localhost — read the structured request log
const logs = await apiContainerLogs();
expect(logs).toContain('api.marketcore.test');
expect(logs).toContain('"x-forwarded-proto":"https"'); // only if the logger records it
```

If the logger does not record the forwarded fields, that is the gap to close first — an unobservable
header is an untestable header.

---

## Layer 3 — Cookies

Cookie flags are the classic "green locally, broken in production" bug: a session cookie set without
`Secure` works on `http://localhost` and is rejected by a browser over `https`.

Assert on the raw header, over a real TLS connection:

```ts
const cookie = res.headers()['set-cookie']?.[0] ?? '';
expect(cookie).toContain('HttpOnly');
expect(cookie).toContain('Secure');
expect(cookie).toMatch(/SameSite=(Lax|Strict)/);
```

Do **not** assert this in-process — with no TLS the `Secure` branch is never taken, and an
in-process `Set-Cookie` assertion cannot tell you what a browser will do.

---

## CORS

The decision is testable in-process (it is middleware). Register it in `configureApp()` first —
`apps/api/src/main.ts` is not installed by the test harness, so CORS registered there is invisible to
every test.

Cover four cases:

1. Allowed `Origin` → `access-control-allow-origin` echoed, `access-control-allow-credentials: true`.
2. Disallowed `Origin` → no allow-origin header.
3. `OPTIONS` preflight with `Access-Control-Request-Method` → success + allowed methods.
4. **Control: no `Origin` at all** → the request is unaffected. Proves CORS did not break normal calls.

Then re-run case 1 through the Caddy harness, because a proxy that strips headers is a real failure
mode in-process tests cannot see.

---

## Red flags — STOP

- Asserting cookie flags from an in-process test.
- Setting `X-Forwarded-Proto` without `app.set('trust proxy', …)`.
- Claiming TLS, DNS or proxy behaviour is covered by Supertest.
- CORS configured in `main.ts` and called "tested".
- Adding `trust proxy` or a `Host` allowlist as a "test improvement" — those are features; they need
  their own ADR and a decision, not a test.
- A host/header assertion that would still pass if the header were ignored.

**All of these mean: the environment is not being simulated. Move up a layer or say what is unproven.**
