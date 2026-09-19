# 001 Use a modular monolith with API and worker processes

- **Date:** 2026-09-19
- **Status:** Accepted
- **Phase:** 0 — gates the application structure
- **Implements:** `docs/superpowers/plans/2026-09-19-marketcore-week-01-foundation.md`, Tasks 6–7

## Context

MarketCore must keep inventory, orders, payments, and money consistent under concurrency and
failure. Two forces pull in opposite directions.

Checkout must be atomic: locking the inventory row, validating available quantity, decrementing
stock, inserting the order and items, and writing the outbox event all have to commit or fail
together. That is a single database transaction.

Payment processing must be asynchronous and independently scalable: provider calls are slow,
retryable, and failure-prone, and a webhook burst should not be served by the same workers handling
buyer traffic.

A microservice split would satisfy the second force and break the first, replacing one transaction
with a saga and its compensating actions — a large increase in the number of ways money can end up
inconsistent, in exchange for a scaling property this project has no measurement to justify.

## Decision

Build the API and domain logic as a **modular monolith**, in one repository and one deployable, plus
a **separately runnable worker process** that shares the domain packages and database access.

One database, one set of migrations, one transactional boundary for checkout. Two process entry
points, so request and background workloads scale and fail independently.

## Alternatives considered

- **A single process with an in-process job runner.** Rejected: it cannot demonstrate recovery when
  the process executing a job dies mid-flight, which is one of the plan's named failure scenarios and
  one of the eight flagship tests. In-process retries also compete with request handling for the same
  event loop and connection pool.
- **Microservices split by module** (catalog, orders, payments, ledger). Rejected: it converts
  checkout's single transaction into a distributed saga purely to satisfy the *appearance* of
  scalability. The plan lists premature microservice decomposition as a non-goal, and no measurement
  in this project justifies it. An ADR tied to a measured limitation is the plan's stated bar for
  revisiting.
- **Serverless functions per endpoint.** Rejected: cold starts and per-invocation connection handling
  work against row-locking behaviour under contention, which is the project's central claim.

## Trade-offs

- The worker adds a second process to build, configure, deploy, and monitor, and a second `.env` with
  its own `DATABASE_URL` — which is also a second place for that value to go stale, mitigated by
  `scripts/check-db-env.mjs`.
- Module boundaries inside a monolith are conventions unless something enforces them. This repository
  enforces them at the two places a boundary can actually be crossed: database access (a module never
  writes another module's tables without going through an application service) and packages (ESLint
  `boundaries/element-types` with `default: 'disallow'`, so an undeclared edge fails the build).
- Redis becomes an execution dependency for the worker. It is deliberately **not** the source of
  truth for financial state, so its loss delays work but cannot corrupt money.

## Consequences

**The load-bearing consequence: the worker cannot import the API.**

`packages/eslint-config` declares `{ from: 'app', allow: ['package'] }`, so `apps/worker` importing
`apps/api` is a lint error, and `boundaries/no-unknown` makes the unresolved edge loud rather than
silent. Therefore anything both processes need must live in a package:

- `validateEnv` and `EnvSchema` move from `apps/api/src/config/` to `packages/runtime`.
- `PrismaModule` and `PrismaService` move from `apps/api/src/prisma/` to `packages/runtime`.
- Request-ID propagation and the logger live in `packages/runtime`, because they are the observability
  seam both processes share.

Two follow-on obligations this decision creates, both scheduled rather than discovered:

1. `scripts/check-db-env.mjs` compares a hardcoded list of two `.env` files. Adding `apps/worker/.env`
   without extending that list means the guard silently stops covering it — the exact silent failure
   the script exists to prevent. Phase 10.
2. `turbo.json`'s `test` task declares `env: ["DATABASE_URL"]`. The worker's suites also depend on
   Redis, so `REDIS_URL` must join that list or turbo will serve a stale cached result. Phase 10.

Both are recorded in the spec's §4 and in the Phase 10 plan rather than left to be rediscovered.

## Review date

2026-12-19, or earlier if a measured bottleneck appears that a modular monolith cannot address.
