# MarketCore

A multi-tenant marketplace transaction platform that stays correct when requests are retried, webhooks
are duplicated or reordered, workers crash, and many buyers compete for the last unit of stock.

**The North Star question:** can the system guarantee that inventory, orders, payments, and money
remain consistent when failures and concurrent requests occur?

> **This repository is engineering evidence, not a product.** A reviewer should be able to run it,
> execute deterministic failure scenarios, and see for themselves that inventory, orders, payments and
> money stay consistent. Every claim below is meant to be checkable by a command rather than taken on
> trust — and where something is not yet proven, it says so.

**Status: phases 0–3 of 15, plus the first web slice and its design system.** Identity, tenancy and
catalog are built; `apps/web` signs a user in, holds the session in `httpOnly` cookies, selects an
organization, and is designed to the system in [`docs/design/deliverables`](./docs/design/deliverables).
The concurrency, idempotency, ledger and payout guarantees are designed and specified, not yet
implemented — see [Roadmap](#roadmap).

**Scope:** an operator UI for sellers *and* a multi-seller buyer storefront — public buyers browse
every seller's published products, fill one cart across sellers, and check out once. The
requirements are in [`CR-001`](./docs/superpowers/specs/2026-10-16-cr-001-buyer-storefront.md) and
the [storefront PRD](./docs/superpowers/specs/2026-10-16-marketcore-storefront-prd.md).

---

## Start here

| If you want to… | Go to |
|---|---|
| Understand what is being proven | [The guarantees](#the-guarantees-being-built) |
| See how it is put together | [Architecture](#architecture) |
| See what it looks like | [Design](#design) |
| Run it | [Quick start](#quick-start) |
| Check a specific claim | [Prove it](#prove-it) |
| Know what is *not* done | [Honest limitations](#honest-limitations) |

---

## The guarantees being built

Ten invariants, each restated as the observable that proves it, live in
[`docs/domain-model.md`](./docs/domain-model.md). The ones that shape the architecture:

| Invariant | Observable | Status |
|---|---|---|
| Inventory never goes negative | 100 concurrent checkouts for one unit: exactly one success, stock 0, one order | constraint proven · race is phase 4 |
| A checkout idempotency key creates at most one operation | 20 repeat requests with one key produce one order | phase 5 |
| A webhook causes each side effect at most once | Repeated delivery produces one state transition and one ledger transaction | phase 8 |
| Ledger transactions balance | Signed entries sum to zero per currency | phase 8 |
| A payout executes at most once | Two workers racing the same payout call the provider once | phase 11 |
| One tenant cannot read another's data | Cross-tenant fetch returns 404/403, never data | **proven, phase 2** |
| A checkout creates every seller's order or none | A 3-seller cart with one line short of stock creates 0 orders and changes no stock | phase 4 |
| A buyer reads only their own orders and cart | Cross-buyer fetch returns 404, never data | phase 4 |
| An abandoned checkout restores its stock exactly once | An unpaid checkout older than 30 minutes is cancelled once, however many runs see it | phase 4 |

---

## Architecture

A **modular monolith** plus a **separately runnable worker**, sharing domain packages and one
PostgreSQL database. Checkout's row lock, order insert, inventory decrement and outbox write commit
in a single transaction; the worker handles asynchronous work in its own process.

```
apps/api      NestJS REST under /api/v1
apps/worker   background jobs — checkout auto-cancel from phase 4, BullMQ queues from phase 10
apps/web      Next.js 15 App Router — the operator UI, the buyer storefront, and a BFF in front of the API
packages/
  runtime     env validation, Prisma module, request ids, JSON logger  ← shared by both apps
  domain      pure rules: state machines, invariants, money
  payments    PaymentProvider port + simulator + Stripe adapter (phase 6)
  contracts   zod schemas — the single source of truth for the wire format
  database    Prisma wiring; prisma/schema/ is one file per model
  ui          the design system — tokens and components
docs/         architecture, domain model, failure scenarios, ADRs, design deliverables
```

Three architectural rules are **enforced by tooling rather than convention**:

1. **Contracts are the source of truth.** Every DTO is a zod schema in `packages/contracts` with its
   type inferred from it. The API validates with those schemas; the client re-parses responses with
   them. No code generation — zod is simultaneously the compile-time type and the runtime guard.
2. **Dependency boundaries are build errors.** `apps/*` may never import another `apps/*`, and
   `packages/*` may never import an app. This is not decorative — it is *why* `packages/runtime`
   exists, since the worker cannot import the API.
3. **Every failure has one shape.** `{ "error": { "code", "message", "requestId", "details?" } }`.
   Clients branch on `code`, never on `message`.

Design decisions and their alternatives are recorded in [`docs/adr/`](./docs/adr/).

---

## Design

The operator UI and the storefront are designed to **Quartz** — a dark navy rail on a cool near-white canvas, one indigo
action, DM Sans with DM Mono for numerals. The direction, the alternatives that were rendered and
rejected, and what it costs are in [`ADR 013`](./docs/adr/013-design-direction-quartz.md).

Two things make it a system rather than a skin:

- **One file is the look.** `packages/ui/src/tokens.css` is a three-layer token set — palette, then
  semantic roles, then the direction's values — so a component names what a colour is *for*
  (`bg-action`) rather than what it is. Changing the app's look is changing that file, and a second
  theme is a second value set for the same names: **Quartz** by default, **Graphite** dark, chosen by
  a cookie the server reads so the first paint is already right.
- **Contrast is a test, not a promise.** `packages/ui/test/tokens.spec.ts` re-derives every
  text-on-surface pair the components paint from the literal values and fails below 4.5:1 — for both
  themes. It is why Quartz ships duller than it was drawn: ten of those pairs failed at the values
  that looked right. The control boundary is held to its own 3:1 bar (WCAG 1.4.11), because an input's
  border is the only thing distinguishing it from the page.

Everything visual is generated and committed, so it cannot drift from the code:

| Artefact | What it is |
|---|---|
| [`docs/design/deliverables/ui/stitch/`](./docs/design/deliverables/ui/stitch/README.md) | 37 screens, operator and storefront — the design source for every page, built on the Quartz tokens |
| [`docs/design/deliverables/ui/tokens.json`](./docs/design/deliverables/ui/tokens.json) | the token set in Tokens Studio shape — import into Figma |
| [`docs/design/deliverables/user-flows.html`](./docs/design/deliverables/user-flows.html) | every user journey, live today through week 12 |
| [`docs/design/deliverables/system-design/`](./docs/design/deliverables/system-design/index.html) | C4 context and containers, the module map, the entity map, five sequence diagrams |

---

## Quick start

Prerequisites: **Node 22**, **pnpm 9.15.0** via `corepack enable`, and **Docker**.

```bash
docker compose up -d
corepack enable && pnpm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp packages/database/.env.example packages/database/.env

pnpm --filter @app/database db:deploy   # apply migrations
pnpm --filter @app/database db:seed     # two organizations, their members, and a product each
pnpm dev                                # api on :3001, web on :3000
```

The seed is deterministic and idempotent, and its users can authenticate — `owner@marketcore.test`
with the password `correct-horse-battery` is an owner of Nile Traders. It exists so the walkthrough
below can be run by hand.

| Check | Expected |
|---|---|
| `curl localhost:3001/api/v1/health` | `{"status":"ok"}` — liveness, no database dependency |
| `curl localhost:3001/api/v1/health/ready` | `{"status":"ok","checks":{"database":"up"}}` |
| `curl localhost:3001/api/v1/nope` | the error envelope, carrying a `requestId` |
| `open localhost:3001/docs` | interactive API docs, generated from the contracts |
| `open localhost:3000` | the sign-in screen — the seeded owner signs in |

Start from nothing at any point:

```bash
pnpm --filter @app/database db:reset    # drop, re-migrate, re-seed
pnpm turbo run lint typecheck test build
```

Every response carries an `x-request-id` header, echoed from the caller when supplied and always
present in the logs — so a client complaint can be joined to a log line.

---

## Prove it

The whole repository in one command:

```bash
pnpm turbo run lint typecheck test build      # 33 tasks: lint, types, unit, e2e, integration, build
```

And the layers that need more than one process:

```bash
pnpm --filter api test                       # unit + in-process e2e + integration against real Postgres
docker compose -f docker-compose.e2e.yml up -d --build --wait
pnpm --filter e2e test:behavioural           # 14 tests: real image, real TLS, real browser
docker compose -f docker-compose.e2e.yml down -v
```

The flagship scenarios, and where each is proven:

| Scenario | Command | Status |
|---|---|---|
| **Tenant isolation** — one organization cannot read another's product | `pnpm --filter api test:e2e` | **proven** |
| Refresh rotation — a replayed token revokes the session | `pnpm --filter api test:e2e` | **proven** |
| Refresh race — two concurrent claims, one rotation | `pnpm --filter api test:integration` | **proven** |
| Inventory constraints enforced by the database | `pnpm --filter api test:integration` | **proven** |
| Cookie flags as a browser actually received them | `pnpm --filter e2e test:behavioural` | **proven** |
| Last-item race — 100 buyers, 1 unit | `pnpm --filter api test:concurrency` | phase 4 |
| All-or-nothing checkout — one short line, zero orders | `pnpm --filter api test:integration` | phase 4 |
| Cross-buyer isolation — one buyer cannot read another's order | `pnpm --filter api test:e2e` | phase 4 |
| Abandoned checkout — cancelled and restocked once | `pnpm --filter worker test:integration` | phase 4 |
| Duplicate checkout — 20 repeats, one order | `pnpm --filter api test:e2e` | phase 5 |
| Duplicate payment webhook — one ledger transaction | `pnpm --filter api test:e2e` | phase 8 |
| Outbox recovery — killed mid-flight, processed once | `pnpm --filter worker test:e2e` | phase 10 |
| Ledger balance — every transaction sums to zero | `pnpm --filter api test:integration` | phase 8 |

The failure modes behind them — provider timeouts, reordered webhooks, Redis outages, deadlocks — are
in [`docs/failure-scenarios.md`](./docs/failure-scenarios.md), each with the behaviour required of it.

---

## Roadmap

**Done**

- **Phase 1 — foundation.** PostgreSQL via Docker, validated configuration, Prisma with checked-in
  migrations and an idempotent seed, structured JSON logging, request ids end to end, liveness and
  readiness probes, Swagger generated from the contracts, CI on a Postgres service, and the three
  architectural rules enforced by the build.
- **Phase 2 — identity and tenancy.** Register, login, refresh with rotation and reuse detection, and
  logout; argon2id behind a `PasswordHasher` port. Organizations with owner/member memberships, the
  `x-organization-id` header resolved into a `TenantContext` by a guard, and a deny-by-default guard
  chain whose opt-outs (`@Public`, `@TenantFree`, `@OwnerOnly`) are greppable. The exit gate — one
  organization cannot read another's product — passes, including the control case.
- **Phase 3 — catalog and inventory.** Tenant-scoped product CRUD with explicit publish/unpublish
  transitions, readable inventory, and the `Inventory` CHECK constraint enforced in the database
  rather than by application validation.
- **The first web slice.** Register, sign in, sign out and choose an organization, with both tokens in
  `httpOnly` cookies behind a BFF ([ADR 011](./docs/adr/011-web-session-and-token-storage.md)) and
  single-flight rotation, because the API revokes a session when a refresh token is replayed.
- **The design system.** One direction, three token layers, five components, contrast as a test, and
  the screens designed against it — [ADR 013](./docs/adr/013-design-direction-quartz.md).
- **The second theme and the first tenant page.** Graphite dark ships as a cookie the server reads. The
  products page reads the catalog through the BFF, carrying `x-organization-id` so the browser never
  names a tenant. `control-edge` gives inputs a boundary that clears WCAG 1.4.11 in both themes, and
  two ESLint rules close the boundary hole the README used to admit.
- **The first-run flow.** A user who registers belongs to nothing, and every tenant-scoped screen is
  inert without a tenant — so signing in with no memberships shows a **create-your-first-organization
  screen instead of the shell**. `POST /organizations` was always there and the app never called it;
  it does now, and the caller becomes the owner.

**In progress**

- Phase 4: the multi-seller cart, all-or-nothing checkout, the stock-1 race, and a minimal worker
  that cancels unpaid checkouts after 30 minutes.

**Planned**

No fixed dates. The storefront lands in two releases: Release 1 alongside the invariant phases,
Release 2 after them.

| Release | Phase | Milestone |
|---|---|---|
| 1 | 4 | **Cart and all-or-nothing multi-seller checkout; the stock-1 race passes repeatedly; auto-cancel worker** |
| 1 | 5–6 | Idempotency scoped to the buyer, and the deterministic payment simulator |
| 1 | 7–9 | Stripe test mode, one charge split by a double-entry ledger, buyer refund requests |
| 1 | 10–11 | Outbox and queues in the worker, payouts, audit |
| 2 | — | Addresses and delivery, account and saved cards, reviews, wishlist, discovery, search, seller promotions |
| — | 12–14 | Telemetry, k6 load results, AWS deployment |
| — | 15 | Portfolio presentation and hardening |

**Deliberately excluded** — guest checkout, stock reservations, a dedicated search engine,
platform-funded promotions, Kubernetes, Kafka, real money movement, and payment providers beyond
Stripe. Each was considered and
rejected for a stated reason rather than deferred silently; see [`docs/architecture.md`](./docs/architecture.md).

---

## Honest limitations

- **No published load numbers.** k6 results arrive in phase 13; until then there is nothing to measure
  and no number here to distrust.
- **Seven tables, and concurrency is proven on exactly one of them.** `User`, `Organization`,
  `OrganizationMember`, `Session`, `RefreshToken`, `Product` and `Inventory` exist. Each is exercised
  by unit, e2e or integration tests — but the only concurrency claim made so far is the refresh race.
- **Access tokens cannot be revoked.** Revocation applies to sessions and refresh tokens only, so a
  stolen access token remains valid until it expires — which is why the TTL is short.
- **No email is sent by anything.** Member administration adds an existing user by email; invitations,
  delivery and password reset do not exist.
- **The worker does not exist yet.** It arrives in phase 4 as a plain process that cancels unpaid
  checkouts, and gains queues in phase 10. The boundary that forces `packages/runtime` is already in
  place.
- **Two themes ship, and a person chooses.** `apps/web` renders Quartz or Graphite from a cookie the
  server reads, so the page arrives painted. The default is light whatever the operating system says.
- **The products page exists, and it is thin.** Name, status and price, for the organization the
  session acts in. Editing, inventory and images are the catalog phase's work; the board is the
  specification for the rest.
- **One organization can be created, and only as the first one.** The onboarding screen closes that
  dead end. Creating a *second* organization for someone who already has one is not built — the BFF
  route supports it, and it is a button beside the switcher when it is wanted.
- **A known gap in boundary enforcement, now closed.** A package importing an app via a path that does
  not resolve used to pass both ESLint and `tsc`. It needed two rules, not one: `no-unknown` reports a
  file that *resolves* and belongs to no element, and is silent on a path that resolves to nothing at
  all — which `import/no-unresolved` catches. Both are enabled, with a fixture per shape.
  **Correction, 2026-10-16:** until BL-001, `no-unknown` and the colour-literal rule fired only in the
  fixture workspace. Their globs were written relative to the repo root, and flat config resolves them
  against each package's own config directory, so they matched no real file. They are package-relative
  now, and a fixture package with its own config proves each fires where turbo actually runs it.
- **No visual regression testing.** No stable rendering environment; a flaky visual gate is worse than
  none.

---

## Conventions

- **Node 22**, pnpm 9.15.0 via Corepack, Docker for local Postgres 16. REST under `/api/v1`; the
  prefix lives in `apps/api/src/app.setup.ts`, not in each controller.
- **`DATABASE_URL` lives in two places** — `apps/api/.env` and `packages/database/.env`.
  `scripts/check-db-env.mjs` runs before every migrate and seed command and refuses when they disagree.
- **Global HTTP behaviour has one home.** `apps/api/src/app.setup.ts` configures the prefix, request
  ids, request logging, the validation pipe, the error filter and Swagger. `main.ts` and the e2e suite
  both call it — a global registered only in `main.ts` is not installed in tests.
- **Tenant identity travels in the `x-organization-id` header**, resolved by a guard against the
  caller's memberships — never read by a controller. A cross-tenant read answers **404**; a header
  naming someone else's tenant answers **403**.
- **Every route is guarded by default.** `@Public()`, `@TenantFree()` and `@OwnerOnly()` are the only
  opt-outs, and they are greppable.
- **A feature module groups its artifacts into folders by type.** `apps/api/src/<module>/` keeps
  `dto/`, `repositories/` and `interfaces/` folders; controllers, services and the module file stay at
  the module root. Code that belongs to no module lives in `apps/api/src/common/`. The rule, and the
  check that fails on a loose file, are in `.agents/skills/nestjs-code-conventions`.
- **Exported shapes live in `*.interface.ts` files**, in every app and package — never inline in a
  component or service. A type derived from a value beside it (`z.infer`, `typeof`) stays with that
  value, so a contract's schema and its type cannot drift. A lint error, not a habit.
- **Every shape has a name.** An option set is a const-object enum (`ControlSizes.LG`, not `'lg'`), and a
  component's props are a named interface, not an inline `{ … }`. Also a lint error.
- **The web app holds the session, not the browser.** `apps/web` is a BFF: its route handlers are the
  only code that calls the API, and both tokens live in `httpOnly` cookies.
- **No `.env` in git.** `.env.example` files only.

---

## Where things live

```
docs/adr/                       architecture decisions, with their alternatives and costs
docs/domain-model.md            the ten invariants, the entity table, the state machines
docs/failure-scenarios.md       the nine failures and the behaviour required of each
docs/superpowers/               specs, implementation plans, and STATUS.md — the per-phase evidence
docs/design/deliverables/       the generated visual artefacts: UI board, user flows, system design
```

`docs/superpowers/STATUS.md` is the honest record: each phase closes with its exit gate, the command
that proves it, and an explicit list of what remains unproven.

---

## Built on

Architecture from [`ts-monorepo-template`](https://github.com/Youssef548/ts-monorepo-template) —
pnpm + Turborepo, zod contracts, boundary rules as build errors, one error envelope. The template ships
no domain by design; everything above is built through it.
