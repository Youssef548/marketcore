# 011 Web session and token storage

- **Date:** 2026-09-19
- **Status:** Accepted
- **Phase:** Before the first web route that needs a session
- **Implements:** `ffc1314` (the session layer), `320ab01` (the routes and pages), `c59bb6c` (the browser proof)

## Context

The API authenticates with a bearer access token and a rotating refresh token, both
returned **in the body** of `POST /auth/login`. CORS is already configured with
`credentials: true` and a `WEB_URL` allowlist, so a browser could call the API directly.

Two facts force the decision:

1. **A replayed refresh token revokes the entire session** (`auth.service.ts` →
   `revokeForReuse`). That is correct server behaviour — it is how a leaked token is
   contained — and its client-side consequence is that two refreshes racing each other
   sign the user out. The failure is not an error response; it is a logout.
2. **An access token cannot be revoked**, so it must be short-lived, and something has to
   refresh it on the client's behalf repeatedly without replaying.

## Decision

**A backend-for-frontend.** Next.js Route Handlers are the only code that talks to the
API, and both tokens live in `httpOnly` cookies that JavaScript cannot read. The browser
calls the web app; the web app calls the API.

Rotation is serialized in one process-scoped coordinator: callers presenting the same
refresh token share a single exchange, and the last rotation is remembered one step deep
so a request that arrives *after* a rotation, still carrying the token it superseded, is
handed the replacement rather than triggering a replay.

The access cookie carries no expiry of its own; the refresh cookie carries the API's
30-day lifetime, imported from `@app/contracts` so the two cannot disagree.

## Alternatives considered

**Direct from the browser, access token in memory, refresh token in an httpOnly cookie.**
Rejected. It exercises the CORS allowlist, but a rotated refresh token has to be stored
wherever the rotation happened, and the rotation would then happen in the browser — where
the single-flight coordination is a cross-tab problem solvable only with a
`BroadcastChannel` or a lock, and unsolvable when a tab is asleep. It also leaves the
access token inside JavaScript for the length of a session, so an XSS during that window
still steals a credential the design exists to protect.

**Both tokens client-side, refresh called directly against the API.** Rejected. Least
code, and the weakest posture: the refresh token becomes readable by any script on the
page, so one XSS yields a 30-day credential, and a replayed token is trivially
obtainable. For a repository whose whole argument is correctness under failure, shipping
the one option that fails silently is not defensible.

**A generic `/api/proxy/[...path]` passthrough from the start.** Deferred, not rejected.
It has no caller yet — the only two calls this slice makes are `/auth/me` and
`/organizations`, both inside the session load — and this project has already dropped
scaffolding for that reason (`ARCHIVED` was removed from `ProductStatus` for having no
endpoint able to reach it). It arrives with the first page that reads tenant data; the
refresh machinery it needs is shared already.

## Trade-offs

- **Every data call now hops through Next**, and the browser never talks to the API, so
  the CORS allowlist stops being exercised by the web app. CORS remains tested on its own
  terms by `cors.e2e-spec.ts` and the behavioural suite.
- **The rotation memory absorbs a replay of the immediately-previous token.** That narrows
  the API's reuse detection by one generation, bounded to the last rotation in one process.
  Without it, concurrent requests that all see a stale access token produce a replay and the
  session is revoked — the alternative is worse in the common case. A replay from before the
  last rotation still reaches the API and still revokes, and the test suite pins both halves.
- **The dashboard is client-rendered.** See the consequence below; it is a Next constraint
  rather than a preference.
- **Status is lost in a multi-instance deployment.** The coordinator is module state, so two
  instances would each rotate. The session is not lost — the API's reuse detection catches
  it — but a user could be signed out. Horizontal scaling needs the rotation moved to a
  shared store, and that is not needed by anything today.

## Consequences

- **A Server Component cannot read the session.** Next refuses a cookie write during a
  render, so a render that rotated the refresh token could not store the replacement — and
  the next request would present the superseded token and be refused as a replay, the API
  revoking the session. Reading the session is therefore confined to route handlers, and the
  protected pages load it from `/api/session`. This is why the dashboard is client-rendered;
  it is a consequence of the decision, not a separate one.
- **`GET /api/v1/auth/me` had to exist.** Login returns only a token pair and
  `GET /organizations` returns organizations with no user, so a session could not name its
  user. It ships in its own controller rather than on `AuthController`, which is `@Public()`
  at the class level — a route added there would have been reachable with no credentials.
- **`REFRESH_TOKEN_TTL_MS` and `API_PREFIX` moved into `@app/contracts`.** The cookie
  lifetime must match what the API issues, and the web app builds the same URLs the API
  serves. Both are now values two processes agree on, which is the test for belonging there;
  the API re-exports them so no import site moved.
- **`Secure` is read from `SESSION_COOKIE_SECURE`, never `NODE_ENV`.** The behavioural stack
  runs the production build over real TLS while a developer runs the same build over plain
  http — and a `Secure` cookie over http is discarded by the browser in silence, failing as
  "signed out at random". Only an explicit variable makes that branch assertable where it
  matters.
- **The refresh token is a cookie with a 30-day expiry; the access token is a session
  cookie.** Deliberate: mirroring the access token's fifteen minutes here would give that
  policy a second home, and the API's 401 is the only thing entitled to say it is over.
- **Every web failure uses the API's envelope.** The web app is a second server the browser
  talks to, and this repository's third invariant does not stop at the first hop.

## Review date

2026-12-19
