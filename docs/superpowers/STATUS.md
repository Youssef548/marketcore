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
| API tests | `pnpm --filter api test` | 4 unit + 9 e2e |

### Delivered

- **Phase 0 documents:** `docs/architecture.md`, `docs/domain-model.md` (ten invariants each with an
  observable, entity table with phase assignments, money widths, per-aggregate transition tables),
  `docs/failure-scenarios.md` (nine failures, eight flagship tests), `docs/adr/0001-…`.
- **`packages/runtime`** — the package ADR 001 requires: validated env, `PrismaModule`/`PrismaService`,
  request-id and request-logger middleware, JSON logger. `apps/api/src/config/` and `src/prisma/` are gone.
- **Request ids end to end** — generated or accepted, validated against injection, echoed on the
  response, present in every error envelope and in one log line per request.
- **Liveness/readiness split** with contracted responses; readiness returns 503 when degraded.
- **Seed and reset sequence**, proven against a clean database and wired into CI.
- **One shared HTTP configuration** (`apps/api/src/app.setup.ts`) used by `main.ts` and the e2e suite.
- **README rewritten** and executed; its content is verified, not aspirational.

### Not proven / deferred

- **No Prisma models.** The schema is empty by design; models begin in phase 2. Phase 1's "seed data
  works from a clean database" is therefore satisfied as a *sequence*, not as rows.
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

Three defects found by building on the template. The first two are template defects worth fixing
upstream; all three were found by *running* things rather than reading them.

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
- **Seed rows deferred** to phase 2; the sequence is proven now.
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
The first Prisma models and the first real seed rows land there.
