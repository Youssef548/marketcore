# MarketCore — Architecture

- **Date:** 2026-09-19
- **Status:** Accepted
- **Related:** `docs/domain-model.md`, `docs/failure-scenarios.md`, `docs/adr/0001-modular-monolith-with-worker.md`,
  `docs/superpowers/specs/2026-10-16-cr-001-buyer-storefront.md`

## Problem

MarketCore is a multi-tenant marketplace transaction platform. Sellers create products with
limited inventory. Buyers browse every seller's published products, fill one cart across sellers,
and check out once; each checkout creates one order per seller, or none. Payments are processed asynchronously. Seller balances,
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
| Buyer | A reliable purchase outcome without duplicate charges | Browse every seller's products, keep one cart across sellers, check out once, view orders, request refund; in Release 2 also delivery, reviews, wishlist, search, promotion codes |
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
| Prevent overselling under concurrent checkout | Guest checkout and stock reservations |
| Make retried requests and duplicate events safe | Real money movement in production |
| Model financial events with a balanced ledger | Support for every payment provider |
| Demonstrate tenant isolation and role-based access | Premature microservice decomposition |
| Provide measurable test and load evidence | Kubernetes or Kafka solely for resume keywords |
| Deploy a reproducible and observable system | A dedicated search engine, recommendations, or carrier logistics |
| Keep a multi-seller checkout all or nothing, paid by one split charge | Platform-funded promotions |

## First release boundary

**Phases 0–4 only:** engineering specification, foundation, identity and tenancy, catalog and
inventory, the multi-seller cart and transactional all-or-nothing checkout, and the worker's first
job — cancelling unpaid checkouts.

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
   Checkout's atomic writes to `inventory` and `cart_items` go through `InventoryRepository` and
   `CartRepository`, sharing one transaction client (D93) — the boundary is the repository, not a
   separate service.
5. External providers are accessed through interfaces, so the deterministic simulator and the Stripe
   adapter can be swapped without touching callers.
6. Every asynchronous consumer is safe under at-least-once delivery. Publication can be repeated;
   consumers must be idempotent regardless.

## Module boundaries

Phase numbers indicate when the module lands. Nothing is scaffolded ahead of its phase.

**Delivered in phases 2–3 (week 2):** Auth and Organizations, plus Catalog with Inventory. The tenant
access pattern these introduced lives in `packages/domain` — `TenantContext` and `tenantScope` — rather
than in `apps/api`, so the phase-10 worker inherits it instead of reimplementing it. The decision, its
rejected alternatives (a Prisma extension, and PostgreSQL RLS deferred to phase 11) and what it costs
are in `docs/adr/010-tenant-isolation-in-the-query-layer.md`.

| Module | Owns | Main responsibilities | Phase |
|---|---|---|---|
| Auth | Credentials, sessions, tokens | Register, login, refresh, revoke, password policy, authentication guards | 2 |
| Organizations | Organizations, memberships, roles | Tenant lifecycle, invitations, member roles, tenant context | 2 |
| Catalog | Products, prices | Product lifecycle, seller ownership, pricing, publish state | 3 |
| Inventory | Stock, adjustments | Available stock, row locking, adjustment history — no reservations | 3 |
| Storefront | Public product reads | Published products across every organization, public fields only | 4 |
| Cart | Carts, cart items | One server-side cart per buyer across sellers, live availability, line cap | 4 |
| Orders | Checkouts, orders, order items | All-or-nothing checkout, one order per seller, totals, transitions, buyer history, auto-cancel | 4 |
| Payments | Payments, attempts, provider references | Provider calls, payment state, webhook application, reconciliation | 6 |
| Ledger | Accounts, transactions, entries | Balanced entries, seller payable, platform revenue, account balances | 8 |
| Refunds | Refund requests and outcomes | Eligibility, provider refund, compensating entries, order impact | 9 |
| Payouts | Payout requests and attempts | Eligibility, concurrency protection, provider transfer, settlement | 11 |
| Outbox | Outbox events and dispatch | Reliable publication, claim leases, retries, delivery status | 10 |
| Audit | Immutable audit records | Actor, action, resource, before/after data, request metadata | 12 |
| Delivery | Addresses, fulfilment | Address book, address snapshot on the order, seller fulfilment | R2 |
| Reviews | Reviews, replies | Verified-buyer reviews, seller replies | R2 |
| Wishlist | Wishlist items | Saved products, move to cart | R2 |
| Promotions | Seller codes | Percentage or fixed codes, seller-funded, snapshotted on the order | R2 |
| Search | Full-text index | Postgres full-text over published products | R2 |
| Observability | Logs, metrics, traces | Correlation, instrumentation, dashboards, alerts, health checks | 1, 12 |

## Runtime shape

A **modular monolith** for the API and domain logic, plus a **separately runnable worker** in the
same repository. Both processes share domain packages and database access.

That preserves transactional boundaries — checkout's row lock, order insert, inventory decrement,
and outbox write all commit atomically in one process and one database transaction. It also
demonstrates independent scaling of request and background workloads without paying for service
decomposition, which the plan lists as a non-goal.

The worker arrived in Phase 4 with one job: cancel checkouts still unpaid after 30 minutes and
restore their stock. It is a plain process on an interval — no Redis, no queue — and its claims
select due `checkouts` rows with `FOR UPDATE SKIP LOCKED`, so two runs divide the work instead of
both taking it. The exactly-once guarantee comes from a conditional update on the checkout's
status, not from the transport. Phase 10 adds BullMQ queues to the same process. The concrete
consequence of the separate process — the worker cannot import `apps/api`, so
shared plumbing lives in `packages/runtime` — is recorded in
`docs/adr/0001-modular-monolith-with-worker.md`.

`apps/web` serves both surfaces through one Next.js app: the seller console under `/admin` (with
`/dashboard` permanently redirected there), and the buyer storefront under `/browse`, `/cart`,
`/checkout` and `/orders`. A buyer is a user with no organization membership; the storefront reads
published products across organizations and the buyer's own cart and orders, never a tenant's
private data. The console's addresses and the storefront's do not collide, which is why one app can
serve both without a route namespace split.

## Repository layout

```
apps/{api,worker,web}          worker from phase 4; web is the operator UI and the storefront
packages/{runtime,domain,payments,contracts,database,api-client,ui,config,eslint-config}
docs/{architecture.md,domain-model.md,failure-scenarios.md,adr/}
load-tests/                    k6 scenarios (phase 13) — outside the pnpm workspace
infrastructure/terraform/      phase 14
```

`packages/runtime` and `packages/domain` and `packages/payments` are introduced in phases 1, 2, and 6
respectively. `packages/api-client` and `packages/ui` exist in the template and have no consumer
until the web app does.
