# MarketCore — web session, identity and organization selection (design)

**Phase:** the first frontend slice, after phases 2–3 (identity, tenancy, catalog).
**Precedes:** `docs/superpowers/plans/2026-09-19-marketcore-web-auth-session.md`.

Decisions continue the repository's sequence: D1–D17 are in the platform design, D18–D28 in the
week-2 tenancy and catalog design, and this document continues at **D29**.

**The question this slice answers:** can a browser hold a session that survives a stale access
token and concurrent requests — without ever being able to read the credential it holds?

---

## D29 — The session lives in `httpOnly` cookies behind a BFF

The web app's Route Handlers are the only code that talks to the API. Both tokens live in
`httpOnly` cookies named `mc_at` (access), `mc_rt` (refresh) and `mc_org` (active organization),
all `SameSite=Lax`, `Path=/`, and `Secure` outside local development. The browser never holds a
token where a script can reach it.

The forcing fact is that **a replayed refresh token revokes the entire session**
(`auth.service.ts` → `revokeForReuse`). That is correct server behaviour and its client-side
consequence is a logged-out user, so the client's job is to never replay. Behind a BFF that is an
in-process concern; from the browser it is a cross-tab coordination problem that a sleeping tab
cannot solve.

Full reasoning, alternatives and trade-offs: [ADR 011](../../adr/011-web-session-and-token-storage.md).

*Rejected:* direct browser→API calls with the access token in memory (rotation in the browser is
unsolvable across tabs); both tokens client-side (an XSS yields a 30-day credential).

## D30 — The access cookie has no expiry; the refresh cookie has the API's

`mc_at` is a **session cookie**: its fifteen minutes are the API's policy and the API's 401 is
what enforces them. Mirroring that lifetime here would give one policy a second home, and the
cookie would start deciding something it cannot know — the margin between a cookie expiring and a
token expiring is exactly where the two definitions drift.

`mc_rt` **does** carry an expiry, because a session cookie is discarded when the browser closes,
which would end a 30-day session on a browser restart.

`REFRESH_TOKEN_TTL_MS` therefore moves into `@app/contracts`, and `apps/api/src/auth/auth.constants.ts`
re-exports it so no call site in the API moved. The test for belonging in that package is "an API
and a client must agree on it", which is the same argument that put `ORGANIZATION_ID_HEADER` there.

*Rejected:* a literal `30 * 24 * 60 * 60 * 1000` in the web app with a comment pointing at the API.
A comment does not fail a test when the API's value changes.

## D31 — Rotation is single-flight, with one step of rotation memory

Two mechanisms, and the second is the one that is easy to miss:

1. **Single flight.** Callers presenting the same refresh token share one exchange instead of
   starting a second. A `Map<token, Promise>` held in module scope, so two concurrent requests in
   one process see each other.
2. **One step of rotation memory.** The dangerous case is not simultaneity but a near miss. A
   browser attaches the cookie it held when the request started, so a request can arrive *after* a
   rotation has settled still carrying the token that was just superseded — and an in-flight map
   cannot help, because that promise is already gone. The coordinator therefore remembers the last
   rotation as `from → to` and answers a caller presenting `from` with `to`.

The memory is deliberately one entry deep and needs no timer. It absorbs the immediate
predecessor; a genuine replay from further back still reaches the API and still revokes the
session, which is the signal the server exists to produce.

*Rejected:* a bare in-flight map (does not cover the near miss, which is the case that actually
happens); a global non-token-keyed mutex (does not cover a request arriving with a superseded
token either, and serializes unrelated sessions).

**Observable:** `N` concurrent session loads with one stale access token produce **exactly one**
`/auth/refresh` at the API. Asserted on the call count rather than on the outcome — an
implementation that rotated six times would still return six usable-looking pairs. Proven in
process (`refresh.test.ts`) and against the real API in the behavioural suite.

## D32 — The refresh happens where a cookie can be written, so pages read the session over HTTP

Next refuses a cookie write during a Server Component render. A render that rotated the refresh
token could not store the replacement, so the next request would present the superseded token and
be refused as a replay — **the API revoking the session, caused entirely by where the refresh
happened**. The session is therefore loaded in route handlers, and the protected pages read it
from `GET /api/session`.

A consequence, not a separate decision: the protected area is client-rendered. It is recorded
here because it looks like a stylistic choice and is not one.

## D33 — `GET /api/v1/auth/me` is added, in its own controller

A session could not previously name its user: `login` returns a token pair and no user, and
`GET /organizations` returns organizations with no user attached.

It cannot live on `AuthController`, which carries a class-level `@Public()`. The guard resolves
that metadata from the handler **and** the class (`getAllAndOverride`), and no marker opts a
single method back into requiring a token — so a `me` route added there would have been readable
with no credentials, while `grep '@Public'` went on reading as the complete list of
unauthenticated routes. It ships as `MeController`, marked `@TenantFree()` because naming yourself
cannot require naming an organization.

