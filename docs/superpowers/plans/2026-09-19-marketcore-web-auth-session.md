# MarketCore — web session implementation plan

**Goal:** the first real user journey in `apps/web` — register, sign in, hold a session, choose an
organization, sign out — with the tokens somewhere a script cannot read them, and rotation that
cannot replay.

**Spec:** `docs/superpowers/specs/2026-09-19-marketcore-web-auth-session-design.md` (D29–D39)
**Decision:** `docs/adr/011-web-session-and-token-storage.md`

**Starting point:** `apps/web` was a shell — one placeholder route, a `Button`, one render test.
Nothing in it called the API.

## Global constraints

- The browser never holds a token. Route handlers are the only code that talks to the API.
- Every refusal a browser sees uses the API's envelope, from whichever side produced it.
- A 401 means signed out; any other failure is a failure and must not sign anyone out.
- No value an API and a client must agree on is written twice.

---

### Task 1: `@app/contracts` — two shared values

**Files:** `src/auth.ts` (`REFRESH_TOKEN_TTL_MS`), `src/constants.ts` (`API_PREFIX`),
`test/auth.spec.ts`, `test/constants.spec.ts`; `apps/api/src/auth/auth.constants.ts` (re-export),
`apps/api/src/app.setup.ts` (`setGlobalPrefix(API_PREFIX)`).

**Produces:** the refresh lifetime and the route prefix defined where both processes can reach
them, with the API re-exporting so no import site moved. Both pinned by value, because every other
test imports them and would otherwise move with a change.

**Verified:** contracts 35 tests. `apps/api` typechecks against the rebuilt `dist`, and its e2e
suite still passes — which is what proves the prefix change was neutral.

---

### Task 2: `apps/api` — `GET /api/v1/auth/me`

**Files:** `src/auth/me.controller.ts`, `auth.service.ts` (`getUser`), `auth.repository.ts`
(`findById`), `auth.constants.ts` (`USER_GONE`), `auth.module.ts`, `test/auth.e2e-spec.ts`.

**Produces:** the user a session represents. A second controller, because `AuthController` is
`@Public()` at the class level and the guard applies that to every handler on it.

**Verified:** 60 unit tests (2 new), 59 e2e (2 new). With no token, `/auth/me` is 401 — the
assertion that fails if the route moves back onto `AuthController`.

---

### Task 3: the session layer

**Files:** `lib/api/config.ts`, `lib/http/{request-id,envelope,responses,body,browser}.ts`,
`lib/auth/resources.ts`, `lib/session/{cookies,refresh,session,routing,client,server}.ts` and
their tests; `package.json`, `next.config.ts`, `.env.example`, `vitest.config.ts`.

**Produces:** a base URL resolved per call (never baked in at build time); the API's failure
envelope produced locally; typed resource calls on `@app/api-client`; the cookie attributes; the
single-flight rotation coordinator; `loadSession` with one refresh and one retry; and the pure
route decision.

**Design points that are load-bearing:**

- The coordinator is created **once per process**, because its value is shared state — a
  per-request instance removes the protection rather than merely being wasteful.
- `maxAge` is converted from milliseconds to seconds exactly once. Next takes seconds; passing the
  shared constant through would set cookies expiring in the year 800,000.
- `loadSession` treats a 401 as ordinary. The access cookie deliberately outlives the token inside
  it, so the API's 401 is the only thing that says the fifteen minutes are up.
- A non-401 failure propagates. Clearing the session on a 500 would sign a user out over a server
  bug and discard a session that is still valid.

**Verified:** 56 web tests, including six on the coordinator that assert **call counts** rather
than return values. Coverage gate ratcheted 34/45/45/34 → 52/75/55/52 (actuals 57/80/61/57).

---

### Task 4: the route handlers

**Files:** `app/api/auth/{login,register,logout}/route.ts`, `app/api/session/route.ts`,
`app/api/session/organization/route.ts`.

**Produces:** sign-in (204, cookies only), registration (201, no session), sign-out (revokes at the
API, then clears locally), the session view, and the organization choice.

**Design points:** bodies are validated against the API's own schemas, so a malformed body never
crosses the second hop and the refusal is the same envelope the API would have produced. Setting an
organization checks the id against the caller's memberships — the API would refuse it anyway, but
storing it would leave the UI claiming to act in an organization the user is not in. Sign-out
always clears the local cookies, even when the API cannot be reached, and the trade is written down
rather than left implicit.

