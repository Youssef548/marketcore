# MarketCore — Design

- **Date:** 2026-09-19
- **Status:** Draft — awaiting design review
- **Path:** Application domain on top of `ts-monorepo-template` (existing architecture, greenfield domain)
- **Source plan:** `MarketCore_End_to_End_Project_Plan.docx` v1.0 (2026-09-19)
- **Builds on:** `docs/superpowers/specs/2026-09-19-monorepo-boilerplate-design.md` — retained, not superseded. It documents the foundation; this spec records what gets built *through* it.
- **Continued by:** `docs/superpowers/specs/2026-09-19-marketcore-week-02-tenancy-catalog-design.md` — this document's decisions are D1–D17; that one carries D18 onward, so a code comment citing `D19` resolves through both.

> The plan is the opinion on **what** to build. This spec is the opinion on **how it lands on
> this repository**. Where the two disagree, this spec wins and the disagreement is recorded in
> §2 rather than left implicit.

## 1. Context

MarketCore is a multi-tenant marketplace transaction platform whose value is technical evidence:
a reviewer should be able to run deterministic failure scenarios and watch inventory, orders,
payments, and money stay consistent under concurrency, retries, duplicate webhooks, and worker
crashes. The plan's North Star question is whether the system can guarantee that consistency.

The template already carries the expensive architectural seams: pnpm + Turborepo, zod contracts
as the single wire format, dependency boundaries enforced as build errors, one error envelope
mapped to a typed error, wired Prisma with an empty schema, and green CI on a Postgres service.
What it deliberately does not carry is domain.

So the work is not "build a marketplace from scratch" — it is **adding a domain to an
architecture that was built to receive one**. That distinction drives nearly every decision below,
because the template already encodes opinions about where things go, and the cheapest path is to
follow them rather than fight them.

**Three gaps the template cannot absorb as-is:**

1. **No worker process.** The plan's ADR 001 requires separately runnable API and worker
   processes. The template has `apps/api` and `apps/web` only.
2. **No shared runtime.** `validateEnv`, `PrismaModule`, and logging live *inside* `apps/api`.
   The boundary rules forbid `apps/* → apps/*`, so the worker cannot reuse any of it.
3. **No domain, no money, no ledger.** Expected — this is the point of the project.

## 2. Decisions

