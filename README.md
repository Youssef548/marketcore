# MarketCore

A multi-tenant marketplace transaction platform that stays correct when requests are retried,
webhooks are duplicated or reordered, workers crash, and many buyers compete for the last unit of
stock.

**The North Star question:** can the system guarantee that inventory, orders, payments, and money
remain consistent when failures and concurrent requests occur?

This repository is built as engineering evidence rather than a product. A reviewer should be able to
run it, execute deterministic failure scenarios, and see for themselves that inventory, orders,
payments, and money stay consistent — every claim below is meant to be checkable by a command, not
taken on trust.

> **Status: Phase 1 of 15 — foundation.** The concurrency, idempotency, ledger, and payout guarantees
> are designed and specified, not yet implemented. See [Roadmap](#roadmap) for what is proven today
> versus what is planned, and read the claims below accordingly.

## The guarantees being built

Ten invariants, each restated as the observable that proves it, live in
[`docs/domain-model.md`](./docs/domain-model.md). The ones that shape the architecture:

| Invariant | Observable |
|---|---|
| Inventory never goes negative | After 100 concurrent checkouts for one unit: exactly one success, stock 0, one order |
| A checkout idempotency key creates at most one operation | 20 repeat requests with one key produce one order |
| A webhook causes each side effect at most once | Repeated delivery produces one state transition and one ledger transaction |
| Ledger transactions balance | Signed entries sum to zero per currency |
| A payout executes at most once | Two workers racing the same payout call the provider once |
| One tenant cannot read another's data | Cross-tenant fetch returns 404/403, never data |

## Architecture

A **modular monolith** plus a **separately runnable worker**, sharing domain packages and one
PostgreSQL database. Checkout's row lock, order insert, inventory decrement, and outbox write commit
in a single transaction; the worker handles asynchronous payment and webhook work in its own process.

```
apps/api      NestJS REST under /api/v1
apps/worker   BullMQ processors (phase 10)
packages/
  runtime     env validation, Prisma module, request ids, JSON logger  ← shared by both apps
  domain      pure rules: state machines, invariants, money (phase 2)
  payments    PaymentProvider port + simulator + Stripe adapter (phase 6)
  contracts   zod schemas — the single source of truth for the wire format
  database    Prisma wiring; prisma/schema/ is one file per model
docs/         architecture, domain model, failure scenarios, ADRs
```

Three architectural rules are enforced by tooling rather than convention:

1. **Contracts are the source of truth.** Every DTO is a zod schema in `packages/contracts`, with
   its type inferred from it. The API validates with those schemas; the client re-parses responses
   with them. No code generation — zod is simultaneously the compile-time type and the runtime guard.
2. **Dependency boundaries are build errors.** `packages/eslint-config` encodes them and ESLint fails
   the build. `apps/*` may never import another `apps/*`; `packages/*` may never import an app. This
   is not decorative — it is *why* `packages/runtime` exists, since the worker cannot import the API.
3. **Every failure has one shape.** `{ "error": { "code", "message", "requestId", "details?" } }`.
   Clients branch on `code`, never on `message`.

Design decisions and their alternatives are recorded in [`docs/adr/`](./docs/adr/).

## Quick start

Prerequisites: Node 22, pnpm 9.15.0 via `corepack enable`, and Docker.

```bash
docker compose up -d
corepack enable && pnpm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp packages/database/.env.example packages/database/.env

pnpm --filter @app/database db:deploy   # apply migrations
pnpm --filter @app/database db:seed     # deterministic seed data
pnpm dev                                # api on :3001, web on :3000
```

| Check | Expected |
|---|---|
| `curl localhost:3001/api/v1/health` | `{"status":"ok"}` — liveness, no database dependency |
| `curl localhost:3001/api/v1/health/ready` | `{"status":"ok","checks":{"database":"up"}}` |
| `curl localhost:3001/api/v1/nope` | the error envelope, carrying a `requestId` |
| `open localhost:3001/docs` | interactive API docs |

Start from nothing at any point:

```bash
pnpm --filter @app/database db:reset    # drop, re-migrate, re-seed
pnpm turbo run lint typecheck test build
```

Every response carries an `x-request-id` header, echoed from the caller when supplied and always
present in the logs — so a client complaint can be joined to a log line.

## Flagship scenarios

These are the scenarios this project exists to demonstrate. Their tests land as the phases do:

| Scenario | Command | Lands |
|---|---|---|
| Last-item race — 100 buyers, 1 unit | `pnpm --filter api test:concurrency` | phase 4 (week 3) |
| Duplicate checkout — 20 repeats, one order | `pnpm --filter api test:e2e` | phase 5 |
| Duplicate payment webhook — one ledger transaction | `pnpm --filter api test:e2e` | phase 8 |
| Outbox crash recovery — killed mid-flight, processed once | `pnpm --filter worker test:e2e` | phase 10 |
| Payout race — two workers, one provider call | `pnpm --filter worker test:e2e` | phase 11 |
| Ledger balance — every transaction sums to zero | `pnpm --filter api test:integration` | phase 8 |

The failure modes behind them — provider timeouts, reordered webhooks, Redis outages, deadlocks — are
in [`docs/failure-scenarios.md`](./docs/failure-scenarios.md) with the behaviour required of each.

## Roadmap

**Completed**

- **Phase 1 — foundation.** PostgreSQL via Docker, validated configuration, Prisma wiring with
  migrations and a verified seed/reset sequence, structured JSON logging, request IDs on every
  request and inside every error, liveness and readiness probes, Swagger generated from the
  contracts, CI on a Postgres service, and the three architectural rules enforced by the build.

**In progress**

- Phases 2–3 (week 2): identity, tenancy, catalog, inventory.

**Planned**

| Week | Phase | Milestone |
|---|---|---|
| 2 | 2–3 | Tenancy and catalog; cross-tenant tests pass |
| 3 | 4 | **Transactional checkout; the stock-1 race passes repeatedly** |
| 4 | 5–6 | Idempotency and the deterministic payment simulator |
| 5–7 | 7–9 | Stripe test mode, double-entry ledger, refunds |
| 8–9 | 10–11 | Outbox, worker, payouts, audit |
| 10–11 | 12–14 | Telemetry, k6 load results, AWS deployment |
| 12 | 15 | Portfolio presentation and hardening |

**Deliberately excluded**

A consumer storefront, Kubernetes, Kafka, real money movement, and payment providers beyond Stripe.
Each was considered and rejected for a stated reason rather than deferred silently — see
[`docs/architecture.md`](./docs/architecture.md).

## Honest limitations

- **No published load numbers.** k6 results arrive in phase 13; until then there is nothing to
  measure and no number here to distrust.
- **No deterministic seed rows yet.** The seed *sequence* is verified against a clean database, but
  there are no models to seed until phase 2.
- **The worker does not exist yet.** It arrives in phase 10, when there is asynchronous work for it
  to consume. The boundary that forces `packages/runtime` is already in place, because enforcing it
  after the fact is more expensive than designing for it.
- **One known gap in boundary enforcement.** A package importing an app via a path that does not
  resolve passes both ESLint and `tsc` — `boundaries/no-unknown` is only enabled for apps, and
  TypeScript ignores unresolved side-effect-only imports. Nothing binds in that shorthand, so the
  hazard is narrow, but the app direction does not have it. Recorded in
  `docs/superpowers/STATUS.md` rather than left to be discovered.

## Conventions

- **Node 22**, pnpm 9.15.0 via Corepack, Docker for local Postgres 16. REST under `/api/v1`; the
  prefix lives in `apps/api/src/app.setup.ts`, not in each controller.
- **`DATABASE_URL` lives in two places** — `apps/api/.env` and `packages/database/.env`.
  `scripts/check-db-env.mjs` runs before every migrate and seed command and refuses when they
  disagree, because the alternative is migrating one database while serving another, silently.
- **Global HTTP behaviour has one home.** `apps/api/src/app.setup.ts` configures the prefix, request
  ids, request logging, the validation pipe, the error filter and Swagger. `main.ts` and the e2e
  suite both call it — a global registered only in `main.ts` is not installed in tests, so a test
  that boots a differently configured app proves less than it appears to.
- **Adding a resource**, in layer order:
  1. schema in `packages/contracts/src/<name>.ts`
  2. model in `packages/database/prisma/schema/<Name>.prisma`, then
     `pnpm --filter @app/database db:migrate --name add_<name>`
  3. module under `apps/api/src/modules/<name>/`, with DTOs built via `createZodDto`, registered in
     `app.module.ts`
- **A schema used as a `createZodDto` source must not also carry `.meta({ id })`.** Both register the
  same OpenAPI component name and `cleanupOpenApiDoc` throws rather than picking one. See the comment
  in `packages/contracts/src/health.ts`.
- **No `.env` in git.** `.env.example` files only.

## Working method

Specifications, implementation plans, and the per-week evidence record live under
[`docs/superpowers/`](./docs/superpowers/). Work proceeds one phase at a time with an exit gate per
phase; the project is extended only while the preceding gates stay green.

## Built on

Architecture from [`ts-monorepo-template`](https://github.com/Youssef548/ts-monorepo-template) —
pnpm + Turborepo, zod contracts, boundary rules as build errors, one error envelope. The template
ships no domain by design; everything above is built through it. Its original README, including the
two subtle bugs that make the boundary rules actually fire, is preserved in git history.