---

### Task 5: the pages and the gate

**Files:** `app/(auth)/{layout,login/page,register/page}.tsx`, `app/(dash)/{layout,chrome,
organization-switcher,dashboard/page}.tsx`, `middleware.ts`, `app/page.tsx`, tests.

**Produces:** the journey, and a middleware gate that decides routing on cookie presence only.

**Design points:** the forms validate with the API's schemas; `?next=` is treated as hostile and
constrained to a same-origin path (`//evil.test` is rejected along with `https://evil.test`,
because a protocol-relative URL starts with `/` and is still absolute); the dashboard layout is a
Server Component only so it can read `APP_NAME`, which a client component cannot see.

**Verified:** `next build` succeeds — 12 routes and the middleware compile. 59 web tests.

---

### Task 6: the behavioural layer

**Files:** `apps/web/Dockerfile`, `docker-compose.e2e.yml`, `infra/caddy/Caddyfile`,
`apps/e2e/playwright.config.ts`, `apps/e2e/tests/web-journey.spec.ts`,
`.github/workflows/ci.yml`.

**Produces:** the web app in the harness, behind the same real proxy over real TLS, with a browser
journey — and the cookie assertions the testing strategy said belong nowhere else.

**Design points:** Caddy grows a second **site** rather than routing the web app by path, because
the BFF's route handlers and the API both serve paths under `/api`. The browser reaches
`web.marketcore.test` by a host-resolver rule, because a browser cannot be handed a `Host` header
the way a request context can. `WEB_URL` is deliberately untouched — the existing CORS assertions
assert `http://web.marketcore.test` and would break, and with a BFF the browser makes no
cross-origin API call that would need it.

**Verified:** `docker compose -f docker-compose.e2e.yml up -d --build --wait` starts the stack
(web included, healthchecked), and `pnpm --filter e2e test:behavioural` is **13 passed** — the 11
existing API assertions plus 2 browser journeys. The browser assertions are the ones no other layer
can make: that `mc_at` and `mc_rt` were *stored* at all, that both are `httpOnly` as received, that
`document.cookie` does not contain them, that `mc_at` has no expiry of its own (`-1`) while
`mc_rt` expires in the future, that signing out clears all three and the gate then refuses
`/dashboard`, and that two memberships leave the control asking and remember an answer across a
reload.

---

### Task 7: documents

**Files:** `docs/adr/011-*.md` + the index, the spec, this plan, `docs/superpowers/STATUS.md`,
`docs/testing-strategy.md`, `README.md`, `apps/e2e/README.md`.

---

### Task 8: verify end to end, then open the PR

**Verified by hand, against both servers running locally:**

| Check | Result |
|---|---|
| Sign in | 204; `mc_at` with no expiry, `mc_rt` with `Max-Age=2592000`, both `HttpOnly; SameSite=lax`, no `Secure` in dev |
| Session | the seeded user, `Nile Traders` with role `OWNER`, auto-selected as the only membership |
| Choose an organization | 204 and `mc_org` set with the session's lifetime |
| Choose one you are not in | 403 `FORBIDDEN`, in the envelope, with a `requestId` |
| Stale access token | 200 — rotated, with a new `mc_rt` and a replaced `mc_at` |
| **6 concurrent loads with one stale access token** | **exactly 1 refresh call at the API**, six 200s |
| Sign out | 204; all three cookies cleared; `/api/session` then 401 |
| The signed-out refresh token reused | 401 — the revocation reached the API, not just the local cookies |
| Unauthenticated `/dashboard` | 307 to `/login` |

The concurrency row is the one worth reading twice: six simultaneous loads that all found their
access token stale produced **one** rotation. Six would have been five replays, and the API answers
a replay by revoking the session.

**Then:** branch, commits, PR. The PR states plainly that it touches `@app/contracts`,
`apps/api`, `apps/web`, `apps/e2e` and `infra/` — not only the frontend — and why each is
necessary (D30, D33, D38, D6).

---

## Completion checklist

- [x] The browser cannot read a token; asserted in a real browser, not in principle
- [x] Concurrent stale loads produce exactly one rotation, in process and against the API
- [x] `/auth/me` is refused without a token
- [x] Every refusal uses the API's envelope, from either side
- [x] A failure to reach the API does not sign anyone out
- [x] `pnpm turbo run lint typecheck test:coverage build` green
- [x] The behavioural suite green, including the browser journey
- [x] Every value two processes agree on is defined once
