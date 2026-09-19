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

