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
  the two-tab case itself is not.
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

- **No visual regression testing.** Still refused: no stable rendering environment, and a flaky visual
  gate is worse than none. This is the one gap on the list that is a judgement rather than a backlog.
- **No multi-instance story** — unchanged, and phase-10 material.
- **The products page is read-only**, and lists three fields. The rest of the catalog — create, edit,
  publish, inventory — is phase 3's remaining surface, not this change's.
- **Everything in the Roadmap from phase 4 on.** Those are the plan, not gaps.