A miss is refused as `UNAUTHORIZED`, not 404: an access token cannot be revoked, so a token issued
before a user row was deleted stays valid until it expires, and this lookup is the only thing that
notices.

**Observable:** `/auth/me` with no token is 401. Moving it back to `AuthController` turns that test
red, which is the assertion's reason for existing.

## D34 — No generic API proxy yet

`/api/proxy/[...path]` has no caller in this slice: the only two calls are `/auth/me` and
`/organizations`, and both already live inside the session load. The repository has already
dropped scaffolding for this reason — `ARCHIVED` was removed from `ProductStatus` for having no
endpoint able to reach it. It arrives with the first page that reads tenant data, and the refresh
machinery it will need is shared already.

## D35 — The web layer emits the API's error envelope

The web app is a second server the browser talks to, and the third architectural invariant is that
every failure has one shape. Rather than invent a second shape or map the API's codes onto new
ones, an `ApiError` is passed through with its `code` intact; only the `requestId` is replaced,
with the one this side actually sent.

That matters: the id is generated per server-side operation, sent to the API, echoed in its
structured log, and returned to the browser in the envelope — so a failure a user can see is one
the API's log can be searched for. The join the API already offers its callers survives a second
hop.

*Deviation from the plan:* the plan had the middleware stamp the id on the request. It is
generated in the layer that makes the API call instead — middleware runs on the Edge runtime and
the id has to reach the API from route handlers, and a browser sends no id to forward.

## D36 — Registration does not create a session

`POST /auth/register` returns a `UserSummary` and no tokens, deliberately: "registration is user
creation; a session is a separate concern". The web app does not paper over that by chaining a
login inside the route handler. A successful registration redirects to `/login?registered=1`.

*Rejected:* chaining register→login in one handler. It erases a real API boundary to save a round
trip, and hides from a reader that the two are separate.

## D37 — `(auth)` and `(dash)` route groups, and a middleware gate that decides routing only

`(auth)` holds the credential pages and `(dash)` everything behind a session — the groups the
README described as arriving "with the first route that needs them". `(auth)` is used instead of
the documented `(marketing)`, because a login form is not marketing; the deviation is recorded in
the README rather than left to be noticed.

Middleware checks **presence of the refresh cookie and nothing else**. Asking the API whether the
session is still valid there would put a network call in front of the whole protected area, and a
request that is present-but-invalid is `/api/session`'s question — it is the only place that can
answer it *and* rotate while doing so. This decides routing, not authorization; the API authorizes
every tenant-scoped call regardless.

The decision is a pure function (`decideRoute`) in `src/lib/session/routing.ts`, so the gate is
tested without a Next runtime and only the adapter is untested.

## D38 — `API_PREFIX` moves into `@app/contracts`

The web app builds the URLs the API serves. A client that guessed the prefix wrong would fail
every call with a 404 that reads like a missing route — a silent failure of exactly the kind this
repository refuses elsewhere. It was a literal in `apps/api/src/app.setup.ts`; it is now a shared
value that both sides read.

Test path literals are deliberately left alone. A test asserting `/api/v1` should fail when the
prefix moves rather than move with it, which is the argument `constants.spec.ts` already makes.

## D39 — `@app/ui` gains `Input`, `Label` and `Alert`; `Secure` is explicit

The three primitives exist because the forms need them, which is the standard this repository set
for `Button`. `Alert` carries `role="alert"` and `Input` sets `aria-invalid`: a refusal reported
only through colour and position is invisible to a screen reader, and the refusal is the one thing
the user has to perceive.

`Secure` is read from `SESSION_COOKIE_SECURE` rather than inferred from `NODE_ENV`. The
behavioural stack runs the production build over real TLS while a developer runs the same build
over plain http on localhost, and a `Secure` cookie sent over http is dropped by the browser in
silence — so inferring it would make the branch unreachable in the one place able to assert it,
and would fail as an unexplained sign-out everywhere else.

---

## Out of scope

Products, checkout, inventory and idempotency UI; the generic proxy (D34); password reset,
invitations and email (none exist server-side); a client-side pre-check of the password policy —
the API's `VALIDATION_ERROR` message is shown, and importing `@app/domain` into the browser to
pre-empt it is a reasonable follow-up rather than part of this slice.

## What is not proven

- **Nothing about horizontal scaling.** The coordinator is module state, so two instances of the
  web app would each rotate. The API's reuse detection would catch it rather than lose the session
  silently, but a user could be signed out. Nothing today runs more than one instance.
- **No multi-tab test.** The rotation memory covers the mechanism a second tab depends on, and the
  concurrency test covers that mechanism, but no test opens two tabs.
- **The proxy and the Caddyfile are unchanged in intent but changed in shape.** The web site was
  added to the harness; the existing API assertions all still pass, which is what says the split
  was neutral.
