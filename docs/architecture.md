# MarketCore — Architecture

- **Date:** 2026-09-19
- **Status:** Accepted
- **Related:** `docs/domain-model.md`, `docs/failure-scenarios.md`, `docs/adr/0001-modular-monolith-with-worker.md`

## Problem

MarketCore is a multi-tenant marketplace transaction platform. Sellers create products with
limited inventory. Buyers place orders. Payments are processed asynchronously. Seller balances,
refunds, and payouts are represented through an append-only double-entry ledger.

The platform is not intended to compete with a complete marketplace product. **The product is
technical evidence.** A reviewer should be able to inspect the code, run deterministic failure
scenarios, and see that inventory, orders, payments, and money remain consistent when requests are
retried, webhooks are duplicated or delivered out of order, workers crash, and many buyers compete
for the same stock.

### North Star question

> Can the system guarantee that inventory, orders, payments, and money remain consistent when
> failures and concurrent requests occur?

Every design decision in this repository is answerable against that question. Where a decision does
not affect the answer, it is not made here.

## Who this is for

| User | Needs | Key actions |
|---|---|---|
| Buyer | A reliable purchase outcome without duplicate charges | Browse products, submit checkout, view order, request refund |
| Seller | Accurate inventory and money owed | Manage products, review orders, view ledger balance, request payout |
| Organization Owner | Tenant administration and control | Manage members, roles, configuration, audit history |
| Operations User | Trace and recover failed workflows | Inspect payments, webhooks, jobs, refunds, correlation IDs |
| **Developer Reviewer** | **Proof of production engineering** | **Run the stack, execute tests, inspect ADRs, review measurements** |

The last row is the one that shapes the build. The first four justify *what* exists; the reviewer
justifies *how it is proven*. A feature that cannot be demonstrated to the reviewer is not finished,
which is why every week's deliverable includes the command that proves it.

## Goals and non-goals

| Goals | Non-goals |
|---|---|
| Prevent overselling under concurrent checkout | A feature-complete consumer marketplace interface |
| Make retried requests and duplicate events safe | Real money movement in production |
| Model financial events with a balanced ledger | Support for every payment provider |
| Demonstrate tenant isolation and role-based access | Premature microservice decomposition |
| Provide measurable test and load evidence | Kubernetes or Kafka solely for resume keywords |
| Deploy a reproducible and observable system | Complex recommendation, search, or logistics features |

## First release boundary

**Phases 0–4 only:** engineering specification, foundation, identity and tenancy, catalog and
inventory, transactional checkout.

That boundary is deliberate. It produces a running NestJS and PostgreSQL system with concurrency-safe
checkout, which is the project's first genuinely defensible claim. Payments, ledger, refunds, outbox,
payouts, telemetry, and deployment are *not* in the first release, and the roadmap in the README
marks them planned rather than implied.

The plan's own guidance governs extension: add a reliability mechanism only after the current one is
tested and documented, and extend the project only when the preceding exit gates remain green.

## Architecture rules

1. The PostgreSQL database is the source of truth for orders, inventory, payments, ledger entries,
   and outbox events.
2. Redis is an execution dependency for jobs and cacheable data; it is never the source of truth for
   financial state. Losing Redis must not lose money or correctness.
3. Controllers translate transport input. Application services coordinate use cases. Domain logic
   enforces invariants.
4. Modules do not modify another module's tables directly without an explicit application boundary.
5. External providers are accessed through interfaces, so the deterministic simulator and the Stripe
   adapter can be swapped without touching callers.
6. Every asynchronous consumer is safe under at-least-once delivery. Publication can be repeated;
   consumers must be idempotent regardless.

## Module boundaries

Phase numbers indicate when the module lands. Nothing is scaffolded ahead of its phase.

| Module | Owns | Main responsibilities | Phase |
|---|---|---|---|
| Auth | Credentials, sessions, tokens | Register, login, refresh, revoke, password policy, authentication guards | 2 |
| Organizations | Organizations, memberships, roles | Tenant lifecycle, invitations, member roles, tenant context | 2 |
| Catalog | Products, prices | Product lifecycle, seller ownership, pricing, publish state | 3 |
| Inventory | Stock, reservations, adjustments | Available stock, row locking, reservations, release, adjustment history | 3 |
| Orders | Orders, order items | Order creation, totals, state transitions, buyer history | 4 |
| Payments | Payments, attempts, provider references | Provider calls, payment state, webhook application, reconciliation | 6 |
| Ledger | Accounts, transactions, entries | Balanced entries, seller payable, platform revenue, account balances | 8 |
| Refunds | Refund requests and outcomes | Eligibility, provider refund, compensating entries, order impact | 9 |
| Payouts | Payout requests and attempts | Eligibility, concurrency protection, provider transfer, settlement | 11 |
| Outbox | Outbox events and dispatch | Reliable publication, claim leases, retries, delivery status | 10 |
| Audit | Immutable audit records | Actor, action, resource, before/after data, request metadata | 12 |
| Observability | Logs, metrics, traces | Correlation, instrumentation, dashboards, alerts, health checks | 1, 12 |

## Runtime shape

A **modular monolith** for the API and domain logic, plus a **separately runnable worker** in the
same repository. Both processes share domain packages and database access.

That preserves transactional boundaries — checkout's row lock, order insert, inventory decrement,
and outbox write all commit atomically in one process and one database transaction. It also
demonstrates independent scaling of request and background workloads without paying for service
decomposition, which the plan lists as a non-goal.

The worker arrives in Phase 10, when there is asynchronous work to consume. It is not scaffolded
earlier. The concrete consequence of the separate process — the worker cannot import `apps/api`, so
shared plumbing lives in `packages/runtime` — is recorded in
`docs/adr/0001-modular-monolith-with-worker.md`.

The web application is parked. The plan's non-goals exclude a consumer interface, so `apps/web`
remains exactly as the template shipped it, and the prototype's Customer/Seller/Operations screens
inform the Phase 15 demonstration rather than the build.

## Repository layout

```
apps/{api,worker,web}          worker in phase 10; web parked
packages/{runtime,domain,payments,contracts,database,api-client,ui,config,eslint-config}
docs/{architecture.md,domain-model.md,failure-scenarios.md,adr/}
load-tests/                    k6 scenarios (phase 13) — outside the pnpm workspace
infrastructure/terraform/      phase 14
```

`packages/runtime` and `packages/domain` and `packages/payments` are introduced in phases 1, 2, and 6
respectively. `packages/api-client` and `packages/ui` exist in the template and have no consumer
until the web app does.