| # | Decision | Choice | Alternatives considered | Rationale |
|---|----------|--------|------------------------|-----------|
| D1 | Sequencing | **Phase-gated on the template.** Week 1 *is* the plan's Phase 0+1 delivered through the existing tree; a package appears only in the week a phase needs it | Restructure-first (scaffold the plan's full tree in week 1); vertical slice first | The template's own spec §7 deleted hifz-tracker's Redis precisely because it was *declared and unwired*. Restructure-first re-introduces that. A vertical slice produces a demo whose correctness claims cannot yet be backed — the opposite of the project's purpose. |
| D2 | Cadence | **12 weeks, the plan's order.** Weeks 1–4 are treated as the shippable milestone the plan nominates | Compress to 6; stop at weeks 1–4 by default | The plan's exit gates assume one mechanism lands and is tested before the next. Compressing trades the correctness evidence — the only thing being sold — for schedule. |
| D3 | Worker | **Separate process, `apps/worker`, introduced in Week 8 (Phase 10)** | Single process with an in-line job runner; worker from day 1 | Honours plan ADR 001. Introducing it in Week 8 rather than Week 1 follows D1 — before Phase 10 there is no asynchronous work for it to consume, and the plan's async boundary genuinely starts at the outbox. |
| D4 | Web app | **Parked, not deleted.** `apps/web` stays exactly as the template shipped it, test green | Delete it; build the ops console now | The plan's non-goals exclude a consumer frontend. Deleting it would also delete a working cross-package React/Tailwind seam that costs nothing to keep. The prototype site informs Phase 15 demo material, not the build. |
| D5 | Shared plumbing | **New `packages/runtime`** owning `validateEnv` + env schema, `PrismaModule`/`PrismaService`, structured logger, correlation ID | Make `@app/database` Nest-aware; duplicate wiring per app | `packages/database` documents itself as framework-agnostic and never importing back; importing `@nestjs/common` there would make that comment false. Duplication is what the boundary rules exist to prevent. |
| D6 | `@app/database` | **Stays framework-agnostic.** Re-exports the Prisma client and nothing Nest-shaped | — | Reaffirms the template invariant. The Prisma *client* is shared; the Nest *service wrapper* is runtime plumbing and lives in D5's package. |
| D7 | Test databases | **CI service container, separate database names per suite** | Testcontainers (plan's wording); both, split by environment | `ci.yml` already boots Postgres 16 and passes `DATABASE_URL`. The concurrency suite needs isolation, not a new container runtime — a second database name delivers it. Testcontainers is additive later if suite parallelism demands it. |
| D8 | Test location | **Colocated:** `apps/api/test/`, `apps/worker/test/`, `packages/*/test/`. k6 scripts in a non-workspace `load-tests/` | Root `tests/` as a workspace package | `pnpm-workspace.yaml` globs `apps/*` and `packages/*` only — a root `tests/` would not be a workspace and turbo would never run it. k6 is a Go-based runner, not a pnpm package, so it stays outside the workspace by nature. |
| D9 | Money | **Integer minor units.** `Int` for order-scoped amounts; `BigInt` for ledger entries; a json codec for bigint at the API boundary | `Int` everywhere; Prisma `Decimal`; floats | Floats are excluded by the plan. `Int` caps at ~$21.4M — fine for an order, not for a long-lived account balance summed from append-only entries. `BigInt` breaks `JSON.stringify`, so the codec is mandatory, not optional. |
| D10 | Idempotency | **`Idempotency-Key` header + unique DB constraint + request hash**, claim serialized transactionally | Check-then-insert in application code | Plan ADR 003. Two concurrent first requests must not both win; only a unique constraint can guarantee that. |
| D11 | Error codes | **Extend the closed `ErrorCodes` set in `@app/contracts`** (e.g. `INVENTORY_UNAVAILABLE`, `IDEMPOTENCY_KEY_REUSED`) and keep the envelope shape | A separate marketplace error vocabulary; raw HTTP codes | The envelope already gives clients a stable `code` to branch on. The existing `contracts` test asserts the code set is exactly the six known codes — that test is a deliberate speed bump and is *updated per phase*, which is the intended workflow. |
| D12 | Observability | **Logger + correlation ID from Week 1, in `packages/runtime`**; OpenTelemetry, metrics, dashboards added to that package in Week 10 | Full OTel from Week 1; separate `packages/observability` now | Plan Phase 1 requires structured logs carrying a request ID — that is a named Week 1 deliverable, and the logger is the thing both processes will share. Full tracing has no Week 1 consumer, so it waits (D1). |
| D13 | Domain package | **`packages/domain` — pure TypeScript, one public entry.** State machines, invariants, money, eligibility rules. No Nest, no Prisma, no IO | Nest-aware library packages per module; domain logic inline in `apps/api` | The plan requires both processes to share domain logic. Pure functions are the only thing that can be shared without also sharing a DI container and a request lifecycle. |
| D14 | Shared use cases | **Extracted only when the second caller appears** (Week 8). Until then orchestration lives in `apps/api` | Build a shared application layer upfront | YAGNI, and it follows D1. Named escape hatch: `packages/payments` (D15) is justified earlier because the plan mandates the provider port. |
| D15 | Provider abstraction | **`packages/payments` — `PaymentProvider` port + deterministic simulator + Stripe adapter**, landed with Phase 6 | Provider calls inline in the payments module | The plan requires the simulator and Stripe adapter to be swappable behind an interface. A port with two real implementations and a genuine consumer from Week 6 is not speculation. |
| D16 | ADRs | **`docs/adr/`, the plan's nine ADRs, written just-in-time** before the phase each one gates | Write all nine in Week 1 | An ADR written before the constraint exists is fiction. Plan's own ADR table already assigns each a "when to write". |
| D17 | Not in scope | Consumer frontend, Kubernetes, Kafka, real money movement, recommendations/search/logistics, multi-provider support beyond Stripe | — | Straight from the plan's non-goals. |

## 3. Topology

**At the end of Week 1** — only what Phase 0+1 needs:

```
marketcore/
├── apps/
│   ├── api/                    # NestJS — existing, plus Phase 1 deliverables
│   └── web/                    # parked, untouched
├── packages/
│   ├── runtime/                # NEW (D5,D12) — env schema + validateEnv,
│   │                           #   PrismaModule/PrismaService, logger, correlation ID
│   ├── contracts/              # existing — envelope, ErrorCodes, request-id contract
│   ├── database/               # existing — still framework-agnostic
│   ├── api-client/             # existing, unused until there is an endpoint to call
│   ├── ui/                     # existing, parked with the web app
│   ├── config/                 # existing tooling
│   └── eslint-config/          # existing boundary factory
├── docs/
│   ├── adr/                    # NEW — ADR 001 (modular monolith + worker)
│   ├── superpowers/            # specs + plans (this document)
│   ├── architecture.md         # NEW
│   ├── domain-model.md         # NEW
│   └── failure-scenarios.md    # NEW
├── scripts/check-db-env.mjs    # existing, +apps/worker target (see §4)
└── docker-compose.yml          # existing — Postgres 16
```

**At the end of Week 12:**

```
marketcore/
├── apps/
│   ├── api/                    # modules: auth, organizations, catalog, inventory,
│   │                           #   orders, payments, ledger, refunds, payouts, audit
│   ├── worker/                 # NEW week 8 — BullMQ processors, Nest standalone context
│   │   └── src/jobs/           #   payment-capture, webhook-apply, outbox-dispatch,
│   │                           #   refund-execute, payout-execute, notification
│   └── web/                    # parked
├── packages/
│   ├── runtime/                # env, Prisma module, logger, correlation, (week 10) OTel
│   ├── domain/                 # NEW week 2 — pure rules, one public entry
│   ├── payments/               # NEW week 6 — provider port + simulator + stripe adapter
│   ├── contracts/              # all wire schemas, per resource
│   ├── database/               # prisma/schema/<Model>.prisma, one file per model
│   └── ...                     # api-client, ui, config, eslint-config
├── load-tests/                 # NEW week 11 — k6 scenarios (not a workspace package)
├── infrastructure/terraform/   # NEW week 11
├── docs/{adr,superpowers}/     # nine ADRs, specs, plans
└── docker-compose.yml          # +redis in week 8
```

## 4. The worker boundary, and why `packages/runtime` exists

This is the one structural change the plan's tree implies but does not spell out, so it is worth
being explicit.

`packages/eslint-config` sets `default: 'disallow'` and declares `{ from: 'app', allow: ['package'] }`
— so `apps/worker` cannot import `apps/api`, and `boundaries/no-unknown` makes the violation loud
rather than silent. Today, three things the worker needs live inside `apps/api`:

| Now | Moves to | Needed by the worker because |
|---|---|---|
| `apps/api/src/config/env.ts` (`validateEnv`, `EnvSchema`) | `packages/runtime` | It must fail at boot with a list of bad fields, exactly as the API does |
| `apps/api/src/prisma/prisma.module.ts` + `prisma.service.ts` | `packages/runtime` | It must open a real Prisma connection with lifecycle hooks |
| (nothing yet — logging is `Logger` from `@nestjs/common`) | `packages/runtime` | D12: the logger is the seam both processes share, and Phase 1 requires it now |

`packages/config` cannot host any of this: it is declared as a `tooling` element type in the
boundary rules, and `packages/*` may not import tooling. That exclusion is deliberate and this
spec does not weaken it — hence a new package rather than a new file.

**Three consequences the plan does not cover:**

1. **`scripts/check-db-env.mjs` hardcodes its target list.** It compares
   `packages/database/.env` against `apps/api/.env` and exits 0 when it finds fewer than two
   files. Adding `apps/worker/.env` without adding it to `targets` means the guard silently stops
   covering the new file — the precise silent failure the script exists to prevent. Week 8 must
   extend `targets`, and ideally the *file list* should be derived rather than hand-maintained.
2. **`turbo.json`'s `test` task declares `env: ["DATABASE_URL"]`.** Week 8 adds a Redis-dependent
   suite, so `REDIS_URL` joins that list or turbo's cache will serve a stale green result.
3. **A second process needs a second liveness/readiness surface.** The plan specifies live, ready,
   and worker-ready endpoints. The API's `/health` is deliberately database-free today; keeping
   that property while adding a genuine readiness check means two endpoints with different
   contracts, not one endpoint that grows a database dependency.

## 5. Money and the ledger representation

D9 in practical terms, because this is where the plan is thinnest and where a wrong call is
expensive to reverse:

- **Storage.** `Int` for order, item, payment, refund, and payout amounts — bounded by an order
  and comfortably inside 32 bits. `BigInt` for `LedgerEntry.signedAmountMinor`, because ledger
  entries are append-only and an account balance is a summation; 32 bits is a real ceiling there.
- **The serialization trap.** Prisma maps `BigInt` to a JavaScript `bigint`, and
  `JSON.stringify` throws on `bigint` — so `GET /ledger/accounts/:id/entries` fails the moment a
  balance leaves the process. `@app/contracts` owns a `bigintCodec` (zod transform to string on
  the wire, back to bigint at the boundary) used by every ledger schema. This is a required Week 6
  deliverable, not a nice-to-have.
- **Balancing.** The zero-sum check is a property of a *transaction*, enforced in
  `packages/domain` as a pure function over entries, and asserted by a database integration test
  against real Postgres. Plan invariant: signed sum is zero per currency.
- **Immutability.** Entries are append-only; corrections are compensating entries. No `UPDATE`
  path exists for `LedgerEntry`, and the plan's accounts are derived by summation rather than
  stored as a mutable balance — so a projection bug is recoverable by recomputation, which is one
  of the plan's interview questions.

## 6. Testing topology

Colocated per D8, mapping the plan's six layers onto real commands:

| Plan layer | Lives in | Runs as |
|---|---|---|
| Domain unit | `packages/domain/test/` | `vitest` via `turbo run test` |
| Database integration | `apps/api/test/integration/` | `jest` e2e config, real Postgres |
| Infrastructure integration | `apps/worker/test/` | `jest`, real Redis (week 8) |
| API end to end | `apps/api/test/` | existing `jest-e2e.json` |
| Concurrency | `apps/api/test/concurrency/` | `jest --runInBand`, own database name (D7) |
| Load | `load-tests/` | `k6 run`, outside the workspace |

**The eight flagship tests** are the plan's, and three of them shape the architecture rather than
merely verify it:

- *Last-item race* (week 3) — forces the row-lock-inside-a-short-transaction design. This is the
  test that makes the project worth reading.
- *Outbox crash recovery* (week 8) — forces the claim-lease design; a naive dispatcher cannot
  pass it.
- *Payout race* (week 9) — forces a single atomic claim, because two workers must not both reach
  the provider.

A test that cannot be run by a reviewer is not evidence. Each flagship test ships with a
documented command and pasted output, per the plan's Evidence Mapping.

## 7. Week-by-week delivery

Phases, exit gates, and the package that appears in that week. The gate is the plan's; the
evidence column is what gets committed so the claim is checkable.

| Wk | Theme | Phase | New in the tree | Exit gate | Evidence committed |
|----|-------|-------|-----------------|-----------|--------------------|
| 1 | Spec + foundation | 0, 1 | `packages/runtime`, `docs/adr/`, `architecture.md`, `domain-model.md`, `failure-scenarios.md`, `User` model + migration (see note) | One command starts the API; all checks green | ADR 001; the three docs; CI green |
| 2 | Tenancy + catalog | 2, 3 | `packages/domain`; tenant query pattern | Cross-tenant tests pass | Cross-tenant test output |
| 3 | Transactional checkout | 4 | Inventory locking, order creation | **Stock-1 race passes repeatedly** | Race output ×N runs; `EXPLAIN` of the lock |
| 4 | Idempotency + simulator | 5, 6 | `packages/payments`; `IdempotencyKey` model | 20 repeats → one operation | Replay test output |
| 5 | Stripe test mode | 7 | Stripe adapter behind the same port | Signed webhook flow succeeds | Test-mode event + verified signature |
| 6 | Ledger | 8 | `Ledger*` models; bigint codec (D9) | Every transaction sums to zero | Balance test over generated traffic |
| 7 | Refunds | 9 | Refund + compensating entries | Concurrent refund cap holds | Cap-race output |
| 8 | Outbox + worker | 10 | **`apps/worker`**; redis in compose; `check-db-env` and `turbo.json` fixes (§4) | Crash recovery proves once-only | Kill-worker-at-checkpoint trace |
| 9 | Payouts + audit | 11, 12a | Payout claim; audit records | Concurrent payout calls provider once | Payout-race output |
| 10 | Telemetry | 12b | OTel + metrics in `packages/runtime`; dashboards | A failed payment is traceable end to end | Trace + dashboard screenshot |
| 11 | Load + deploy | 13, 14 | `load-tests/`, `infrastructure/terraform/` | k6 report reproducible; deploy and rollback | k6 report w/ environment + raw results |
| 12 | Presentation | 15 | README rewrite; demo script | Reviewer understands value in 5 minutes | Demo video; CV bullets tied to evidence |

**Changed on review: `User` moved from week 2 into week 1.** The readiness probe must round-trip a
real query — `$connect()` was measured reporting healthy for eighteen seconds against a stopped
database — and a query through Prisma's query builder needs a delegate, which needs a model. The
alternatives were keeping raw SQL in the probe or shipping a model with no consumer; instead the
first model landed early and is genuinely exercised by the migration, the seed, the probe and CI.
D1 still holds: it was added because something needed it, not ahead of that need.

**Dependency note.** Every week after 3 assumes the previous gate is green. If a gate slips, the
plan's own guidance applies: extend only when the preceding gates remain green. Weeks 1–4
constitute a complete, defensible milestone.

## 8. What "done" means each week

The plan's exit gates are correctness conditions. This spec adds the delivery conditions, because
a portfolio project's failure mode is a green test nobody can find:

- A tagged commit on `main` (`w01-foundation`), with CI green on that tag.
- The exit-gate command written into the README's flagship-scenarios section, with its real output.
- One line in `docs/superpowers/STATUS.md`: week, gate, evidence path, what remains unproven.
- Any claim that cannot be backed by a committed artifact does not appear in the README.

## 9. Risks specific to this realization

| Risk | Warning sign | Control |
|---|---|---|
| Template drift | Editing `packages/eslint-config`, `turbo.json`, or `packages/config` outside a named decision | These are `globalDependencies`; a change invalidates every cache, so treat it as a deliberate commit, not an incidental one |
| Boundary erosion | Importing `apps/api` internals from anywhere; a new `packages/*` with no `exports` entry | `boundaries/no-unknown` is on; every package lints itself; the real-tree check (drop a cross-boundary import, run `pnpm lint`) is repeated per phase |
| Money bugs | A float anywhere; a mutable balance column; a `bigint` leak in a response | D9; domain test asserting zero-sum; contract codec test |
| False correctness | A concurrency test that mocks the database or runs single-threaded | Concurrency suites hit real Postgres with `--runInBand`, own database name, no mocks |
| Scaffolding creep | Empty `apps/worker` or `packages/observability` sitting unused for weeks | D1 — a package lands in the week its phase needs it. This spec's §3 is the checkpoint |
| Evidence debt | A week closes with tests but no committed output | §8; the STATUS.md line is part of the gate |

## 10. Non-goals

- No consumer storefront, no seller UI, no ops console. The prototype site is Phase 15 demo
  material, not a build target.
- No Kubernetes, no Kafka, no premature service decomposition — plan non-goals.
- No real money movement; Stripe test mode only.
- No provider beyond Stripe behind the port.
- No code generation. The template's "OpenAPI is documentation only" decision holds; a renamed
  route is caught by the API's e2e suite.
- No changes to `apps/web` beyond keeping its test green.
- No `@app/api-client` consumer until there is a client that needs it.

## 11. Resolved questions

**Q1 — Should the plan's root `tests/` directory be honoured?** No. `pnpm-workspace.yaml` globs
`apps/*` and `packages/*`; a root `tests/` would not be a workspace and turbo would never run it,
producing a directory of tests that silently never execute. Colocated per D8, with `load-tests/`
outside the workspace because k6 is not a pnpm package.

**Q2 — Is `packages/domain` consistent with the template's "no domain in packages" stance?** Yes,
and the distinction matters. The template ships *zero domain* because a template shipping a domain
forces every project to delete it. An application intentionally building domain into a domain
package is the intended use — `packages/*` may import `packages/*`, and both apps may import
packages, which is exactly the graph the plan's "both processes share domain packages" requires.

**Q3 — One `packages/domain` or one per aggregate?** One, with a curated public entry (D13). Each
package exposes exactly one entry, so nine aggregate packages would mean nine manifests and nine
build graphs for no isolation benefit at this size. Revisit only if the package's build time
becomes a real friction.

**Q4 — Does the worker need its own `.env`?** Yes, for `PORT`/queue configuration, which triggers
the §4 `check-db-env.mjs` and `turbo.json` consequences. Both are Week 8 tasks, listed in the
plan rather than discovered then.

**Q5 — What happens to the template's own spec and plan?** Kept. They document the foundation's
reasoning, including the two silent-failure bugs that were expensive to find, and that history is
worth more than a tidy docs folder. This spec is additive.
