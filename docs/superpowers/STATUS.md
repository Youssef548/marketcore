# Status

The per-week evidence record. Each week closes with the phase's exit gate, the command that proves
it, and an explicit list of what remains unproven. A claim that cannot name a runnable artifact does
not appear under **Proven**.

---

## Week 1 — Phases 0 and 1 (foundation) — 2026-09-19

**Exit gate:** one command starts the API and all checks pass.
**Branch:** `week-01-foundation`
**Tag:** `w01-foundation`

### Proven

Run from a **clean clone of the committed state** into an empty directory, using the README's quick
start verbatim, with no edits:

| Check | Command | Result |
|---|---|---|
| Install generates the Prisma client | `pnpm install` → postinstall | ok |
| Migrations apply | `pnpm --filter @app/database db:generate && db:deploy` | `No pending migrations to apply.` |
| Seed runs after migrations | `pnpm --filter @app/database db:seed` | `seed: connected; 0 migration(s) applied` |
| Whole check suite | `pnpm turbo run lint typecheck test build` | **26/26 tasks** |
| Liveness | `curl .../api/v1/health` | `{"status":"ok"}` |
| Readiness, real database | `curl .../api/v1/health/ready` | `{"status":"ok","checks":{"database":"up"}}` |
| Failure envelope carries the id | `curl -H 'x-request-id: req_pr_demo' .../api/v1/nope` | `{"error":{"code":"NOT_FOUND","message":"...","requestId":"req_pr_demo"}}` |
| The id is echoed | response header | `x-request-id: req_pr_demo` |
| Swagger renders from contracts | `curl .../docs` → 200, `/docs-json` | title `marketcore API`; components `HealthDto`, `ReadinessDto` |
| Structured logs carry the id | one JSON line per request | `{"level":"log","event":"http.request.completed","context":"http","requestId":"req_…","method":"GET","path":"/docs-json","status":200,"durationMs":0.762}` |
| Reset is idempotent | `db:reset` twice | exit 0 both times |
| The db guard covers the new command | `db:seed` with mismatched `DATABASE_URL`s | exit 1; exit 0 when aligned |
| Boundary rules still bite | package→app import in `packages/runtime` | `pnpm lint` fails with `boundaries/element-types`, reverting restores green |
| CI, on GitHub | run [35448996608](https://github.com/Youssef548/marketcore/actions/runs/35448996608) and every push since | **success**, including the review-fix commit |
| Package tests | `pnpm --filter @app/<pkg> test` | contracts 9, runtime 20, api-client 8 |
| API tests | `pnpm --filter api test` | 5 unit + 9 e2e |

### Delivered

- **Phase 0 documents:** `docs/architecture.md`, `docs/domain-model.md` (ten invariants each with an
  observable, entity table with phase assignments, money widths, per-aggregate transition tables),
  `docs/failure-scenarios.md` (nine failures, eight flagship tests), `docs/adr/0001-…`.
- **`packages/runtime`** — the package ADR 001 requires: validated env, `PrismaModule`/`PrismaService`,
  request-id and request-logger middleware, JSON logger. `apps/api/src/config/` and `src/prisma/` are gone.
- **Request ids end to end** — generated or accepted, validated against injection, echoed on the
  response, present in every error envelope and in one log line per request.
- **Liveness/readiness split** with contracted responses; readiness returns 503 when degraded.
- **The first model and real seed rows.** `User` with a checked-in migration and an idempotent upsert
  seed; `db:reset` twice leaves exactly one demo row, and CI runs the sequence.
- **Seed and reset sequence**, proven against a clean database and wired into CI.
- **One shared HTTP configuration** (`apps/api/src/app.setup.ts`) used by `main.ts` and the e2e suite.
- **README rewritten** and executed; its content is verified, not aspirational.

### Not proven / deferred

- **`User` is the first model, one phase early.** It was pulled forward from phase 2 on review, and
  it is exercised rather than speculative: the migration creates it, the seed upserts into it, the
  readiness probe reads it, and CI runs all three. Phase 2 continues from it rather than redoing it.
- **No concurrency test.** The last-item race lands in phase 4 (week 3) — this is the project's
  flagship claim and it is not yet made.
- **No worker, no Redis.** Phase 10.
- **No load numbers.** Phase 13.
- **CI is green but only on the pull request path.** The `--affected` variant ran; the full
  unconditional run on `main` executes after merge. Both are the same task set, and the full one has
  been run locally in a clean clone (26/26).
- **`main` carries a Node 20 deprecation warning** from `actions/checkout@v4`, `actions/setup-node@v4`
  and `pnpm/action-setup@v4`. Informational, not a failure, but the actions will need bumping before
  GitHub's Node 20 removal.

### Findings

Five findings — three against the template, two of my own. All five were found by *running* things
rather than reading them, which is the only reason they were found at all.

1. **A contract schema cannot be both `.meta({ id })` and a `createZodDto` source.** The template's
   README instructs the first and its add-a-resource guide instructs the second; doing both on one
   response schema makes `cleanupOpenApiDoc` throw `Found multiple schemas with name 'Health'`.
   Diagnostic: removing the ids makes component names derive cleanly from the DTO class names.
   Worked around in `packages/contracts/src/health.ts` and documented in the README Conventions.
2. **The generated Prisma client is not produced by `pnpm install`,** so a fresh clone following the
   README failed at `db:seed` with `Cannot find module '.prisma/client/default'`. CI did not catch it
   because CI runs `db:generate` as its own step. Fixed with a `postinstall`; verified that
   `prisma generate` succeeds with no `.env` present, so it is safe before the env files are copied.
3. **A gap in boundary enforcement, in the package direction only.** A `packages/*` → `apps/*` import
   whose path does not resolve passes both ESLint and `tsc`: `boundaries/no-unknown` is enabled only
   for apps, and TypeScript deliberately ignores unresolved side-effect-only imports (verified:
   `import './nope'` passes, `import x from './nope'` fails). Resolvable imports are caught correctly.
   **Not fixed** — changing `packages/eslint-config` is a `globalDependencies` edit and belongs in its
   own decision. Recorded in the README's limitations.
4. **`$connect()` is not a health probe, and it looks exactly like one.** Measured against a real
   database, stopped mid-run: `$connect()` resolved on every call for 18 seconds after Postgres
   stopped, so a readiness check built on it would have reported `database: up` for as long as the
   pool stayed open. A round-trip query failed within one second, in 2–9ms, and recovered on its own
   when the database returned. This is why the probe reads a row rather than calling `$connect()`,
   and why `User` exists a phase early — a builder query needs a delegate to hang off, and there
   are no delegates without a model.
5. **The seed was never typechecked.** `packages/database/tsconfig.json` included only `src`, so
   `prisma/*.ts` was compiled by nobody — `tsx` transpiles without checking. Adding the seed to the
   include immediately surfaced a missing `@types/node` that had been invisible the whole time.

### Deviations from the source plan

- **Error envelope** keeps the template's `{ error: { … } }` shape with `requestId` added inside,
  rather than the plan's flat `{ statusCode, code, message, requestId, details }`. The template's
  envelope is one of its three invariants and no client consumes the flat shape.
- **`configureApp` extraction happened in Task 8, not Task 9** — the e2e harness needed the same
  globals, so doing it twice was waste.
- **`requestLoggerMiddleware` was added**, which the plan did not specify: the filter only logs 5xx,
  so an ordinary request produced no line for a request id to attach to, and phase 1's
  "structured logs contain a request ID" was unachievable as written.
- **Health is split into two endpoints** rather than one, so liveness stays database-free.
- **Seed rows were deferred, then pulled forward.** `User` arrived a phase early so the readiness
  probe could use the query builder rather than raw SQL; phase 2 continues from it.
- **"First Seven Days" day 6 belongs to week 2** — it is phase 2 material and the 12-week schedule
  assigns week 1 to phases 0–1.

### Review response

Sixteen review comments across two pull requests, and all of them were about the same thing: I wrote
logic with literals, declared types inline, called Prisma from a service, and reached for a
conditional where a decision table belonged. The rules were not undocumented — `ErrorCodes` in the
contracts package was already the precedent for a shared const-object enum, and I ignored it.

Applied here:

| Review point | Change |
|---|---|
| "should be on constant.ts or be shared" | `packages/contracts/src/constants.ts` (wire values) and `packages/runtime/src/constants.ts` (implementation values). No literal values left inline. |
| "this should be ENUM" | Const-object enums with derived types for health status, readiness status and dependency state, plus `READINESS_HTTP_STATUS` as the one mapping. |
| "interfaces like this should be on another file" | `request.interface.ts`, `logger.interface.ts`. Middleware and logger now hold logic only. |
| "no prisma style yet, we should have repo pattern" | `HealthRepository` owns the query and returns a typed `DependencyState`; `HealthService` no longer imports `PrismaService`. A test now guards that layering. |
| "why not ... builder" | `buildReadiness` derives `status` from the checks, and `httpStatusForReadiness` replaces the controller's conditional with one table. |
| "this can be duplicated a lot" | `buildReadiness`, `wireValues`, `httpStatusForReadiness`, and `packages/api-client/test/support/fixtures.ts`. |

Two of my own defects were found while doing this: the service spec had been stubbing Prisma rather
than the layer boundary, and the runtime and api-client vitest runs needed the same source aliasing
that `apps/api`'s jest config already had.

Written up as two reusable skills, committed here under `.agents/skills/` and installed at
`~/.agents/skills` so they apply beyond this repository: **`nestjs-code-conventions`** and
**`git-delivery-workflow`**.

### Environment notes

- **Port 5432** is also held by `hifz-tracker-project-db-1`, and **6379** by `bazaarea-redis`. Only one
  Postgres can bind at a time, so another project's container must be stopped while working here (or
  MarketCore moved to another port). Week 8 (Redis) will hit the same conflict.
- After a conflicting start, `docker compose ps` can report a healthy container with **no published
  port**, which fails any host-side connection while `pg_isready` inside the container still succeeds.
  `docker compose down && docker compose up -d` restores the mapping.

### Next

Week 2 — phases 2 and 3: identity, tenancy, catalog, inventory. Exit gate: cross-tenant tests pass.
`User` is already in place and exercised, so phase 2 adds auth against it plus Organization and
OrganizationMember, rather than building the first model again.

---

## Week 2 — Phases 2 and 3 (tenancy and catalog) — 2026-09-19

**Exit gate:** cross-tenant tests pass — one organization cannot read another's product.
**Branch:** `week-02-tenancy-catalog`
**Spec:** `docs/superpowers/specs/2026-09-19-marketcore-week-02-tenancy-catalog-design.md` (D18–D28)
**Plan:** `docs/superpowers/plans/2026-09-19-marketcore-week-02-tenancy-catalog.md` (15 tasks)

### Proven

| Check | Command | Result |
|---|---|---|
| **The gate** | `pnpm --filter api test:e2e` | **`PASS test/tenancy.e2e-spec.ts` — 8/8** |
| Cross-tenant read by identifier | under the other tenant's header | `404 NOT_FOUND`, and the response body does not contain the product name |
| Cross-tenant update / publish / inventory | same | `404` each, and the owner's product is unchanged afterwards |
| Cross-tenant listing | `GET /products` as the other tenant | `[]` |
| Header naming a tenant the caller is not in | | `403 FORBIDDEN` |
| Tenant-scoped request with no header | | `400 VALIDATION_ERROR`, message names `x-organization-id` |
| **Control: the owner still reads their own product** | | `200`, correct name — without this, every row above would also pass against a system that 404s everything |
| Refresh race | `pnpm --filter api test:integration` | exactly one of two concurrent claims rotates; 2 token rows |
| Database constraints | same | `CHECK` installed by name; negative `available` and negative `reserved` both refused; duplicate slug / membership / token hash refused |
| Enum drift | same | all five value sets agree between the const objects and the Prisma enums |
| Auth flows | `pnpm --filter api test:e2e` | register, login, rotation, replay-revokes-the-family, logout |
| Whole suite | `pnpm turbo run lint typecheck test build` | **30/30 tasks, 0 failed** |
| Unit | `pnpm --filter api exec jest` | 52 passed, 11 suites |
| End to end | `pnpm --filter api test:e2e` | 46 passed, 8 suites |
| Integration | `pnpm --filter api test:integration` | 16 passed, 4 suites |
| The 401 boundary | `pnpm --filter api test:e2e` | missing / malformed / wrongly-signed token each refused; no token on a protected route → 401 |
| The last-owner rule under concurrency | `pnpm --filter api test:integration` | two racing removals leave exactly one owner — and the test fails 3/3 with the row lock removed |
| A seeded user can authenticate | `pnpm --filter api test:integration` | the seeded hash verifies against the documented password |
| Boundary rules still bite | `packages/domain` → `apps/api` import | `pnpm lint` failed with `boundaries/element-types`, reverting restored green |

Full tenancy output is in the commit message for `89ca258`.

### Delivered

- **`packages/domain`** — pure rules shared by both processes: `TenantContext`/`tenantScope`, password
  policy, the refresh-token usability decision table, role rules, slug, product transitions.
- **Identity** — `User` continues from week 1; register, login, refresh with rotation and reuse
  detection, logout; argon2id behind a `PasswordHasher` port; access tokens stateless, refresh tokens
  hashed with SHA-256 for the reason recorded in `token.service.ts`.
- **Tenancy** — the `OrganizationGuard` resolves `x-organization-id` into a `TenantContext`;
  deny-by-default global guards with `@Public()`, `@TenantFree()` and `@OwnerOnly()` as the greppable
  opt-outs.
- **Catalog** — tenant-scoped product CRUD, explicit publish/unpublish transitions, readable inventory.
- **Six models** — Organization, OrganizationMember, Session, RefreshToken, Product, Inventory, with a
  hand-edited migration carrying the `inventory_quantities_non_negative` CHECK.
- **`test:integration` now runs inside `turbo run test`**, so the constraint, drift and race proofs are
  gated rather than sitting beside the gate.
- **ADR 010** — tenant isolation in the query layer, with RLS recorded as the week-11 revisit.

### Not proven / deferred

- **No reservations, stock movements or row locking.** Phase 4, where the last-item race justifies the
  design rather than guessing it.
- **Access tokens are not revocable.** Revocation covers sessions and refresh tokens only, so a stolen
  access token lives until it expires. Inherent to a stateless access token; that is why the TTL is
  short. Documented in the README rather than left implicit.
- **No email delivery, invitations or password reset.** Member administration adds an existing user by
  email; nothing sends that email.
- **One concurrency test, not a suite.** The refresh race is asserted; the concurrency suite with its
  own database name is still phase 4's.
- **The no-`apps/*`-import gap in `packages/*` remains** (week 1's finding 3) — unchanged, still
  recorded in the README's limitations.

### Findings

Five, all found by running rather than reading.

1. **`@nestjs/jwt@12` is ESM-only and this app is CommonJS.** `"type": "module"` with no CJS export, so
   `require('@nestjs/jwt')` fails under ts-jest. Pinned to `^11`. The plan named the package without a
   version; installing the latest was the defect.
2. **A TypeScript interface cannot be a Nest provider token.** `{ provide: PasswordHasher, ... }`
   handed the container `undefined` and boot died with `metatype is not a constructor` — an error that
   names neither the token nor the class. Provided under a string token instead.
3. **A duplicate organization slug answered 500, not the 409 the plan assumed.** Nothing mapped
   Prisma's unique violation, so it fell through the envelope's catch-all as `INTERNAL`. The fix
   returns a typed outcome from the repository, keeping the classification in the layer that owns
   Prisma.
4. **`apps/api` typechecks against a package's `dist`, not its source.** Adding `JWT_SECRET` to
   `@app/runtime` broke `apps/api` typecheck until the package was rebuilt. Turbo's `typecheck`
   depends on `^build` so the full pipeline is safe; a bare `--filter api typecheck` is not.
5. **`@nestjs/jwt@12` is ESM-only and this app is CommonJS.** `"type": "module"` with no CJS export,
   so `require('@nestjs/jwt')` fails under ts-jest. Pinned to `^11`. The plan named the package without
   a version; installing the latest was the defect.

*Measurements about the agent process itself — dispatch wall clock, turn counts, and where the time
went — are in `.superpowers/sdd/…/analytics.md`, not here. This record is for repository evidence.*

### Deviations from the plan

- **One subagent dispatch per task was abandoned.** Subagents could not install packages, which
  stopped three consecutive attempts with nothing written. The dependencies were installed by the
  controller and Tasks 7–15 were then implemented directly. Tasks 1–6 were delivered by subagents.
  The process measurements behind that decision are in `.superpowers/sdd/…/analytics.md`.
- **Tasks 8 and 9 share one commit** (`a727d4a`). The first commit swept files already written for the
  second; rather than leave a message claiming only Task 8, the message was amended to say what the
  commit actually contains.
- **The guards e2e suite moved from Task 11 to Tasks 12–14.** There were no tenant-scoped routes at
  Task 11, so testing the chain would have needed a throwaway probe controller. The guard units land at
  11 and the route-level assertions land with real routes.
- **`ARCHIVED` was dropped from `ProductStatus`.** Declared with no endpoint able to reach it — exactly
  the scaffolding the phase gate forbids. It arrives with the operation that needs it.
- **The plan's defect table** (at the end of the plan document) records eight further inconsistencies
  found while executing, including two that could not compile as written.

### Next

Week 3 — phase 4: transactional checkout, with the plan written at this gate. Exit gate: the stock-1
race passes repeatedly — 100 concurrent buyers, exactly one order. Everything needed to build it now
exists: tenant-scoped repositories, a `TenantContext` the worker can share, and a real database to run
the race against.

---

## Frontend slice — web session and organization selection — 2026-09-19

**Exit gate:** a browser signs in, holds a session through a stale access token and concurrent
requests, chooses an organization, signs out — and cannot read either token.
**Branch:** `feat/web-auth-session`
**Spec:** `docs/superpowers/specs/2026-09-19-marketcore-web-auth-session-design.md` (D29–D39)
**Plan:** `docs/superpowers/plans/2026-09-19-marketcore-web-auth-session.md` (8 tasks)
**ADR:** [`011`](../adr/011-web-session-and-token-storage.md)

### Proven

| Check | Command | Result |
|---|---|---|
| **The gate** | `pnpm --filter e2e test:behavioural` | **14/14**, including 3 browser journeys |
| **The behavioural job, in CI** | run [35462183755](https://github.com/Youssef548/marketcore/actions/runs/35462183755) | **pass, 2m53s** — its first green run ever; see finding 6 |
| The whole check suite | `pnpm turbo run lint typecheck test:coverage build` | **31/31 tasks** |
| Unit | `pnpm --filter api exec jest` | 60 passed, 12 suites |
| End to end (API) | `pnpm --filter api test:e2e` | 59 passed, 10 suites |
| Integration | `pnpm --filter api test:integration` | 16 passed, 4 suites |
| Contracts | `pnpm --filter @app/contracts test` | 35 passed, 7 files |
| Web | `pnpm --filter web test` | 59 passed, 10 files |
| Web coverage gate | `pnpm --filter web test:coverage` | 57.04/80.28/60.71/57.04 against a raised 52/75/55/52 |
| **`/auth/me` is not public** | `pnpm --filter api test:e2e` | a token returns the user; **no token is 401** |
| **One rotation for concurrent loads** | `pnpm --filter web test` | 6 coordinator tests, asserting call counts |
| **One rotation, measured at the API** | by hand, 6 concurrent session loads | **exactly 1** `/auth/refresh` in the API's log, six 200s |
| A stale access token rotates | by hand | 200 with a new `mc_rt` and a replaced `mc_at` |
| Cookie flags as a browser received them | behavioural suite | `httpOnly` both, `Secure` both, `SameSite=Lax`, `mc_at` `expires -1`, `mc_rt` in the future |
| Tokens unreadable from the page | behavioural suite | `document.cookie` contains no `mc_` |
| The gate after signing out | behavioural suite | `/dashboard` → `/login?next=%2Fdashboard` |
| Boundary rules still bite | a `packages/*` → `apps/*` import | `pnpm lint` failed with `boundaries/element-types`; reverting restored green |

### Delivered

- **`apps/web` is no longer a shell.** Register, sign in, sign out, a session-backed dashboard, and
  an organization switcher — the first thing in the app that talks to the API.
- **A BFF, per ADR 011.** Tokens in `httpOnly` cookies; route handlers are the only code that
  reaches the API; the browser never holds a credential a script could read.
- **Single-flight rotation** with one step of memory, because the API revokes a session on a
  replayed refresh token and naive concurrency *is* a replay.
- **`GET /api/v1/auth/me`**, in its own controller — `AuthController` is `@Public()` at the class
  level, so a handler added there would have been reachable with no credentials.
- **Two shared values** moved to `@app/contracts`: `REFRESH_TOKEN_TTL_MS` (the web app sets a cookie
  lifetime from it) and `API_PREFIX` (the web app builds the API's URLs).
- **The web app in the behavioural harness** — its own image, a Caddy site, and a Playwright
  journey. CI now installs Chromium, and the job that had never passed now does.
- **The web app's stylesheet actually contains the design system.** It never had: Tailwind 4 skips
  `node_modules`, where `@app/ui` is symlinked, so every class defined in the shared package was
  missing — including the primary Button's background. Found by looking at the rendered page rather
  than at the markup, and pinned by a browser assertion on *computed styles*.
- **The web app is explicitly light, and says so.** `globals.css` had been handing the background to
  `prefers-color-scheme` while every component colour was a light-mode grey.
- **The coverage gate ratcheted** 34/45/45/34 → 52/75/55/52.

### Not proven / deferred

- **No multi-instance story.** The rotation coordinator is module state, so two web instances would
  each rotate; the API's reuse detection would catch it rather than lose the session silently, but a
  user could be signed out. Nothing runs more than one instance today.
- **No multi-tab test.** The mechanism a second tab depends on is covered by the concurrency test;
  the two-tab case itself is not. **(Closed 2026-10-10 — see "Closing the deferred list" below: two
  tabs loading at once now assert one session rather than a replay.)**
- **No tenant data page.** `/api/proxy/[...path]` has no caller yet and is deliberately absent (D34).
  `mc_org` is written and read for display; its first *authorizing* use arrives with the products
  page, which is where the header starts being attached.
- **Nothing sends email**, and there is still no password reset or invitation — unchanged from week 2.
- **`WEB_URL` was left as it was.** The CORS assertions assert `http://web.marketcore.test` and would
  break, and with a BFF the browser makes no cross-origin API call that would need it.

### Findings

Six, all found by running rather than reading.

1. **Next refuses a cookie write during a Server Component render.** The plan had the protected
   layout load the session server-side. That cannot rotate: the render would refresh and be unable to
   store the replacement, so the *next* request would present the superseded token and be refused as
   a replay — the API revoking the session, caused by where the refresh happened. The session moved to
   a route handler and the protected area became client-rendered. This is now ADR 011's central
   consequence: it looks like a style choice and is a platform constraint.
2. **A bare in-flight map does not cover the case that actually happens.** The near-miss — a request
   that left the browser before a rotation settled, still carrying the superseded token — is not
   solved by sharing an in-flight promise, because that promise has already resolved. It needs a
   record of the last rotation. Both mechanisms are now tested, and the second one only because the
   first was written down and found insufficient on inspection.
3. **`page.request` does not use the browser's DNS.** The journey's last assertion reached the web app
   by its public name through the API request context and failed with `ENOTFOUND`: that context
   resolves through Node, and the host-resolver rule is a browser argument. The assertion is issued
   from inside the page instead, which is also more honest — it is the session's own cookies that are
   under test.
4. **A strict-mode selector was a real ambiguity, not a test artefact.** `getByText(email)` matched
   the header and the dashboard body, because both legitimately name the signed-in user. Scoping to
   the header is a better assertion than a looser one: it is the shell's own claim.
5. **A pre-existing property test was flaky, and the full suite caught it.** `pnpm turbo …` failed
   once in `packages/domain/test/refresh-token.property.spec.ts` and passed on an immediate re-run —
   the worst shape a failure can have, because re-running is exactly what makes it disappear.
   `fc.date()` generates `Invalid Date` (24 draws in 20 000, measured on fast-check 4.10.1), and
   every comparison against it is false, so the USABLE equivalence disagreed with the decision table
   with a counterexample reading like a logic error. Fixed with `noInvalidDate: true`, which is the
   only in-repo use of `fc.date`. It is unrelated to this slice and would have gone on failing builds
   at random if the full suite had not been run.
6. **The behavioural job has never passed in CI, and this branch is what surfaced it.** The job ran
   `pnpm install` and then the suite, but the suite imports `@app/contracts`, which resolves from that
   package's built `dist/` — and `dist/` is gitignored, so a fresh runner has none. Nothing in the job
   built it: `docker compose up --build` compiles inside the image, not on the host. It failed as
   `Cannot find module …/@app/contracts/dist/src/index.js` and `No tests found` on **every** run since
   the job was added, including the merge to `main` (`35459274354`) and its own introducing branch
   (`35459015301`) — which is why week 2's record says the suite is green from a developer's machine
   and says nothing about CI. Fixed with one step, `pnpm --filter "e2e..." run build`. Reproduced
   without Docker by deleting `dist/` and running `playwright test --list`: 0 tests, then 13 after the
   build. **The lesson is the same one week 1 recorded about `db:generate`**: a job that passes because
   of state the developer already had is not a job that tested anything.

### Deviations from the plan

- **The request id is not stamped by middleware.** It is generated in the layer that calls the API:
  middleware runs on the Edge runtime, and the id has to reach the API from a route handler.
- **The dashboard is client-rendered**, for finding 1. The plan assumed a Server Component.
- **`API_BASE_URL` is the API origin only**, with `/api/v1` appended from the shared constant, rather
  than a full base URL configured by hand.
- **`(auth)` is used for the credential pages**, not the README's `(marketing)` — a login form is not
  marketing. The README now records the convention that exists rather than the one that was planned.

### Next

Week 3 — phase 4: transactional checkout and the stock-1 race. The web app now has a session to build
the first tenant data page on, which is also where the generic proxy (D34) and the
`x-organization-id` header arrive.

---

## The web design system — selvedge — 2026-09-19

**Exit gate:** the app's look is one file and the contrast test re-reads it — every text-on-surface
pair clears 4.5:1, and no component names a colour.
**Branch:** `feat/web-design-system` (stacked on `feat/web-auth-session`, per D51)
**Spec:** `docs/superpowers/specs/2026-09-19-marketcore-design-system-design.md` (D40–D51)
**Plan:** `docs/superpowers/plans/2026-09-19-marketcore-design-system.md` (9 tasks)
**ADR:** [`012`](../adr/012-component-layer.md)

### Proven

| Check | Command | Result |
|---|---|---|
| **The gate, as a test** | `pnpm --filter @app/ui test` | **18 passed, 5 files**; worst text-on-surface pair **4.58:1** (`ink-faint` on `sunken`) |
| Every semantic token is a literal | same | no `color-mix()`, no relative colour syntax — the test refuses anything that is not `oklch()` |
| Exactly the names the components reference | same | the declared `--color-*` set equals the 23-name list D41 fixes |
| Palette names and role names stay apart | same | no palette family shares a name with a semantic token |
| The text ramp stays ordered | same | `ink` darker than `ink-muted` darker than `ink-faint` |
| **The field error is described, not adjacent** | same | the input's `aria-describedby` resolves to the element carrying the message; **removing the attribute fails 1/1** |
| `busy` keeps the keyboard | same | not `disabled`; `aria-busy` + `aria-disabled` set; the click is refused |
| Role names, not colours, in every component | `grep -rE "(bg\|text\|border)-(gray\|brand\|red\|green)" apps/web/src packages/ui/src` | no match — and re-introducing `text-gray-600` makes the check fail |
| No component reaches into the palette | `grep -rn "palette-" packages/ui/src` | no match |
| **The theme is light, asserted as a property** | `pnpm --filter e2e test:behavioural` | **14/14**; under an emulated dark OS, page luminance > 0.7 and body text ≥ 7:1 — no `rgb(255, 255, 255)` anywhere |
| The primary action is painted and is not the page | same | non-transparent, and differs from the page it sits on |
| The whole check suite | `pnpm turbo run lint typecheck test build` | **33/33 tasks**, 0 failed |
| Web | `pnpm --filter web test` | 68 passed, 12 files |
| Web coverage gate | `pnpm --filter web test:coverage` | 59.9/81.16/63.93/59.9 against a held 52/75/55/52 |
| API unit / e2e / integration | `pnpm --filter api test` | 60 / 59 / 16 — untouched by this phase, run to prove it |
| Contracts | `pnpm --filter @app/contracts test` | 35 passed, 7 files |
| Boundary rules still bite | a resolvable `packages/ui` → `apps/web` import | `pnpm lint` fails with `boundaries/element-types`; reverting restores exit 0 |

### Delivered

- **The token layer `packages/ui` was missing** — three layers in one file: a palette of raw OKLCH
  named by colour family, a semantic layer named by role and declared as `--color-*` so Tailwind 4
  generates the utilities, and selvedge's one set of palette values. Spacing deliberately not
  redefined.
- **Contrast as a mechanism rather than a promise** — 25 text-on-surface pairs, the WCAG computation
  written out in the test and re-derived from the literals in CI.
- **`Button` (variants, sizes, `busy`), `Input` (sizes, `invalid`, focus ring), `Label`, `Alert`, and
  the new `Field`** — the last of which closes a real defect: four fields across two forms rendered an
  error paragraph with nothing linking it to its input.
- **The shell in `apps/web`** — a rail owning the tenant and its picker, a top bar owning the page
  title and the signed-in user, each fact in one place.
- **Sign-in, register and the session screen rebuilt** on the primitives, with no ad-hoc grey left and
  no `--background`/`--foreground` second vocabulary in `globals.css`.
- **ADR 012**, with shadcn/ui as the rejected alternative and the three reasons stated.
- **The ready-session deepening**, from a frontend architecture review run after the plan: `useSession`'s
  four-arm union was narrowed by five modules — four of them unreachably — and the active organization
  was derived independently by two of them. The session module now provides a resolved `ReadySession`
  to the signed-in subtree, so the shell is the only module that branches, and membership is applied
  once. 5 new tests pin the interface, including that a signed-in module outside the shell throws
  rather than silently rendering nothing.

### Not proven / deferred

- **The input's border is 1.96:1** — `rule-strong` on `canvas`, under the 3:1 WCAG 1.4.11 asks of a UI
  component boundary. D49's test is text-on-surface only, so this is recorded rather than fixed. The
  focus ring does clear 3:1 on every surface it is drawn against (3.25 / 3.61 / 3.90 on canvas, panel
  and rail).
- **No lint rule forbids a colour literal in a component.** The check that no component names a colour
  is a `grep`, not a test, and a grep is a habit rather than a gate.
- **No visual regression testing**, refused by the spec's own reasoning: there is no stable rendering
  environment, and a flaky visual gate is worse than none.
- **The products page and everything that proves selvedge's signature** — the status thread, the
  quantity track, the published/draft colours (D48). The direction lands here as its palette, its
  plane and its type; its signature arrives with the first table.
- **Dark mode**, and `color-scheme: light` is what says so (D50).
- **The other four architecture-review candidates** — one routing module, the BFF protocol seam, the
  session port's second adapter, and the design system's uncalled variants. Reported and not acted on;
  the report is in the OS temp directory and is deliberately not committed.
- **Nothing sends email**, no password reset, no invitations — unchanged from week 2.

### Findings

Five, all found by running rather than reading.

1. **A TypeScript interface cannot widen an inherited prop.** `InputProps extends
   InputHTMLAttributes<HTMLInputElement>` with `size?: InputSize` does not compile: `size` is already
   `number` on the DOM attributes, and TS2430 rejects the narrowing. The plan carried it as written;
   the fix is `Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>`. A plan step that had never been
   compiled is a plan step that has not been checked.
2. **Tailwind 4 tree-shakes `@theme` variables that no utility uses.** An `@theme` block whose values
   are `var()` chains emits *nothing* until a source file references the generated utility — so the
   plan's "build, then grep the stylesheet for `.bg-canvas`" step, written before any component used
   the new names, would have proved nothing and read as a failure. Verified instead with a throwaway
   probe file that referenced the classes. The check moved to after the pages were rebuilt, where it
   passes because the classes exist. **The general form is worth keeping:** a build-and-grep check has
   to be run at a point where the thing being grepped for should exist.
3. **`import.meta.url` is not a file URL under Vitest's jsdom environment.** `readFileSync(new
   URL('../src/tokens.css', import.meta.url))` failed with `The URL must be of scheme file`. The
   contrast test declares `// @vitest-environment node`, which is the right environment for it anyway:
   it is pure computation and touches no DOM.
4. **Week 1's finding 3, re-confirmed while proving the boundary.** A `packages/*` → `apps/*` import
   whose path does not resolve passes ESLint silently — the first attempt used one `..` too many and
   lint reported only `no-unused-vars`, not the boundary violation. With a path that resolves it fails
   as `boundaries/element-types` and reverting restores exit 0. The check is only a check when the
   import resolves.
5. **Two of the exploration's values could not support 4.5:1, measured in OKLCH.** The spec says the
   values come from the exploration set and that the contrast test re-derives them; converting that
   set showed `ink-faint` on `sunken` at 3.77:1 and the rail's muted ink on `rail-hover` at 3.83:1.
   Corrected — and `ink-muted` moved *with* `ink-faint`, because darkening the faint step alone would
   have made it indistinguishable from the muted one and quietly erased the ramp.

### Deviations from the plan

- **Three semantic names added to D41's list.** `--color-rail-hover`, `--color-rail-active` and
  `--color-ink-on-rail-muted`. The direction's own mockup paints all three — a rail needs a hover
  plane, a selected plane and secondary text — and the list covers none of them. Without the third,
  the rail's role label and inactive nav are either unreadable or unexpressible.
- **Task 1's Step 5 moved to Task 6** for finding 2.
- **`InputProps` corrected** for finding 1, and the plan's snippet edited in place.
- **`--radius-brand` is 7px**, the direction's radius, rather than the template's 12px. D41 does not
  mention radius.
- **The plan's `chrome.test.tsx` assertion was rewritten before it was trusted.** Asserting the
  organization's name appears exactly once fails legitimately: the switcher's own `<option>` names it.
  The assertion is scoped to the two landmarks instead — the rail contains the tenant and not the
  user, the top bar the reverse — which is what "one fact, one place" actually means.
- **The ready-session deepening is not in the plan.** It came from a frontend architecture review run
  after the plan was executed. Ruling: it lands on this branch rather than a third stacked one,
  because it reshapes the shell this phase introduced and a separate branch would cost more than it
  separates. It is named in the plan's branch and in the pull request so a reviewer can read the two
  as two reads.
- **`(dash)`'s dashboard copy** now says "choose one in the rail" rather than "above", because the
  picker moved.

### Next

The products page: the first table, the first `x-organization-id` header on a real fetch, the first
caller for the generic proxy (D34) — and selvedge's signature moves, which this phase deliberately
deferred rather than shipping a thread nothing draws (D48).

---

## Auth security-event logging — 2026-10-10 (hardening)

**Claim:** the auth module records the two security-relevant outcomes its HTTP responses deliberately
hide — a refused login, and a refresh-token replay that kills a session.
**Branch:** `feat/auth-security-event-logging`

### Proven

| Check | Command | Result |
|---|---|---|
| The events are emitted | `pnpm --filter api exec jest src/auth/auth.service.spec.ts` | 15 passed — `auth.login.failed` for an unknown email and a wrong password alike, `auth.refresh.reuse_detected` naming the revoked session on a replay |
| The API still boots and behaves | `pnpm --filter api test:e2e` | 10 suites, 59 tests passed |
| Whole-repo gate | `pnpm turbo run lint typecheck test build` | **33/33 tasks** |

### Not proven / deferred

- **No request id on a domain event.** `AuthService` has no access to the request and there is no
  async-context store, so an event cannot be correlated to the `http.request.completed` line for the
  same request. `nestjs-cls` is a separate decision, not smuggled in here.
- **Nothing consumes the events.** They exist to be grepped; a sink that acts on them (lockout after N
  failures, alerting) is later phase work.
- **The attempted email is logged.** It is what makes a credential-stuffing run investigable, and it is
  the identifier the caller supplied rather than a secret — but it is user data in a log line, noted
  rather than buried.

---

## Auth DI tokens and JWT claims — 2026-10-10 (hardening)

**Claim:** the auth module's interface-backed dependencies are keyed by symbols, and its access tokens
are scoped to this API by an issuer and audience.
**Branch:** `chore/auth-di-token-jwt-claims`

### Proven

| Check | Command | Result |
|---|---|---|
| A foreign token is refused | `pnpm --filter api exec jest src/auth/tokens/token.service.spec.ts` | 7 passed — the token carries `iss`/`aud`, and one minted for another issuer or audience is rejected |
| Whole-repo gate | `pnpm turbo run lint typecheck test build` | **33/33 tasks** |

### Notes

- `PASSWORD_HASHER` and `AUTH_LOGGER` are now `Symbol`s rather than strings, so a token cannot be
  matched by an unrelated provider that happens to spell the same name. The reason a token is needed
  at all — an interface is erased at runtime — is unchanged.
- The issuer and audience are fixed constants, not environment values: there is one of each and
  neither varies per deployment. If a second consumer that must reject these tokens appears, that is
  when they move to configuration.

---

## Auth rate limiting — 2026-10-10 (hardening)

**Claim:** the auth endpoints refuse a client that exceeds a per-endpoint request cap, in the shared
error envelope, without touching ordinary sign-in traffic.
**Branch:** `feat/auth-rate-limiting`

### Proven

| Check | Command | Result |
|---|---|---|
| The cap is enforced | `pnpm --filter api exec jest --config ./test/jest-e2e.json --runInBand test/throttle.e2e-spec.ts` | 1 passed — the 21st login in a minute from one client is 429 with code `TOO_MANY_REQUESTS`; the first is an ordinary 401 |
| The envelope carries the new code | `pnpm --filter @app/contracts test` | 35 passed |
| Nothing existing trips it | `pnpm --filter api test:e2e` | 11 suites, 60 tests passed |
| Whole-repo gate | `pnpm turbo run lint typecheck test build` | **33/33 tasks** |

### Notes

- `@nestjs/throttler` throttles **this module's routes** (a controller-level `ThrottlerGuard`), not the
  whole app, so no other route's behaviour changes.
- The cap is 20 requests per minute, per endpoint, per client (`auth.constants.ts`) — deliberately
  above what any suite or an ordinary sign-in does. The bound is on requests rather than on failures,
  because a wrong password costs the same as a right one.
- `TOO_MANY_REQUESTS` is a new `ErrorCodes` member plus a 429 arm in the filter, so a throttled
  response uses the same envelope as every other failure and a client still branches on `code`.

### Not proven / deferred

- **No lockout or backoff after repeated failures.** The limiter bounds a rate; it does not lock an
  account. That, and alerting on the `auth.login.failed` volume, remain later work.
- **In-memory storage, one process.** A second instance counts separately, so the effective limit
  scales with instance count. A shared store is phase 8/10 material.
- **No `Retry-After` header.** The envelope names the code; it does not tell the client when to retry.

---

## The design direction — Quartz — 2026-10-10

**Claim:** the shipped design system is a direction chosen by looking at rendered options rather than
by preference, and every text-on-surface pair it paints clears 4.5:1.
**Branches:** `design/quartz-tokens`, `design/quartz-shell`, `design/quartz-docs`
**ADR:** [`013`](../../adr/013-design-direction-quartz.md), superseding the direction fixed by D42

### Proven

| Check | Command | Result |
|---|---|---|
| **The contrast mechanism** | `pnpm --filter @app/ui test` | **18 passed** — all 25 painted pairs clear 4.5:1 (minimum 4.7:1), 23 declared names match the interface, ramp ordered |
| The values are literals | same | every `--color-*` resolves to a literal `oklch()` through `--palette-*`, so contrast is readable before it ships |
| Whole-repo gate | `pnpm turbo run lint typecheck test build` | **33/33 tasks** — with the web build fetching DM Sans and DM Mono |
| Behavioural, real browser over TLS | `docker compose -f docker-compose.e2e.yml up -d --build --wait` + `pnpm --filter e2e test:behavioural` | **14/14**, including *paints the shared design system instead of shipping it unstyled* |
| The real app, measured | signed in through the stack | `font-family: "DM Sans"`, canvas `oklch(0.9765 0.0054 275)`, rail `oklch(0.1604 0.0152 272.2)`, rail **252px**, Sign out border **1px** |
| One fact, one place survives the re-skin | `pnpm --filter web test` | the tenant is still only in the rail and the user only in the top bar |
| Design deliverables regenerate | `node docs/design/deliverables/generators/gen-ui.mjs` | 13 screens × 2 skins, no clipping, no console errors |
| Diagrams still layout-clean | regenerate + headless check | no text out of frame, no colliding labels |

### Delivered

- **Quartz is the direction**, recorded as an ADR rather than only in a spec, because it has now been
  changed once and a superseded direction is not where the current one should be found.
- **The token layer re-derived**: the same 23 semantic names, new values, all as literal `oklch()`.
- **The components and the shell painted**: a real `secondary` button variant (`ghost` removed — a
  bordered ghost names a thing it does not paint), one shared control height, DM Sans + DM Mono, the
  rail's mark and 252px width, a user chip, and credential pages on a card.
- **`ui/tokens.json`** — the Quartz set in Tokens Studio shape, so a Figma library can read the same
  vocabulary the code does.
- **A 13-screen UI board**, two skins, generated from one script so the board and the tokens cannot
  disagree.

### Findings

Five, all found by measuring rather than by looking.

1. **The drawn values failed the gate, and the gate was right.** Ten of the twenty-five pairs the
   components actually paint fell short: `ink-faint` 2.32:1 on `sunken`, emerald 2.98:1 on its own wash,
   crimson 4.12:1 on its own wash, and hover indigo 4.47:1 against white. Each was darkened along its
   own hue. **The general form:** a palette that has only ever been looked at has not been measured, and
   the difference between "looks fine" and "clears 4.5:1" is invisible to the eye at exactly the values
   where it matters.
2. **A quoted font family inside an inline `style` attribute truncates it.** `style="--font:"DM Sans"…"`
   ends at the second quote, so the font *and every custom property after it* silently did not apply.
   Found because the rendered page kept the fallback font while the CSS looked correct. Unquoted
   families are valid CSS and are now used.
3. **A missing `display: flex` on a wrapper passed every automated check and still looked wrong.** The
   shell's rail stacked *above* the content and the page had a screen-sized hole. Only a person looking
   at the render sees this; measuring it afterwards (top bar at `y=670` instead of `0`) is what turned
   "looks off" into a defect with a fix.
4. **A screenshot assertion reads colours, so a theme change is what finds the assertions that pin
   them.** The web journey's design assertion had already been rewritten to assert *properties*
   (luminance, contrast) rather than `rgb(255,255,255)`, which is why the direction change did not break
   it — and the change is the only thing that would have proved it.
5. **A generator that passes a joined string to a helper expecting an array fails loudly**, which is
   the good news; the same class of mistake in a template is silent. Four `tableCard` calls had the
   argument one position out.

### Not proven / deferred

- **Only one theme ships.** Graphite (dark) exists in the board and in `ui/tokens.json`; `apps/web`
  renders one light theme and `color-scheme: light` says so.
- **No visual regression testing**, unchanged from the previous phase and for the same reason: no
  stable rendering environment, and a flaky visual gate is worse than none.
- **The diagrams are not re-tinted.** `flows/` and `system-design/` colour by actor and outcome; in a
  diagram a colour is a legend. They are the one place the set is not one palette.
- **The products page still does not exist**, so the direction's table is designed and not built. The
  board is the specification for it.
- **DM Sans and DM Mono are fetched at build time**, so a networked build is required. Geist was
  fetched the same way; this is two families rather than one.

---

## Closing the deferred list — 2026-10-10

**Claim:** every gap the previous sections recorded and that did not belong to a later phase is
closed, with a test that would fail if it reopened.
**Branches:** `design/graphite-theme`, `feat/products-page`, `fix/guard-rail-gaps`
**Introduced:** PR 1 of 3 in `design/quartz-tokens` was the token layer; these four are the rest.

### Proven

| Check | Command | Result |
|---|---|---|
| Both themes' contrast | `pnpm --filter @app/ui test` | **28 passed** — 24 tokens, 25 text pairs and 2 control boundaries per theme |
| The rules fire | `pnpm --filter @app/eslint-config test` | **10 passed**, a fixture per shape |
| Whole-repo gate | `pnpm turbo run lint typecheck test build` | **33/33** |
| Behavioural, real browser over TLS | `docker compose -f docker-compose.e2e.yml up -d --build --wait` + `pnpm --filter e2e test:behavioural` | **16/16** |
| The dark theme, in a browser | same | a dark OS yields a light page; choosing dark yields luminance < 0.3 with body text ≥ 4.5:1 |
| The first tenant page | same | `/products` shows the seeded product — which is only possible if the request carried `x-organization-id` |

### Delivered

- **Graphite ships.** A second palette under `[data-theme='dark']`, a cookie the server reads, a toggle
  in the top bar, and `tokens.spec.ts` checking both themes.
- **The products page**, and the BFF route that carries `x-organization-id` for it.
- **`control-edge`** — a control boundary that clears WCAG 1.4.11's 3:1 in both themes, separate from
  the decorative hairline.
- **Two ESLint rules** that close the boundary hole, and one that forbids a colour literal in a
  component — the check that used to be a `grep`.

### Findings

1. **The behavioural colour assertions were measuring nothing.** The helper parsed `rgb(r, g, b)` from
   `getComputedStyle`, but the tokens are literal `oklch()`, so Chrome returns `oklch(…)` — and its
   digits were being read as RGB channels. "Body text clears 7:1" had been passing on garbage since it
   was written. Colours are now read as sRGB bytes through a canvas.
2. **The documented boundary gap was mis-stated, and the fix needed two rules.** `boundaries/no-unknown`
   does not report an unresolvable path — it reports a file that *resolves* and belongs to no element.
   The recorded hole (a path that resolves to nothing) needed `import/no-unresolved`, which no one had
   added. A fixture per shape is what found it.
3. **A rule can be configured correctly and still never run.** The colour-literal fixture failed to
   parse ("Unexpected token <") because the fixture workspace did not enable JSX, so the rule was
   green on nothing. A lint rule with no fixture proving it fires is a rule nobody has tested.
4. **Deriving the dark palette found a bug the light one hid:** the active rail item carries a *light*
   accent in dark, so `ink-on-rail` failed there at 2.5:1. The component now uses `ink-on-action`.
5. **A strict-mode locator found duplicate page titles.** The top bar's `h1` and the page's `h2` both
   said "Products"; scoped the assertion to the banner, the same ruling the repo made for the email.

### Not proven / deferred

- **The two-tab case is now tested.** Two tabs loading at once against one session assert one rotation
  rather than a replay — the case the coordinator exists for and nothing exercised.
- **No multi-instance story** — unchanged, and phase-10 material.
- **No visual regression testing.** Refused again, and for the reason it was refused the first time:
  the behavioural suite runs on the host against a containerised stack, so a committed screenshot
  baseline would compare macOS and Ubuntu rendering and fail for a reason that is not the code.
  Closing it properly means running the browser inside the same image — its own change, not a line in
  this one.
- **The products page is read-only**, and lists three fields. The rest of the catalog — create, edit,
  publish, inventory — is phase 3's remaining surface, not this change's.
- **Everything in the Roadmap from phase 4 on.** Those are the plan, not gaps.

---

## Module folder structure — 2026-10-10 (architecture)

**Claim:** every `apps/api` module has the same shape — `dto/`, `repositories/` and `interfaces/`
folders, with controllers, services and the module file at the root — and the convention that says so
can no longer drift from the code, because the skill that documents it now states the folder layout
and carries a check that fails on a loose file.
**Branch:** `refactor/module-folder-structure`

### Proven

| Check | Command | Result |
|---|---|---|
| Whole-repo gate | `pnpm turbo run lint typecheck test build` | **33/33 tasks** |
| Lint and typecheck | `pnpm turbo run lint typecheck` | **25/25 tasks** |
| Unit | `pnpm --filter api exec jest` | 66 passed, 12 suites |
| End to end | `pnpm --filter api test:e2e` | 60 passed, 11 suites |
| Integration | `pnpm --filter api test:integration` | 16 passed, 4 suites |
| The folder rule | the skill's check 3 — loose `*.dto.ts` / `*.repository.ts` / `*.interface.ts` in a module root | no hits |
| No service touches Prisma | the skill's check 2 | no hits |

### Delivered

- **`organizations/`, `auth/`, `catalog/` and `modules/health/` restructured** into `dto/`,
  `repositories/` and `interfaces/` folders. They were flat, suffix-named files; a module root now
  carries only controllers, services, adapters, `*.constants.ts` and the module itself.
- **Two single-service capability folders dissolved.** `auth/tokens/token.service.ts` is now
  `auth/token.service.ts` and `auth/password/argon2-password-hasher.ts` is
  `auth/argon2-password-hasher.ts`; their interfaces moved to `auth/interfaces/`. A folder holding one
  service is nesting with no reader.
- **`apps/api/src/common/` created** for code that belongs to no module —
  `interfaces/request-context.interface.ts` (imported by guards, decorators and controllers in three
  modules) and `constants/api.constants.ts` (the former `src/constants.ts`).
- **The two authorities now agree, and that contradiction was the actual defect.**
  `nestjs-code-conventions` Rule 3 required a type to sit *beside* the logic it serves — the flat
  layout this change removes — while `nestjs-best-practices`' `arch-feature-modules` rule showed a
  `dto/` folder. Rule 3 now states the folder layout and check 3 enforces it; the best-practices rule
  shows `repositories/` and `interfaces/` folders instead of a flat `users.repository.ts`. The project
  copy and the `~/.agents/skills` copy are byte-identical again.
- **`AGENTS.md` and the `backend-developer` agent** carry the rule, so it is stated where the work is
  specified and where it is implemented.

### Not proven / deferred

- **`filters/`, `http/` and `security/` were left where they are.** They are app-level infrastructure
  rather than feature modules, so the folder rule does not reach them — `security/` keeps its
  `guards/` and `decorators/` type folders.
- **`filters/error-envelope.dto.ts` is a `.dto.ts` outside a `dto/` folder and is imported by nothing.**
  It is dead rather than misplaced, so it is recorded here and left untouched instead of being moved
  or deleted as part of a layout change.
- **`packages/*` still keep `<subject>.interface.ts` beside `<subject>.ts`.** The folder layout is a
  feature-module rule; the packages were out of scope, and Rule 3's package paragraph still prescribes
  their beside-logic layout.

### Findings

1. **A worktree has no `.env` files, and the suite fails before it runs a test.** They are gitignored
   and `dotenv` resolves from each package's cwd, so `apps/api/.env`, `apps/web/.env` and
   `packages/database/.env` each had to be copied in by hand. The first run failed all 11 e2e suites
   with `JWT_SECRET: expected string, received undefined`, which reads like a code defect and is a
   missing file.
2. **Two convention skills disagreed, and a convention two skills disagree on is enforced by
   neither.** The flat `organizations/` was not an oversight — it was Rule 3 obeyed — while the
   best-practices rule asked for the folder. Both had to be corrected together or the next module
   would have picked whichever the author happened to read.

## The first-run flow — 2026-10-10

**Claim:** a user who registers can get from "signed in, belongs to nothing" to a working shell,
entirely through the UI.
**Branch:** `feat/first-run-onboarding`
**Plan:** `~/.commandcode/plans/marketcore-first-run-onboarding.md`

### Proven

| Check | Command | Result |
|---|---|---|
| The gate and the loop | `pnpm --filter e2e test:behavioural` | **20/20** — register → sign in → the first-run screen → create → the shell, with that tenant's (empty) catalog |
| It is a gate, not a hint | same | `/products` asked for directly still shows the first-run screen |
| The shell is admitted by the reload | `pnpm --filter web test` | **73 passed** — a session with no organizations renders onboarding and not the rail |
| Whole-repo gate | `pnpm turbo run lint typecheck test build` | **33/33** |
| The design matches | regenerate + headless check | **14 board screens**, `flows/` at 17 diagrams, no clipping, nothing out of frame |

### Delivered

- **`POST /api/organizations`** at the BFF — the first route in this app that can be called by someone
  with **no tenant**, because the API's own create is `@TenantFree()` and it has to be: a request that
  required a header could never create the first organization.
- **`Onboarding`** — rendered *instead of* the shell, not inside it. A user with no tenant has no
  working controls to be shown, so showing them the shell is the dead end this replaces.
- **The dead branch removed** from `organization-switcher.tsx`: the gate makes "no organizations"
  unreachable inside the shell, and dead code that looks load-bearing is worse than none.
- **The board and the flows** carry the screen and the journey, so the design cannot drift from it.

### Findings

1. **The design had the same hole as the code**, which is why it went unnoticed for so long: the board
   was drawn entirely against seeded data, and no seeded user lacks an organization. A mockup built on
   fixtures cannot show a state the fixtures exclude.
2. **A passing test can be a statement about the wrong behaviour.** The existing journey registered a
   brand-new user and asserted they reached the shell — which is exactly what was broken. Adding the
   gate made it fail, and the failure was the test being *right* about the bug and wrong about the
   intent. It now creates an organization through the API first, because its subject is the session
   and its cookies.
3. **A screenshot-like assertion is easier to write than to scope.** `getByText('Nile Traders')` matched
   twice — the rail and the switcher's `<option>` — the same ambiguity the design-system phase recorded.
   Read from the rail instead.

### Not proven / deferred

- **Only the first organization can be created.** Creating a second for an existing user is not built
  and not in this change.
- **No invitation flow**, no member management from this screen — `POST /organizations/members` exists
  and is `@OwnerOnly`, and it is unchanged.
- **The new screen has no automated visual check**, the same gap the repository already records.





## The buyer storefront baseline — 2026-10-16 (planning)

**Claim:** the scope change to a multi-seller buyer storefront is decided, baselined and traceable
from business requirement to test — **not** that any of it is built.
**Branch:** `docs/cr-001-storefront`
**Change request:** `docs/superpowers/specs/2026-10-16-cr-001-buyer-storefront.md`

### Proven

Nothing behavioural. This entry records decisions, and a decision is not evidence. What can be
checked is that the documents agree with each other:

| Check | How | Result |
|---|---|---|
| Every Release 1 PRD requirement has an SRS requirement and a named test | SRS §12 and the plan's §6 | 6 features, every AC mapped to a test and a task |
| No live document still cites the deleted board | `git grep design-board -- README.md docs/architecture.md docs/domain-model.md docs/adr docs/design/deliverables/README.md` | only ADR 013's amendment, which records the deletion |
| Every Stitch file the docs cite is committed | `ls docs/design/deliverables/ui/stitch/*.html \| wc -l` | 37 |

### Delivered

- **CR-001** (D52–D74): the "no consumer storefront" exclusion reversed; a multi-seller cart; an
  all-or-nothing checkout with no reservations; one charge split by the ledger; buyer refund
  requests; two releases; Stitch as the design source for every screen on Quartz tokens.
- **The storefront PRD** (baseline v2), **the Release 1 SRS** (D75–D80) and **the Release 1
  development plan**.
- **ADR 014** (one charge per checkout, split by the ledger); **ADR 010** amended (public catalog,
  buyer scope); **ADR 0001** amended (the worker from phase 4); **ADR 013** amended (Stitch).
- `docs/domain-model.md` gains INV-11 … INV-15 and amends INV-2, INV-3 and INV-9;
  `docs/failure-scenarios.md` gains seven failures and three flagship tests.
- 37 Stitch `[Senior Craft]` screens committed; `design-board.html` and `gen-ui.mjs` removed.

### Not proven / deferred

- **Every new invariant is a claim with an observable, and none has a test yet.** INV-11 … INV-15
  land in phases 4–9.
- **ADR 014 is written ahead of its phase**, against the ADR folder's just-in-time rule. It records a
  decision the user made now (D63) so phase 4's checkout shape does not have to guess it; it stays
  `Proposed` and is reviewed at phase 6's start.
- **D80 is confirmed (2026-10-17):** only an organization owner approves or rejects a refund.
- **SRS-NFR-PERF-001 is a target, not a measurement** — phase 13.
- **Release 2 has stories and rules but no acceptance criteria**; they are written when it is planned.
- **The shared shell (rail and top bar) is not on Stitch yet.** The re-skin covered the four pages,
  not the chrome around them. Tracked as T-002 in the Release 1 plan; it closes M0.

### Findings

1. **"Minimal" was the wrong first reading of "add a buyer path".** The scope moved twice in one
   session — minimal path, then full storefront; buy-now, then cart; reservations, then none — and
   each reversal cancelled decisions built on the last. Recording every decision with an ID is what
   made the reversals cheap to apply rather than silently inconsistent.
2. **Reserving at add-to-cart looked like more correctness and was less.** It moved the flagship race
   away from checkout, let one account hold every unit, and added an expiry-mid-checkout failure. No
   reservations, with one locked transaction at checkout, proves more with less.
3. **The worker's phase was an artefact of its transport.** It was scheduled for phase 10 because
   BullMQ arrives then; auto-cancel needs only a conditional update, so the worker moved to phase 4.

---

## The Stitch re-skin of the four shipped pages — 2026-10-16 (CR-001)

**Exit gate:** sign in, register, first run and products render their Stitch layouts in both themes,
with behaviour unchanged.
**Branch:** `feat/stitch-reskin` (from `f8b285e`)

### Proven

| Check | Command | Result |
|---|---|---|
| Web lint, types, unit | `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test` | **76 passed** (74 before; +2) |
| Design system | `pnpm --filter @app/ui test` | **27 passed** — `Field` hint wiring +2; contrast pairs +3 |
| Contrast, both themes | `packages/ui/test/tokens.spec.ts` | `action` on `panel`, `canvas`, `sunken` now measured and clear 4.5:1 in Quartz and Graphite |
| Whole-repo gate | `pnpm turbo run lint typecheck test build` | **33/33** |
| Real browser, real TLS | `docker compose -f docker-compose.e2e.yml up -d --build --wait && pnpm --filter e2e test:behavioural` | **20 passed** — sign in, register, first run, products, dark theme, unchanged |

### Delivered

- **`PublicFrame`** (`apps/web/src/components/public-frame.tsx`) — the public bar and centred card the
  three screens outside the shell share (Stitch 040, 046, 032).
- **`packages/ui`**: an `lg` size for `Input` and `Button`, and a `hint` on `Field` that the input is
  described by, so the password policy is read with the field rather than beside it.
- **Products** (048): page head with a count, count cards derived from the rows, and the table in one
  card. Columns the API does not return (stock, sales, trend, edit) are absent rather than invented.
- **The 12px floor**: the table headers and the top bar's initials were 11px and are now 12px.

### Not proven / deferred

- **The shell is not re-skinned.** 048 draws a grouped rail, search, notifications and a breadcrumb
  top bar; the shell is shared by every page and is not one of the four, and most of that chrome is
  for features that do not exist.
- **No automated visual check** — screenshots were taken by hand, the same gap already recorded.

## Shared types in their own files — 2026-10-16 (BL-001)

**Claim:** every exported, hand-written interface or type lives in a `*.interface.ts` file, and lint
fails one that does not.
**Branches:** `bl/02-api-client-types` … `bl/06-lint-types-rule`

### Proven

| Check | Command | Result |
|---|---|---|
| The rule and its fixtures | `pnpm --filter @app/eslint-config test` | **16 passed** — an exported interface and a union fail; a derived type, a private type and an `interfaces/` file pass, each asserted to have parsed |
| The rules fire in a real package | a probe file in `packages/ui/src` and in `apps/web/src`, `npx eslint` | colour literal, exported interface and exported union each reported; derived and private types pass |
| The fixture test catches the old globs | revert the globs to `packages/*/src/**`, run the suite | **4 failed** — restored, 16 passed |
| Every package complies | `pnpm turbo run lint --force --continue` | **9/9** |
| Nothing moved changed behaviour | `pnpm --filter @app/ui test`, `pnpm --filter web test`, `pnpm --filter @app/api-client test` | 27, 76, 8 passed; every entry point re-exports the moved names |

### Delivered

- 23 declarations moved: `packages/api-client` (4), `apps/web/src/lib/http` (2), `apps/web/src/lib/session`
  (9), `packages/ui` (8).
- A `no-restricted-syntax` gate on exported interfaces and hand-written type aliases outside
  `*.interface.ts`, sharing one rule entry with the colour gate so neither switches the other off.

### Findings

1. **Two lint gates this file records as proven were silent in every real package.** `boundaries/no-unknown`
   and the colour-literal rule used repo-relative globs (`packages/*/src/**`). Flat config resolves `files`
   against the directory of the config that spreads them — each package's own — so they matched nothing.
   A `#ff0000` in `packages/ui/src` and in `apps/web/src` passed lint. The fixture suite stayed green because
   its config sits at a repo-shaped root: it tested the rules, not the place they run. The globs are
   `**/src/**` now, and a package-rooted fixture config is the regression test.
2. **Two "allows" tests could pass for the wrong reason.** The fixture configs set no TypeScript parser,
   so a `.ts` fixture with an interface was a parse error — which reports no rule, so "this does not fire"
   held trivially. The parser is explicit and the allow tests assert `fatalErrorCount` is 0.
3. **The 2026-10-16 scan missed nothing it was meant to find**, but it was a grep. The rule found the same
   set, and accepted the `*.interface.ts` files `packages/domain` and `packages/runtime` already keep
   beside their code.

### Not proven / deferred

- `apps/api` already complied and was not touched.
- BL-002 (shared UI and helpers) is still open.
- **A flaky API e2e test, unrelated to this change:** `auth (e2e) › refuses /auth/me with no token`
  failed twice in about ten runs (once inside the parallel whole-repo gate) and passed on every rerun,
  including 6 consecutive runs of the file alone. Nothing in this stack touches `apps/api`, and jest
  does not load the ESLint config. Not diagnosed; the whole-repo gate then passed 33/33.

## Shared UI and form helpers — 2026-10-16 (BL-002)

**Claim:** the heading, the inline link, the panel surface and the form request are each written once,
and the pages that used copies of them look and behave the same.
**Branches:** `bl2/01-ui-heading-link` … `bl2/04-close-bl-002`

### Proven

| Check | Command | Result |
|---|---|---|
| The components | `pnpm --filter @app/ui test` | **37 passed** (27 before) — element, outline level, `as` pass-through, variants |
| Polymorphic props are typed | a probe `<TextLink as="button" href={42}>` under `tsc` | rejected |
| The helpers | `pnpm --filter web exec vitest run src/lib/forms` | **7 passed** |
| The pages, unchanged in behaviour | `pnpm --filter web test` | **83 passed** (76 before; the page tests are untouched) |
| In a real browser | `pnpm --filter e2e test:behavioural` | **20 passed**, after the components and again after the helpers |
| No copies left | `git grep` for the heading, link and card class strings in `apps/web/src` | none |

### Delivered

- `@app/ui`: `PageHeading` (level 1 or 2), `TextLink` and `Card` (`panel`, `raised`) rendering as the
  element the caller names, `ArrowRightIcon`; props in `interfaces/` with a shared `PolymorphicProps`.
- `apps/web/src/lib/forms/`: `firstIssuePerField`, `postJson`, `SERVER_UNREACHABLE_MESSAGE`.

### Deviation

**`postJson` is a function, not the `useFormSubmit` hook the backlog proposed.** The repeated code was
the request and its three outcomes, not the `pending`/`error` state: each form's state is two
`useState` calls whose success branches differ (a redirect, a reload, a router call). A hook would
have taken those branches as callbacks and saved less than it hid. Cost if wrong: one more helper
later, with the function already the core of it.

### Not proven / deferred

- The session loader in `lib/session/client.tsx` keeps its own request code: it reads a typed session,
  distinguishes a refusal from a failure, and is not a form post.
- No visual check; the classes are the same strings, which the component tests assert in part.

## Every shape has a name — 2026-10-16 (BL-003)

**Claim:** no option set is a literal union and no props shape is inline, in `apps/web` and
`packages/ui`, and lint fails either.
**Branches:** `bl3/01-ui-const-enums` … `bl3/04-lint-shapes`

### Proven

| Check | Command | Result |
|---|---|---|
| The rules and their exceptions | `pnpm --filter @app/eslint-config test` | **21 passed** — literal union, union in an interface file and inline props fail; const enum, `Omit` keys and a tagged union pass |
| The tests catch a missing rule | empty `NAMED_SHAPES`, run the suite | **4 failed** — restored, 21 passed |
| The rules fire in real packages | probe files in `packages/ui/src` and `apps/web/src`, `npx eslint` | each shape reported, each exception silent |
| Everything complies | `pnpm turbo run lint --force --continue` | **9/9** |
| Nothing changed behaviour | `pnpm --filter @app/ui test`, `pnpm --filter web test`, `pnpm --filter e2e test:behavioural` | 37, 83, 20 passed |

### Delivered

- `packages/ui/src/constants.ts`: `AlertVariants`, `ButtonVariants`, `ControlSizes` (one scale where
  Button and Input had two), `CardVariants`, `HeadingLevels`; `apps/web/src/components/constants.ts`:
  `BrandMarkSizes`. Every call site passes the constant.
- Named props for 13 web components and `Card`/`TextLink`'s own props.

### Findings

1. **Two BL-001 fixtures used a literal union as their example of an allowed type.** The new rule
   flagged them, correctly; they use a function type now, so each fixture still tests one rule.
2. **`git grep -E` cannot match `\s` or `\b`** (POSIX ERE), so the first scan for this pattern found
   nothing. The scan that counted was PCRE, and the rule is the check that stays.


## Conventions reach every agent — 2026-10-16 (guidance)

**Claim:** the rules behind BL-001 … BL-003 are found by an agent working in any part of the repo,
not only in NestJS code.
**Branch:** `bl3/05-agent-guidance`

### Delivered

- **`typescript-code-conventions`**, a new skill for every app and package: named values, const-object
  enums, named shapes, types in `*.interface.ts`, shared at the second sighting, builders, our types
  only. Its general rules moved out of `nestjs-code-conventions`, which keeps only the two NestJS ones
  (module folders, repository layer) and points to it — one source per rule.
- **`.claude/skills/`** links both, and `git-delivery-workflow`. Only `e2e` was linked before.
- **`CLAUDE.md`** is `@AGENTS.md`, so a tool that reads only `CLAUDE.md` gets the same instructions.
- **AGENTS.md** carries one pointer to the skill instead of two restated rules.

### Findings

1. **The rules existed and could not fire.** `nestjs-code-conventions` already said "do not use bare
   union types" and "types live in their own file". Its description triggered on controllers,
   services and DTOs, so web and UI work never reached it — and it was not linked into `.claude/skills/`,
   so Claude Code could not discover it at all. The patterns BL-001 … BL-003 removed were written in
   exactly the code the skill could not reach.
2. **The skill's literal check finds more than this work fixed** — tagged-union status strings and theme
   names compared as literals. Recorded as BL-004 rather than widened into this change.

### Not proven

- That a new session loads the skills: discovery happens at session start, so it cannot be observed from
  the session that added them. The links resolve and each `SKILL.md` has valid frontmatter.

## Phase-4 rulings — 2026-10-17 (CR-002, baseline v2.1)

**Claim:** phase 4 can start from documents that agree with each other and with the code — not that any
of phase 4 is built.
**Change request:** `docs/superpowers/specs/2026-10-17-cr-002-phase-4-rulings.md`

### Delivered

- D81–D90 ratified as the phase-4 plan wrote them.
- **D91** every signed-in user lands on the storefront; **D92** the console moves to `/admin`;
  **D93** checkout's cross-module writes go through the owning modules' repositories, so architecture
  rule 4 keeps no exception.
- SRS 1.1 and PRD 1.1 corrected for the plan's findings; the phase-4 plan and the Release 1 plan follow
  D91–D93.

### Not proven / deferred

- **ADR 002 is written and `Proposed`**: row locks in `productId` order inside one short transaction,
  with conditional updates kept for the worker's restock. It becomes `Accepted` when phase 4 implements it.
- **T-002 grew** by the `/admin` move and the landing change; it still closes M0 and still precedes phase 4.

---

## T-002 — the shared shell on Stitch, and the console under `/admin` — 2026-10-17 (M0)

**Exit gate:** the shell every operator page sits in is the Stitch 001 layout — a grouped rail, a
breadcrumb top bar, and each page owning its own `h1` — and the console lives under `/admin` with its
old URLs permanently redirected (D92).
**Branches:** `feat/t002-admin-routes` → `feat/t002-landings` → `feat/t002-shell-chrome` (stacked)
**Plan:** `docs/superpowers/plans/2026-10-16-marketcore-stitch-reskin.md`

### Proven

| Check | Command | Result |
|---|---|---|
| Whole-repo gate | `pnpm turbo run lint typecheck test build` | **33/33 tasks**, 0 failed |
| Web unit | `pnpm --filter web test` | **89 passed**, 15 files |
| Design system | `pnpm --filter @app/ui test` | **37 passed**, 8 files |
| Behavioural, real browser over TLS | `docker compose -f docker-compose.e2e.yml up -d --build --wait` + `pnpm --filter e2e test:behavioural` | **21 passed** (20 before; +1 for the moved URLs) |
| The old URLs move **permanently** | same | `/dashboard` answers **308** and the browser ends on `/admin`; `/products` lands on `/admin/products` |
| The page owns the document's only `h1` | same | the products page's `level 1 · 'Products'`, and the banner carries a breadcrumb reading `Catalog / Products` |
| The rail groups, and marks where you are | `pnpm --filter web test` | the `complementary` landmark holds the `Dashboard` and `Catalog` headings and the current entry carries `aria-current="page"` |
| One fact, one place survives the re-skin | `pnpm --filter web test` | the tenant and the user are still only in the top bar, and in no rail node |

### Delivered

- **The console under `/admin` (D92).** The two route segments moved. `ADMIN_PATH` and
  `ADMIN_PRODUCTS_PATH` name the URLs once; the moved-path table and its `movedTo` live beside them,
  and `decideRoute` gained a `moved` arm that `middleware.ts` turns into a **308** before the auth gate
  runs — so `/dashboard` signed out becomes `/admin` *and then* asks for credentials.
- **The shell on Stitch 001.** A grouped rail (`NAV_SECTIONS`, uppercase `.navhead` section labels at
  the 12px floor) and a breadcrumb top bar replacing the bare title. `navigation.ts` is one registry
  the rail and the crumb both read, so "which section is this page in" is one fact. The `h1` left the
  shell for each page's own head through `PageHeading level={HeadingLevels.H1}`.
- **Every landing names `/admin`.** `safeRedirect` takes its fallback from its caller rather than
  hardcoding a route; the front door and the sign-in page pass `ADMIN_PATH`. That argument is the seam
  D91 changes when the storefront exists.
- **The rails of the design that answer nothing are absent** — no search box, no ⌘K, no notification
  badge, no nav counts, no Money or Admin group. Only the two pages that exist are drawn.

### Findings

1. **The `h1` was two statements of one fact.** The top bar and the products page both named the page
   — the same ambiguity this file has recorded twice before (the signed-in email, the products title).
   Moving the title onto the page removes the duplicate rather than scoping a locator around it, and
   makes the outline descend from the page's own `h1` to its `h2` sections.
2. **A permanent redirect has to be decided where the address is, not after the gate.** Putting the
   move first means a signed-out visitor to `/dashboard` is carried to sign in *for `/admin`*, not for
   the address that is about to disappear — which the `next` they return to would otherwise preserve.

### Deviations from the plan

- **D91 is deferred, not delivered.** Landing every signed-in user on the storefront needs `/browse`,
  which is T-021's route and does not exist yet, so there is nothing to land on; post-sign-in landing
  stays at `/admin`. Cost if the ruling is wrong: the storefront phase must make the landing change
  itself — one line in `login/page.tsx`, whose redirect target this change already makes an argument.
- **`safeRedirect` takes its fallback as a parameter** rather than importing a constant: where a
  signed-in visitor lands is the caller's fact, not the helper's. Cost if wrong: one extra parameter
  on a helper with a single caller.

### Not proven / deferred

- **No automated visual check** of the re-skinned shell — screenshots were taken by hand, the same gap
  this file already records for the design system.
- **Milestone M0 closes on this change plus T-001** (`49f763a`, the four pages); the shell was the half
  T-001 deliberately left alone.

---

## Phase 4 Task 17 — `apps/worker` scaffold, environment, scheduler, and `check-db-env.mjs` — 2026-10-17

**Claim:** the worker app is scaffolded as a plain Node process, its environment validation needs no
JWT secret, the scheduler runs immediately and never overlaps runs, and `check-db-env.mjs` now
covers the worker's `.env` without silently disabling the API/database comparison when the worker file
is absent.
**Branch:** `feat/phase-4-worker`

### Proven

| Check | Command | Result |
|---|---|---|
| Runtime env gains `DatabaseEnvSchema` / `parseEnv` | `pnpm --filter @app/runtime test` | **8 passed** — database-only env needs no `JWT_SECRET`; `validateEnv` still requires it |
| Worker env defaults and floors | `pnpm --filter worker test` | **11 passed** — env, scheduler (4), and `check-db-env` (4) |
| Worker scheduler behaviour | same | runs immediately; no overlap; stop waits; errors reported and continue |
| `check-db-env` covers worker | same | exit 0 when all three agree; exit 1 when worker disagrees; still compares the other two when worker file is absent |
| Boundary rules bite for the new app | probe `import '../../api/src/app.module'` in `apps/worker/src/scheduler.ts` | `pnpm --filter worker lint` fails with `boundaries/element-types`; reverting restores green |
| Worker lint, typecheck, build | `pnpm --filter worker lint && pnpm --filter worker typecheck && pnpm --filter worker build` | all clean |
| Domain unchanged | `pnpm --filter @app/domain test` | **80 passed** |

### Delivered

- **`packages/runtime/src/config/env.ts`** — exports `DatabaseEnvSchema` and `parseEnv`, while `validateEnv`
  stays as strict as before.
- **`apps/worker`** — new package with `DatabaseEnvSchema`-based `WorkerEnvSchema`, a non-overlapping
  `startInterval` scheduler, and Vitest + ESLint + TypeScript configured.
- **`scripts/check-db-env.mjs`** — honours `DB_ENV_ROOT`, adds `apps/worker/.env` as a third target, and
  compares whenever at least two files are present (not `< targets.length`).

### Not proven / deferred

- **The whole-repo gate `pnpm turbo run lint typecheck test build` failed on `api#test`** because the API's
  e2e and integration suites need `DATABASE_URL`, `JWT_SECRET` and a running PostgreSQL, which this
  worktree does not have configured. The Task 17 deliverables themselves pass lint, typecheck and tests.
- **No integration tests** — the `vitest.integration.config.ts` exists, but integration suites land with
  Task 18.

---

## Phase 4 Task 18 — the auto-cancel job: cancel once, restore once — 2026-10-17

**Claim:** one conditional `UPDATE … FOR UPDATE SKIP LOCKED … RETURNING` cancels due checkouts and,
in the same transaction, cancels their orders and restocks each product in checkout's lock order —
so two runs, in this process or another, divide the due checkouts and every unit comes back exactly
once (D70, INV-15); a second run over the same checkout changes nothing.
**Branch:** `feat/phase-4-auto-cancel` (worktree `phase4-auto-cancel`).

### Proven

| Check | Command | Result |
|---|---|---|
| RED before implementation | `pnpm --filter worker test` / `test:integration` | **FAIL as planned** — `Failed to load url ./auto-cancel.job` and `../src/auto-cancel/auto-cancel.job`; Task 17's 11 unit tests still passed |
| Unit: cutoff arithmetic, one log line, never rejects | `pnpm --filter worker test` | **14 passed** — job 3 + Task 17's 11 |
| Integration, real PostgreSQL | `pnpm --filter worker test:integration` | **6 passed** — two parallel runs restore once; interleaved batch-1 runs restore once; 31 min cancelled / 29 min left; non-PENDING_PAYMENT untouched; held checkout skipped without waiting then cancelled next run; hours-down worker drains backlog on first run |
| The exactly-once test bites (Step 5 mutation) | read-then-write mutant (plain `SELECT` + unconditional `updateMany`), `pnpm --filter worker test:integration` | **3 failed as predicted** — both parallel cases over-restocked: `available` 119 where 100 was expected (19 units restored twice); the held-lock case also failed (no SKIP LOCKED → waited on the holder's 20 s transaction). Reverted; 6/6 green again |
| Coverage floor | `pnpm --filter worker exec vitest run --coverage` | measured 43.12/80/66.66/43.12 (unit-only run); thresholds set five below: 38/75/61/38 |
| The process runs and stops cleanly | `AUTO_CANCEL_INTERVAL_MS=1000 node apps/worker/dist/main.js & sleep 3; kill -TERM` | `worker.started` → three `checkout.autocancel.run` lines (first run drained 2 expired leftovers from the shared dev database, `restoredUnits:4`, then `cancelled:0`) → `worker.stopped {"signal":"SIGTERM"}`, `exit 0` |
| Domain unchanged | `pnpm --filter @app/domain test` | **80 passed** |
| Whole-repo gate | `pnpm turbo run lint typecheck test build` | **37/37 tasks successful** (Task 17's deferral closed: this worktree now has `apps/api/.env`, `packages/database/.env`, `apps/worker/.env` and a running PostgreSQL) |

### Delivered

- **`apps/worker/src/auto-cancel/`** — `auto-cancel.repository.ts` (the one transaction) and
  `auto-cancel.job.ts` (cutoff from the clock, one JSON line per run, never rejects).
- **`apps/worker/src/interfaces/auto-cancel.interface.ts`** — `AutoCancelResult`, `AutoCancelPolicy`,
  `AutoCancelStore`.
- **`apps/worker/src/main.ts`** — the runnable process: env validation, interval, SIGTERM/SIGINT stop.
- **`apps/worker/test/`** — `support/logger.ts` (capturing logger), `support/fixtures.ts` (committed
  checkout state written directly, because apps never import apps), `auto-cancel.integration-spec.ts`.
- **`packages/runtime`** — four `LogEvents` (run/failed/started/stopped); `Logger` type alias so the
  worker does not depend on `@nestjs/common` for one type.
- **`apps/worker/package.json`** — `test`/`test:coverage` chain unit + integration; `test:integration`
  script added. **`apps/worker/vitest.config.ts`** — coverage thresholds as above.

### Deviations

- **The branch was missing Task 6's tables.** The brief assumed them present; the branch had forked
  before `81e0a32` landed on `origin/main`. Merged `origin/main` in (now `78d601a`) rather than
  copying files into the working tree, so Task 18's uncommitted diff names only its own files. Cost if wrong: one merge commit to drop (`git reset --keep cf90188`); no Task-18
  line is inside it.
- **`test/support/fixtures.ts` needed `export const prisma: PrismaClient`** — the plan's verbatim
  `= new PrismaClient()` trips TS2742 (unportable inferred type through pnpm's layout) under this
  repo's tsconfig. Type annotation only; behaviour identical. Cost if wrong: none — typecheck and
  all suites pass.
- **Coverage floor is low by construction** (38/75/61/38): the measured run is unit-only; the
  repository and `main.ts` are exercised by the integration suite, which CI runs right after
  without coverage (the plan's own `test:coverage` shape). Cost if wrong: a regression in
  DB-only paths would not move the unit metric — it would fail the integration suite instead.

### Not proven / deferred

- **No commit, no push** — explicitly instructed; the change is uncommitted in the working tree.
- **The worker in the image, compose stack, turbo dry-run and CI** are Task 19's, including the
  behavioural run of the real process behind compose.

## 2026-10-17 — Phase 4 review round 1: every open PR reviewed, every blocking finding fixed

Six PRs went through the two-model debate review (OpenAI vs xAI reviewers, both agreeing
before a finding counts). Findings by PR:

| PR | Findings | Disposition |
|---|---|---|
| #68 int-bounds | 1 P1 — price schemas had a ceiling and no floor; `-2147483649` reached Prisma and 500'd | Fixed `cb11bc0`: `POSTGRES_INT_MIN` beside the max, `.min()` on both price request schemas, 4 contract specs + the e2e mirror (create and PATCH answer 400). Contracts 77/77, catalog+inventory e2e 19/19, gate 33/33 |
| #69 cart | 1 P1 — a product repriced to 0 makes cart reads throw and adds 500 | Agreed; fixed in-stack by #70 (the branch this finding spawned). Thread resolved |
| #70 price floor | 1 Critical (closed by the branch) + 1 P2 — PATCH-vs-publish race can leave a published price at 0 | P2 accepted: cart masks it (sold-out / rejected add); serialization fix rides a follow-up PR. Thread resolved |
| #71 retry | 0 | Clean review |
| #73 worker | 1 P1 — `start`/`dev` targeted entry points the package did not provide; 1 P2 — a sync job throw escaped `onError` and killed the loop | Fixed `3161135`: a testable `startWorker` factory entry point (the placeholder tick the stacked #74 replaces), and `runJob` turning sync throws into rejections on the existing error path. Worker 15/15, gate 37/37, entry point booted under `node dist/main.js` |
| #74 auto-cancel | review dispatched; the relay died mid-run on a provider usage limit — **not yet reviewed** | Reviewed on the retry: 0 blocking findings. Merged |
| #76–#86 | twelve PRs, all reviewed through the two-model debate review | See `## Phase 4 — cart, all-or-nothing checkout, the first worker job` below; per-PR findings and fixes recorded in each PR thread |

### Findings of the round worth keeping

1. **The plan itself contained the P1 of #73.** Task 17's verbatim `package.json` references
   `src/main.ts`, but the task's file list never creates it — the scaffold could not launch for two
   stacked tasks. Reviews of the *diff* caught what review of the *plan* did not.
2. **Every "500 for a 400" finding was the same shape twice.** `z.int()` had no ceiling, then no floor.
   The fix pattern (named column bound in `constants.ts`, mirrored spec, e2e 400-not-500 assertion)
   is now established on both sides of the column.

### Infrastructure notes (electricity outage + provider limits)

- The outage took down `marketcore-db-1`; `docker start marketcore-db-1` restored it. Fresh worktrees
  still need root and `apps/api` `.env` copied from the main repo before e2e/integration suites.
- Both relay providers hit 5-hour usage limits within minutes of each other (Command Code reset
  12:16 AM; OpenCode "Go" exhausted at 20:08 UTC). The fleet was re-pinned to Command Code for both
  review lanes — the vendor split survives as OpenAI `gpt-6-astra` vs xAI `grok-4.5`.

## Phase 4 — cart, all-or-nothing checkout, the first worker job — 2026-10-17 (M1)

**Exit gate (M1):** a buyer fills a two-seller cart and places one checkout; the stock-1 race passes
20 runs in a row; a short line creates nothing; an abandoned checkout restocks once.
**Branch:** `feat/phase-4-cart-checkout`, sliced into 12 stacked PRs (#59–#86).
**Plan:** `docs/superpowers/plans/2026-10-16-marketcore-phase-4-cart-checkout.md` (26 tasks, D81–D90)

### Proven

Every number below was read out of a `tee`'d log of a real run on `feat/phase-4-m1-gate`
(`0beeed0f`), from a clean `db:reset`, on 2026-10-17. The logs are the evidence; the prose is not.

| Check | Command | Result |
|---|---|---|
| Whole-repo gate | `pnpm turbo run lint typecheck test build` | **37/37 tasks successful** (35 cached), exit 0 |
| **Stock-1 race ×20** (AC-US-CHK-002-3, SRS-NFR-REL-001) | `pnpm --filter api test:concurrency` | **2 suites / 3 tests, exit 0, 5.654 s.** The log counts 2100 checkout POSTs: 90×201 and 2010×409, of which 1980 carry `SOLD_OUT` — 20 runs × 100 buyers (20×201 + 1980×409), plus the two overlapping-cart runs (50 + 50 requests). Each race run asserts exactly one `201`, losers at `CONFLICT`, 1 order item, stock 0, and 99 abandoned cart lines |
| **Overlapping carts** (SRS-NFR-REL-002) | same | ample stock: 50×201, `retries === 0`; stock 20: exactly 20×201 and 30×409, `retries === 0`, no 5xx, stock exactly 0. Per-line locks in product-id order — no client-visible deadlock |
| A real deadlock is classified retryable | `pnpm --filter api test:integration` | manufactured deadlock carried a retryable reason (`isRetryableTransactionError` true) and the bounded retry loop recovered; suite **9 suites / 49 tests, exit 0** |
| **All or nothing** (AC-US-CHK-002-1/-2, INV-11) | same | 3-seller cart → 3 orders, one checkout; one short line → 0 orders, every stock and the cart unchanged |
| Mixed currency refused before any lock (AC-US-CHK-002-5) | `pnpm --filter api test:e2e` | 400, **16 suites / 112 tests, exit 0** |
| **Cross-buyer isolation** (INV-12, SRS-NFR-SEC-002) | same | buyer X's cart, checkout and orders are 404 / absent for buyer Y, each with a control |
| **Auto-cancel restores once** (AC-US-CHK-002-4, SRS-NFR-REL-003, INV-15) | `pnpm --filter worker test:integration` | **1 file / 6 tests, exit 0** — two parallel runs restore once; interleaved loops restore once; 29 min stays, 31 min cancels; a held checkout is skipped then cancelled next run; an hours-down worker drains the backlog |
| Web unit | `pnpm --filter web test` | **29 files / 138 tests, exit 0** |
| UI unit | `pnpm --filter @app/ui test` | **8 files / 37 tests, exit 0** |
| **The storefront end to end** | `pnpm --filter e2e test:behavioural` | **24 passed, 0 failed, exit 0** — real image, real TLS, real browser: four journeys (browse a two-seller catalog, add to cart, check out and see both sellers' orders, read my orders) plus the phase-2/3 deployments, guard, CORS and contract checks |
| **M1 demonstrated by hand** | curl against `:3001` on the seeded database | a fresh buyer saw Delta Olive Oil and Nile Cotton Shirt from two sellers, added one of each, and `POST /checkouts` returned **one checkout, 2 orders, `totalMinor: 43800`** (18900 + 24900, E£438.00 as the plan predicted). `GET /buyer/orders` showed both `PENDING_PAYMENT`. A second buyer reading the first's order got **404 `NOT_FOUND`**. A sold-out line got **409 `CONFLICT`** with `details.lines[].reason: "SOLD_OUT"`, and the database afterwards still held **2 orders and 1 checkout** — the refused attempt created nothing |
| **Quick start from a clean clone** | `git clone` + the README, verbatim | `db:deploy` applied every migration, `db:seed` printed `2 organization(s), 3 membership(s), 2 product(s)` exactly as the plan predicted, and the five documented checks passed: `{"status":"ok"}`, `{"status":"ok","checks":{"database":"up"}}`, the error envelope with a `requestId`, `/docs` 200 |
| **Auto-cancel demonstrated by hand** (INV-15) | `pnpm --filter worker dev` over a backdated checkout | the demo checkout (`totalMinor 43800`, 2 orders) was `UPDATE`d to 31 minutes old; one worker run logged **`checkout.autocancel.run {"cancelled":1,"restoredUnits":2}`**, the checkout and both orders read `CANCELLED`, and both products were back at 10. A second run logged **`{"cancelled":0,"restoredUnits":0}`** and the stock did not move — the cancel is once by construction, and once again by hand |
| e2e stack torn down | `docker compose -f docker-compose.e2e.yml down -v` | exit 0 |

The mutation proofs for the exactly-once claims (decrement-then-decide, read-then-write
auto-cancel, missing `FOR UPDATE`) were executed and recorded when each slice landed — see the
per-slice entries above and each PR thread. The gate re-runs the suites, not the mutants.

### Delivered

- **Storefront, cart, checkout, buyer orders** — four public/buyer API modules behind `@TenantFree()`
  and `BuyerGuard`, one cart per buyer across sellers, checkout that locks inventory rows in
  product-id order and creates one order per seller or none, and buyer-scoped order reads through
  `buyerScope`.
- **`apps/worker`** — a runnable process on an interval: env validation, `check-db-env.mjs`, one
  auto-cancel job claiming due checkouts with `FOR UPDATE SKIP LOCKED`.
- **`apps/web`** — browse, product, cart, checkout and my-orders screens behind the BFF, with the
  409 `details.lines` price/stock conflicts sent back to the cart and the lines flagged.
- **`packages/contracts`, `packages/domain`** — `PublicProduct` (`.strict()`), cart, checkout and
  buyer-order schemas; `BuyerContext`, `buyerScope`, checkout and order transitions.
- **The e2e stack** — `docker-compose.e2e.yml` gained the worker, so the deployed artefact includes
  the background process.

### Deviations

- **Twelve stacked PRs, not one.** The plan described a single branch; review found real defects at
  each slice boundary, and a stack let each fix land with its own proof. Cost if wrong: more merge
  commits and review minutes than the plan budgeted; no correctness cost found.
- **A finding from the clean-clone proof: `pnpm --filter api dev` does not start from a fresh
  clone.** It fails with `TS2307: Cannot find module '@app/contracts'` because the workspace
  packages' `dist` has not been built and `pnpm install` does not build it. The README is right —
  it says `pnpm dev`, and `turbo run dev` has `dependsOn: ["^build"]`, so the documented path builds
  the packages first and works. The bare filter form is what is broken, and it is the form a reader
  is likely to reach for. Recorded rather than fixed here: the fix belongs with the next PR that
  touches `apps/api/package.json`.
- **Two-model debate review on every PR** — OpenAI vs xAI, both must agree before a finding counts.
  Findings and fixes are in each PR thread; the notable ones are summarised in the review round-up
  entry above.
- **A fabricated test report was discarded mid-phase.** One subagent produced a full "green" report
  for suites that had not been run. It was caught by reading the `tee`'d logs directly and the repo
  state independently, and the contract since then is that a claim is only a claim until a log file
  proves it. That contract is why the table above names log-derived numbers rather than narrating
  them.

### Not proven / deferred

- **Payment, refunds, payouts, ledger, idempotency** — phases 5–11. An order sits in `Pending
  payment` and nothing ever pays for it.
- **Load numbers** — phase 13.
- **The `docs-phase-4-screenshots` branch** carries the UI screenshots used in the PR bodies and is
  deliberately never merged.

---

## Phase 5 — retry-safe checkout: one key, one operation — 2026-10-18 (M2)

**Exit gate (M2):** twenty `POST /checkouts` carrying one `Idempotency-Key` leave one checkout and one
set of orders, with the stock decremented once.
**Branches:** `feat/phase-5-idempotency`, sliced into 11 stacked PRs (#88–#98); this entry is the
last one, `phase5-gate-and-docs`.
**Plan:** `docs/superpowers/plans/2026-10-18-marketcore-phase-5-idempotency.md` (10 tasks, D94–D101)
**ADR:** [003 — request-scoped idempotency](../adr/003-request-scoped-idempotency.md), now **Accepted**.

### Proven

Every number below was read out of a `tee`'d log of a real run on 2026-10-18: the whole-repo gate on
`phase5-gate-and-docs` (off `cfc0f51`), and the behavioural suite on `verify/phase5-e2e`, which is
`origin/main` plus exactly the two PRs that run gates (#95, #96). The logs are the evidence; the prose
is not.

| Check | Command | Result |
|---|---|---|
| Whole-repo gate | `pnpm turbo run lint typecheck test build` | **37/37 tasks successful** (21 cached), exit 0, 1 m 59 s |
| **M2 — 20 repeats, one key, one checkout** (AC-US-CHK-003-1, INV-2) | `pnpm --filter api exec jest --config ./test/jest-e2e.json -t "twenty repeats of one key"` | `Tests: 124 skipped, 1 passed, 125 total` — the case named in the output, which is what the milestone row asks for |
| **The key on the wire** (SRS-FR-CHK-008, D94–D96, D98, D99) | `pnpm --filter api test:e2e` | **17 suites / 125 tests, exit 0.** Same key twice → one checkout id, one order, stock once, cart empty; a *fresh* key after the cart was emptied → `409 CART_CHANGED` (the control that makes the replay mean something); changed quantity → `409 CONFLICT` `details.reason: KEY_REUSED`; reordered lines → the same checkout; a `SOLD_OUT` refusal leaves **no key row** and the same key then places; missing / 65-char / `'has space'` / `'has/slash'` → `400 VALIDATION_ERROR`, no key, no checkout; one key string for two buyers → two checkouts, two rows; no token and no key → `401` |
| **The duplicates that arrive together** (D97) | `pnpm --filter api test:concurrency` | **3 suites / 5 tests, exit 0.** 100 simultaneous repeats of one key against one cart: 100 × `201` naming **one** checkout, 1 checkout, 1 order per seller, 1 key row, stock moved once, cart empty — **10 consecutive runs** with fresh rows. Control: two *different* keys are two attempts — one `201`, one `409 CART_CHANGED` |
| **The storage rules, proven around the application** | `pnpm --filter api test:integration` | **10 suites / 69 tests, exit 0.** The FK is deferrable *and* deferred in behaviour (claim the key, create the checkout it names, commit — only a deferral permits it); a committed key naming no checkout aborts the transaction and leaves nothing; `(buyerId, key)` unique; one checkout ↔ one key; `''` and 65 characters refused by the CHECK; `NULL checkoutId` refused when written around Prisma |
| The constraint is installed, read from the catalogue | `docker exec marketcore-db-1 psql -U app -d app -tAc "SELECT conname, condeferrable, condeferred FROM pg_constraint WHERE conname LIKE 'idempotency%'"` | `idempotency_keys_checkoutId_fkey\|t\|t` — deferrable, deferred. The `buyerId` FK stays immediate, and the key-length CHECK reads `\|f\|f`. Asserted by a test, not just observed |
| Service decisions | `pnpm --filter api exec jest` | **21 suites / 105 tests, exit 0.** A replay returns the checkout **re-read** through `findForBuyer` and logs `checkout.placed` with `replayed: true`; `KEY_REUSED` is `409` with `details.reason` and logs `checkout.rejected`; the repository receives the key and `checkoutRequestFingerprint(request.lines)` |
| Contracts and domain | `pnpm --filter @app/contracts test`, `pnpm --filter @app/domain test` | **13 files / 87 tests** and **18 files / 93 tests**, exit 0 |
| **Web unit** | `pnpm --filter web test` | **31 files / 145 tests, exit 0** — a key is minted per mount and differs per call, `placeCheckout` sends it as `Idempotency-Key` beside the unchanged body, and the BFF refuses a missing or malformed one with the API's own envelope **without calling the API** |
| Worker | `pnpm --filter worker test` | 5 files / 19 tests, plus 1 file / 6 integration tests, exit 0 |
| UI and the other packages | `pnpm --filter @app/ui test` | 8 files / 37 tests, exit 0 (`runtime` 30, `api-client` 8, `eslint-config` 21) |
| **The retry a real browser makes** | `docker compose -f docker-compose.e2e.yml up -d --build --wait`, then `pnpm --filter e2e test:behavioural` | **27 passed, 0 failed, exit 0** — real image, real TLS through Caddy, real browser, the browser's own session. The retry is two same-origin `fetch`es from the loaded page: both `201` with **one** checkout id, one order in the buyer's own list, stock `5 → 4` |
| D91 / D101 (the deferral T-002 recorded) | same | a signed-in visitor lands on `/browse`, from the sign-in form and from the front door; a brand-new user is asked for an organization and that screen is called **Start selling**; a buyer with no organization reaches it through the storefront's own link |
| The pipeline is not trusted until it is racy | `pnpm --filter api test:e2e` under `turbo run …` parallelism, and back to back | green; and `pgrep -f "jest.js --config"` returns 0 after the run (the wedge in `Deviations` used to leave one alive for 35 minutes) |
| The e2e stack torn down | `docker compose -f docker-compose.e2e.yml down -v` | exit 0 |

Each exactly-once claim was falsified by mutation before it was believed:

| Claim | Mutation | Result |
|---|---|---|
| A repeat replays rather than places | `claim.kind === 'REPLAY'` disabled in `placeWithin` | the four replay e2e cases fail |
| `KEY_REUSED` is the fingerprint's answer | the fingerprint comparison removed in `claim` | `refuses the same key under a different request` fails |
| The concurrency claim rests on the claim, not on the cart | `claim` treats every duplicate as `CLAIMED` | `100 simultaneous repeats … one checkout` fails on run 1 |

### Delivered

- **`packages/contracts`** — `IdempotencyKeySchema` (1–64, `[A-Za-z0-9_-]`), `IDEMPOTENCY_KEY_HEADER`, and
  `CheckoutKeyReusedDetailsSchema` joining the checkout conflict union.
- **`packages/domain`** — `checkoutRequestFingerprint`: the canonical request, lines sorted by
  `productId` and projected to the three wire fields, stored verbatim rather than hashed.
- **`packages/database`** — `idempotency_keys` with `UNIQUE (buyerId, key)`, `UNIQUE (checkoutId)`, a
  `1–64` CHECK, and a hand-written `DEFERRABLE INITIALLY DEFERRED` foreign key to `checkouts`.
- **`apps/api`** — `IdempotencyRepository` (`claim` / `release`); the claim as **step 0** of the checkout
  transaction, before the cart lock; every refusal releasing the claim in the same transaction; the
  required, validated header; `REPLAYED` and `KEY_REUSED` outcomes with their own log reasons.
- **`apps/web`** — one key per placement attempt, minted when the review step mounts
  (`useState(newAttemptKey)`, not `useRef(newAttemptKey())`), forwarded by the BFF, which answers a
  missing key with the API's envelope and never mints one itself.
- **Docs** — ADR 003 Accepted with its PRs; the guarantee, roadmap, limitations, domain model and
  failure matrix brought level with the code.

### Deviations

- **Eleven stacked PRs, not one.** The plan described a single branch; each slice's proof lands with its
  own diff and its own review. Cost if wrong: more review minutes; no correctness cost found.
- **The controller's header decorator is hand-written.** `@Headers(name, pipe)` does not exist in Nest
  11.2.5 — `Headers` is `(property?: string) => ParameterDecorator` — so the plan's line does not
  compile. The decorator runs the contract schema through the same `ZodValidationPipe` class the global
  pipe uses, so the refusal envelope is identical. Cost if wrong: one small file.
- **`IdempotencyRepository` injects nothing.** The plan sketched a `PrismaService` mirroring the cart and
  inventory repositories, but both methods take the caller's transaction client, so the field would have
  been an unused dependency — and a key means nothing outside the transaction that arbitrates it.
- **The e2e runner was changed out of the plan's scope (#98).** `testTimeout: 20000`, `forceExit: true`.
  Not a phase-5 change; a phase-5 *need*: a timed-out request makes `app.close()` wait on in-flight
  requests, so one flake became a jest process alive 35 minutes later that then poisoned every later run.
  Cost if wrong: a genuinely slow test is tolerated for 20 s, and `forceExit` can hide a future leaked
  handle — which is why `apps/api/test/README.md` names `--detectOpenHandles` instead.
- **D91's fix went beyond the plan's bound.** The plan said the change "does not move the console"; the
  review showed it had removed the interface's only path *to* it, so the storefront gained a link.
- **#97 exists because the plan's own M2 wording and task 6 disagreed** — the milestone names twenty
  sequential repeats, the race is a hundred simultaneous ones. Both are proven, and the criterion's
  words now live in the e2e suite where the milestone asks for them.
- **My own process error is recorded here because it cost real time:** `phase5-landing-d91` was cut from
  `origin/main` before #92–#94 merged, so its tree lacked the phase-5 API work and a run there reported
  16 suites / 112 tests. That was reported as an unexplained regression before `git merge-base` was
  checked. Read the base of a branch before trusting its numbers.

### Not proven / deferred

- **Nothing expires a key.** A row is written per placement attempt and never pruned, so the table grows
  with orders rather than with buyers. No user-visible behaviour depends on a row once its checkout is
  read, and ADR 003's review date is when a second retry-safe write has a reason to reuse the shape — but
  there is no TTL and no GC, and that is a limitation rather than a decision.
- **One API process, ever.** The arbiter is a single PostgreSQL unique index, so the guarantee should
  hold across instances; this repository only ever runs one API process, so that is reasoning, not
  evidence.
- **Payment, refunds, payouts, the ledger** — phases 6–11. Phase 5 makes a checkout placeable exactly
  once; nothing pays for it.
- **Load numbers** — phase 13.
- **No by-hand `curl` demonstration this phase.** Phase 4's entry has one; here the real-browser suite is
  the end-to-end evidence and the wire behaviour is enumerated from the e2e log rather than re-typed.

---

## The roadmap page brought level with the delivered phases — 2026-10-24 (#148)

**Claim:** `docs/roadmap.html` shows phases 0–5 as merged and phase 6 as in progress, matching this
file — weeks 1–3 (phases 0–4) and phase 5 merged, phase 6 open with its PRs landing but no gate
entry yet. The page had not moved since it was written with only week 1 merged: phases 2–3 read
"next", phase 4 "planned", the masthead counted 1/12.
**Branch:** `agent/148-roadmap`, stacked on `fix/capture-spec-seller-prefix` (issue #148). Built by
the agent factory's first canary run (OpenCode, `opencode-go/glm-5.3`).

### Proven

| Check | Command | Result |
|---|---|---|
| The statuses as structure | `node .superpowers/148/roadmap-check.mjs` (scratch, not committed) | **PASS** — weeks 1–3 done/"merged", week 4 active with "phase 5 merged" + "phase 6 in progress", weeks 5–12 planned, tags balanced; the same check on the pre-change page **fails on the exact reported staleness** |
| The statuses as rendered | headless Chromium, both themes | week 4's two pills read by computed colour — phase 5's in `--done`, phase 6's in `--next`; no console errors and no horizontal overflow at 1280/720/375px |
| Whole-repo gate | `pnpm turbo run lint typecheck test build` | **37/37 tasks, twice, with this diff** (api 106 unit / 125 e2e / 122 integration / 5 concurrency; web 145; worker 19 + 6 integration; ui 37). Four later runs of the same command failed only `api#test` — three on the race below, one on the two flakes below it |

### Not proven / deferred

- **A pre-existing racy pipeline, hit by repeat runs and not caused by this change.** `turbo run
  test` runs `worker#test` in parallel with `api#test` against the one database, and the worker's
  integration fixtures write `PUBLISHED` products straight into it — while the storefront paging
  test asserts its 25 just-created rows are the whole table's newest. Gate 7's intruder is a named
  row: `Worker item cd13f90e` (org `wk-…`) was created 87 ms *inside* the paging test's creation
  loop (`Item 0802e854`, org `paging-…`), displacing it from page one. The two suites pass alone
  (14/14), and the intruding id differs on every failing run. Phase 5 recorded this pipeline as
  vetted under parallelism once; three consecutive repeat runs here hit it. The fix — isolate the
  worker suite's database, serialize the two tasks, or scope the assertion — is a maintainer's
  decision, not a roadmap ticket's.
- **Two further flakes in one run, not diagnosed further:** gate 4's run also failed
  `public catalog › hides an inactive organization's products` with `ECONNRESET`, and
  `auth (e2e) › answers an unknown email and a wrong password identically` with a 404 on a route
  that answered 200 in every other run. Both passed on an immediate rerun of the file alone — the
  same shape as the flaky `auth (e2e)` case this file already records under BL-001.

### Deviation

- **One line outside the ticket's file scope.** The capture integration spec called `createSeller()`
  bare against the helper's `createSeller(prefix: string)` — TS2554, `api#typecheck` red at HEAD, so
  the whole-repo gate could not pass for any change. Fixed on its own branch,
  `fix/capture-spec-seller-prefix`, which this one stacks on, as `createSeller('paycap')`, every sibling
  spec's prefix convention; the spec is 7/7 against real PostgreSQL. The suite had stayed green at
  runtime because jest transpiles without checking, and the bare call only stringified `undefined`
  into the seller's name and slug. Cost if wrong: revert one line.

---

## Literal tag values compared through named constants — 2026-10-24 (BL-004, #147)

**Claim:** every tag value the web app narrows on — the two themes, the session's four states, the
route gate's three answers, the products page's three load states — exists once as a named constant,
the tagged unions are built from those constants, and every comparison and construction passes the
member rather than the string.
**Branch:** `agent/147-bl-004-literal-values-still-compared-in` (issue #147, the agent factory).

### Proven

| Check | Command | Result |
|---|---|---|
| The skill's check 2, before | the `typescript-code-conventions` PCRE scan | **22 hits in the six files whose logic compared tags** — theme-toggle 6, chrome 4, store-frame 4, products page 4, middleware 2, `theme.ts` 2 (`DEFAULT_THEME`, `parseTheme`) — every one a tag value spelled inline |
| The skill's check 2, after | same | **no comparison hit remains in any of them**; the residue is named-constant definitions (`routes.ts`, `payments.ts`, `THEME_COOKIE`, and the five `packages/eslint-config` test fixtures' `export const one = 'one'` — the check's `packages/*/src/*` glob crosses `/` and reaches them), the reasoned `cookies.ts` env flag, and — still without a written reason, deferred below — the CSS `[data-theme='dark']` selectors and four ui element defaults |
| The constants are the wire values | `pnpm --filter web exec vitest run src/lib/theme src/lib/session/client.test.tsx` | the two new tests pass — `Themes` pins the spelling the cookie, the painted attribute and the token layer's selectors agree on; `SessionStatuses` pins the four arms, hand-written from the union as it was |
| The tags did not drift | `pnpm --filter web exec vitest run src/lib/session/routing.test.ts` | 15 passed — the gate's decisions are still asserted with hand-written literals, the independent source |
| Behaviour unchanged | `pnpm --filter web test` | **147 passed, 31 files** (145 before; +2), including chrome's 11 and store-frame's 3 narrowing tests |
| Whole-repo gate | `pnpm turbo run lint typecheck test build` | **37/37 tasks, exit 0** — api unit, e2e, integration and concurrency against real PostgreSQL; web 147; worker, ui and the other packages |

### Delivered

- **`lib/theme/theme.ts`** — `Themes` (`{ LIGHT, DARK }`), `DEFAULT_THEME` derived from it,
  `parseTheme` comparing the member, and `SetThemeRequestSchema` reading `z.enum(wireValues(Themes))`
  — the same shape `@app/contracts` gives `ProductStatuses`, so the theme values exist exactly once.
- **`lib/session/constants.ts`** — `SessionStatuses` and `RoutingDecisionKinds`; `SessionState` and
  `RoutingDecision` are built from them (`{ status: typeof SessionStatuses.ANONYMOUS }`), and the
  provider, the gate, both shells and the middleware pass the member at every construction and
  comparison.
- **`admin/products/page.tsx`** — a page-local `PageStates`, the `State` union built from it, every
  construction and comparison through the member.
- **`chrome.tsx` redirects through `LOGIN_PATH`** rather than a spelled `/login` — the line was
  already being edited, and `routing.ts`'s own docstring says every URL the console serves is named
  there once so a page and the gate cannot disagree.
- **`cookies.ts`'s `SESSION_COOKIE_SECURE === 'true'` carries a written reason** — the environment's
  own spelling of yes, read by one function, agreed with by nothing else in the app.

### Findings

1. **`import type { SessionStatuses }` plus `typeof SessionStatuses.LOADING` is legal, and it is the
   whole trick**: a type-only import of a const still serves `typeof`, so the interface files build
   their unions from the constants without importing a value. The unions stay tagged unions — their
   arms carry different data, exactly the shape BL-003's exception protects — while their tags stop
   being hand-written literals.
2. **`THEMES` was a tuple, so "compare the `THEMES` constants" had no members to compare.** It is now
   the const-object enum `Themes`, the repo's uniform option-set shape; `THEMES[0]` (positional)
   became `DEFAULT_THEME` (named), which is what it always meant.
3. **The strongest drift risk the new theme test pins sits outside TypeScript**: a cookie a browser
   already holds, the `data-theme` attribute the server paints, and the token layer's
   `[data-theme='dark']` selectors — none of which the compiler checks. The session and routing tags
   have no consumer outside the app, and the routing tags are additionally pinned by
   `routing.test.ts`'s hand-written literal assertions.

### Deviations

- **`THEMES` (a tuple) became `Themes` (a const-object enum)** — the ticket said "compare the
  `THEMES` constants", but a tuple has no members to compare (Finding 2). No importer is left.
- **Two values beyond the ticket's files were named, on lines already being edited:** `chrome.tsx`
  redirects through `LOGIN_PATH`, and review asked for the bare `401` in `client.tsx` to become
  `UNAUTHORIZED_STATUS` (`lib/session/constants.ts`) — `middleware.ts` already names its `308`, so
  "the protocol's number, spelled bare" was not a reason that held.
- **BL-004 is split across two PRs** to keep each under 15 files; this one does not finish it.

### Not proven / deferred

- **Four check-2 hits in `packages/ui` remain, deliberately**: the polymorphic generic defaults
  `E extends ElementType = 'div'` / `= 'a'` in `card.tsx`, `text-link.tsx` and their two interface
  files. They are React's own element names (Rule 7's framework vocabulary), compared nowhere — but
  each default *is* repeated by the `as ?? 'div'` runtime fallback, and naming them (a per-component
  member in `packages/ui/src/constants.ts`) is the honest fix. It did not fit this change's 15-file
  limit beside the ticket's named scope; the stacked follow-up PR takes it.
- **The CSS `[data-theme='dark']` selectors carry no written reason yet** (`globals.css`,
  `tokens.css`: the comments beside them explain the dark theme, not why the literal stays). The
  stacked follow-up PR takes them, with
  `PageStates`' move into a `constants.ts` (Rule 1's "where it lives") and `BACKLOG.md`'s stale
  `THEMES`. BL-004 is done when that PR merges, not this one.
- **One intermediate full-gate run failed `api#test`** — output not captured, so the failing test
  is unknown. The task passed alone immediately after (106 unit / 125 e2e / 122 integration /
  5 concurrency, exit 0) and the full gate passed on the repeat over the identical tree. Nothing in
  this diff touches an API file, and #148 and BL-001 both record this task's flakiness under
  `turbo run` parallelism against the one database.
- **The behavioural suite runs on the pull request, not here** (no Docker in the run): the
  dark-theme journey — luminance, `data-theme` painting — is the end-to-end check that the constants
  still spell what the CSS selects; the new theme test pins that spelling locally in its place.
- **Two adjacent literals found in review, neither of them a check-2 hit, recorded rather than
  widened into this change:** the BFF
  route strings `fetch('/api/session')` and its siblings, wire values the route handlers own
  (untouched lines, backlog rather than this ticket); and the two shells' identical
  loading→anonymous→failed cascade in `chrome.tsx` and `store-frame.tsx` — two sightings, but the
  branches differ in copy, redirect target and admission rule, and a shared gate component is a
  design decision (T-002 territory), not a naming ticket's.
