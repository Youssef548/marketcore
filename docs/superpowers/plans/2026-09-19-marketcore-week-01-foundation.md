# MarketCore Week 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. `superpowers:test-driven-development` applies to every
> task that writes code.

**Goal:** Deliver the plan's Phase 0 and Phase 1 — a specified, reproducible NestJS + PostgreSQL
skeleton on `ts-monorepo-template`, with shared runtime plumbing extracted so the Week 8 worker
can exist at all, and every Phase 1 exit-gate item provable by a committed command.

**Architecture:** The template's modular monolith, unchanged in shape. One new package
(`packages/runtime`) takes `validateEnv`, `PrismaModule`/`PrismaService`, request-ID propagation
and structured logging out of `apps/api`, because `apps/*` may never import `apps/*` and the
Week 8 worker needs all four. No Prisma models ship this week — models begin Week 2.

**Tech Stack:** pnpm 9.15.0 workspaces + Turborepo 2; NestJS 11; Prisma 6 + PostgreSQL 16; zod 4;
Node 22; jest 30 (apps) + vitest 2 (packages).

**Spec:** `docs/superpowers/specs/2026-09-19-marketcore-platform-design.md`
**Source plan:** `MarketCore_End_to_End_Project_Plan.docx` v1.0 — Phases 0 and 1, "First Seven Days" days 1–5 and 7.

---

## Scope check

The spec covers twelve weeks of independent subsystems, so it is **not** one plan. This plan is
Week 1 only, per the spec's phase-gating decision (D1). Weeks 2–12 get their own plan written at
the gate that precedes them, when the preceding week's actual interfaces exist to plan against —
which is what keeps a plan from specifying code that does not compile.

| Plan | Weeks | Phases | Status |
|---|---|---|---|
| `2026-09-19-marketcore-week-01-foundation.md` | 1 | 0, 1 | this document |
| week-02 tenancy + catalog | 2 | 2, 3 | written at the Week 1 gate |
| weeks 3–4 core transaction milestone | 3–4 | 4, 5, 6 | written at the Week 2 gate |
| … | 5–12 | 7–15 | written at each preceding gate |

Supporting documents written in Tasks 2–5 are **inputs** to those later plans, which is why they
come first.

## Global Constraints

- Node 22 (`.node-version`), pnpm 9.15.0 via Corepack. Workspace scope is the fixed `@app/*` and
  is never derived from the project name.
- The project name appears in exactly two places: root `package.json#name` and `APP_NAME`.
- **Money is integer minor units. No floating point anywhere, ever** (spec D9).
- **`@app/database` never imports `@nestjs/*`.** It stays framework-agnostic (spec D6).
- `apps/*` never imports `apps/*`. `packages/*` never imports an app or a tooling package. Every
  new package declares exactly one `exports` entry and its own `lint` script (spec D5, D13).
- `@app/config` and `@app/eslint-config` are tooling: importable by nothing. `tsconfig`
  `extends` is not an import and remains allowed.
- No code generation. OpenAPI is documentation only.
- Error envelope is fixed: `{ error: { code, message, requestId, details? } }`. `code` is stable
  and machine-readable; clients branch on it, never on `message`.
- **No Prisma models this week.** Models begin Week 2.
- Anything touching the database is verified against real PostgreSQL. No mocks in integration,
  e2e, or concurrency tests.
- Every task ends green: `pnpm turbo run lint typecheck test build`.

## Deviations from the source plan (recorded, not silent)

1. **Error body shape.** The plan's Error Contract shows a flat
   `{ statusCode, code, message, requestId, details }`. The template's envelope
   `{ error: { code, message, details } }` is one of its three non-negotiable invariants, and the
   plan's own requirement is only that codes be stable and machine-readable. The template shape
   wins, and `requestId` is added inside it (Task 9). No client branches on the flat shape because
   no client exists yet.
2. **Health is split, not merged.** The plan lists `GET /health/ready`. The template's `/health`
   is deliberately database-free so a container check survives a database outage. Week 1 keeps
   `/health` as liveness and adds `/health/ready` for readiness (Task 10) rather than growing a
   database dependency onto the existing endpoint.
3. **Seed rows are deferred; the seed *sequence* is not.** Phase 1 asks that "migrations and
   deterministic seed data work from a clean database". With zero models there is no data to
   seed, so Week 1 proves the sequence (`db:reset` → migrate → seed) end to end against a clean
   database, and Week 2 supplies the first real rows. Recorded here because the Phase 1 checklist
   item is therefore only partly satisfied this week.
4. **"First Seven Days" day 6 is Week 2.** The plan's day 6 (organization context, memberships,
   tenant query pattern) is Phase 2 material. The 12-week schedule assigns Week 1 to Phases 0 and
   1, and this plan follows the schedule where the two disagree.

---

## Task 1: Rename the project to MarketCore

**Files:**
- Modify: `package.json` (root), `apps/api/.env.example`, `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Produces: `APP_NAME=marketcore`, which the API's Swagger title and `validateEnv` read. Every
  later task assumes this value.

- [ ] **Step 1: Change the root package name**

```json
{
  "name": "marketcore",
  "private": true,
  "packageManager": "pnpm@9.15.0",
```

- [ ] **Step 2: Change `APP_NAME` in the API env example and CI**

`apps/api/.env.example` and `.github/workflows/ci.yml` both carry `APP_NAME=app` / `APP_NAME: app`.
Set both to `marketcore`.

- [ ] **Step 3: Reinstall and verify the workspace still resolves**

Run: `pnpm install`
Expected: completes, lockfile updated for the renamed root package only.

- [ ] **Step 4: Verify the name reaches Swagger**

Run: `cp .env.example .env && cp apps/api/.env.example apps/api/.env && cp packages/database/.env.example packages/database/.env && docker compose up -d && pnpm --filter api start &`
Run: `curl -s localhost:3001/docs-json | head -c 200`
Expected: `"title":"marketcore API"`.

- [ ] **Step 5: Run the full check suite**

Run: `pnpm turbo run lint typecheck test build`
Expected: all tasks pass (22 tasks, 26 tests as the template shipped them).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: rename project to MarketCore"
```

---

## Task 2: Project charter — `docs/architecture.md`

**Files:**
- Create: `docs/architecture.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the problem statement, scope boundary, and the module-boundary table that Tasks 3–5
  and every later week's plan reference.

- [ ] **Step 1: Write the charter**

Sections, taken from the plan's Part 1 and Part 2 and cut to what is decision-bearing:

```markdown
# MarketCore — Architecture

## Problem
<The plan's project purpose, in the plan's own words, plus the North Star question.>

## Who this is for
<Primary users table: Buyer, Seller, Organization Owner, Operations User, Developer Reviewer —
and what each needs. The Developer Reviewer row is the one this project is actually optimized for,
and saying so is honest.>

## Goals / non-goals
<The plan's table, verbatim.>

## First release boundary
Phases 0–4 only: foundation, identity and tenancy, catalog and inventory, transactional checkout.
Payments, ledger, refunds, outbox, payouts, telemetry, deployment are explicitly *not* in the
first release.

## Architecture rules
<The plan's six architecture rules.>

## Module boundaries
<The plan's module table: Auth, Organizations, Catalog, Inventory, Orders, Payments, Ledger,
Refunds, Payouts, Outbox, Audit, Observability — owns / responsibilities. Mark each module with
the phase that introduces it.>

## Runtime shape
<Modular monolith + separate worker process, with the spec's D3 note that the worker arrives in
Week 8. One diagram reference; the diagram itself is Week 12 (Phase 15).>
```

- [ ] **Step 2: Verify against the Phase 0 checklist**

Read the plan's Phase 0 Completion Checklist. Confirm `docs/architecture.md` covers the first
three items: problem statement and target reviewer, goals/non-goals/first-release boundary, and
module ownership. Items 4–7 are Tasks 3–5.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture.md && git commit -m "docs: add architecture charter"
```

---

## Task 3: Domain model — `docs/domain-model.md`

**Files:**
- Create: `docs/domain-model.md`

**Interfaces:**
- Produces: the invariant catalogue later weeks' tests are written against, and the entity/ERD
  table Week 2's Prisma models are transcribed from. Every invariant is quoted by ID (e.g.
  `INV-1`) in later test names.

- [ ] **Step 1: Write the invariant catalogue**

The plan's ten Core Business Invariants, each restated so it can become a test — with the
observable, not the intent:

```markdown
| ID | Invariant | How it is observed |
|----|-----------|--------------------|
| INV-1 | Inventory available quantity may never become negative | After any concurrent run, `SELECT available FROM inventory WHERE product_id = :id` >= 0 |
| INV-2 | A checkout idempotency key may create at most one logical operation | N requests with one key produce exactly one order row |
| INV-3 | An order may be paid at most once for the same captured amount | Capture count for one order = 1 |
| INV-4 | A provider webhook may cause each business side effect at most once | Duplicate delivery produces one state transition and one ledger transaction |
| INV-5 | A refund total may never exceed the successfully captured payment total | `SUM(refund.amountMinor) <= payment.amountMinor` |
| INV-6 | Every ledger transaction's signed entries sum to zero per currency | Group entries by transaction; signed sum = 0 for each currency |
| INV-7 | Historical financial entries are never edited or deleted | No UPDATE/DELETE path on ledger_entry exists |
| INV-8 | A seller payout may be executed at most once | One provider transfer per payout under concurrent claims |
| INV-9 | A user may not access a private resource owned by another organization | Cross-tenant fetch returns 404 or 403, never data |
| INV-10 | A committed domain event must remain recoverable after a process crash | Kill between commit and publish; the event is processed exactly once after recovery |
```

The "How it is observed" column is the point: an invariant that cannot fill that column is not an
invariant, it is a slogan (Phase 0 gate: "specific enough to become tests").

- [ ] **Step 2: Write the entity and constraint table**

The plan's Domain Model table (20 entities) with the plan's key-constraint column preserved. Add,
for each entity, the phase that introduces it — so Week 2 knows exactly which models to write and
nothing is created speculatively.

- [ ] **Step 3: Write the money rules**

The plan's five Money Representation rules, plus the spec's D9 resolution: `Int` for order-scoped
amounts, `BigInt` for ledger entries, and the bigint json codec that becomes a Week 6 deliverable.

- [ ] **Step 4: Write the state machine tables**

For Order, Payment, Refund, Payout — legal transitions and illegal transitions, exactly as the
plan lists them, in a table each. These are transcribed verbatim into `packages/domain` in later
weeks, so the wording here is the source.

- [ ] **Step 5: Verify**

Run: `grep -c 'INV-' docs/domain-model.md`
Expected: `10` distinct invariant IDs, each with a non-empty observation.

- [ ] **Step 6: Commit**

```bash
git add docs/domain-model.md && git commit -m "docs: add domain model, invariants and state machines"
```

---

## Task 4: Failure matrix — `docs/failure-scenarios.md`

**Files:**
- Create: `docs/failure-scenarios.md`

**Interfaces:**
- Produces: the mapping from each failure to the test that proves it, which every later week's
  plan cites when it writes that test.

- [ ] **Step 1: Write the failure matrix**

The plan's Failure Scenario Matrix (9 rows) plus the Flagship Automated Tests (8 rows), merged so
each failure names the test that proves it and the week that test lands:

```markdown
| Failure | Required behaviour | Proven by | Week |
|---|---|---|---|
| Client times out after checkout commit | Retry returns the original operation | Repeated-checkout idempotency test | 4 |
| Payment provider times out | Job retries safely, no duplicate capture | Simulator timeout scenario | 4 |
| Webhook duplicated | Stored or ignored, no repeated effects | Duplicate-webhook test | 5 |
| Webhook out of order | State machine applies or ignores safely | Reordered-event test | 5 |
| Worker crashes after provider success | Recovery reconciles and records once | Outbox crash-recovery test | 8 |
| Redis unavailable | Database stays consistent, work recoverable | Dependency outage test + runbook | 8 |
| Database deadlock | Bounded retry on retryable failure | Forced lock-order test | 3 |
| Email sending fails | Payment and ledger stay successful | Notification retry test | 10 |
| Two payout workers race | One claim, one provider call | Payout-race test | 9 |
```

- [ ] **Step 2: Verify coverage**

Confirm every one of the plan's eight Flagship Automated Tests appears as the "Proven by" value of
at least one failure row, and that no row's Week exceeds 12.

- [ ] **Step 3: Commit**

```bash
git add docs/failure-scenarios.md && git commit -m "docs: add failure scenario matrix"
```

---

## Task 5: ADRs — `docs/adr/` and ADR 001

**Files:**
- Create: `docs/adr/README.md`, `docs/adr/0001-modular-monolith-with-worker.md`

**Interfaces:**
- Produces: the ADR format and numbering every later ADR follows (spec D16: nine ADRs, written
  just-in-time before the phase each gates).

- [ ] **Step 1: Write the ADR index and template**

`docs/adr/README.md` lists the plan's nine ADRs with their gating phase and status
(`proposed` / `accepted` / `superseded`), and gives the section template the plan specifies:
context, decision, alternatives, trade-offs, consequences, review date.

- [ ] **Step 2: Write ADR 001**

Decision: a modular monolith with separate API and worker processes. Alternatives: single process;
microservices. Consequences must name the concrete cost this repository pays — the worker cannot
import `apps/api`, which is why `packages/runtime` exists — and link the commit that implements
it. Write it *before* Task 6, because Task 6 is its implementation.

- [ ] **Step 3: Verify**

Run: `ls docs/adr/`
Expected: `README.md`, `0001-modular-monolith-with-worker.md`.

- [ ] **Step 4: Commit**

```bash
git add docs/adr && git commit -m "docs(adr): 001 modular monolith with worker process"
```

---

## Task 6: `packages/runtime` with validated env

**Files:**
- Create: `packages/runtime/package.json`, `tsconfig.json`, `tsconfig.build.json`,
  `eslint.config.mjs`, `src/index.ts`, `src/config/env.ts`, `src/config/env.spec.ts`
- Modify: `apps/api/package.json`, `apps/api/src/main.ts`
- Delete: `apps/api/src/config/env.ts`, `apps/api/src/config/env.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `validateEnv(source?: NodeJS.ProcessEnv): Env` and `type Env` exported from
  `@app/runtime`. Task 7 adds `PrismaModule`/`PrismaService` to the same entry, Task 8 the
  request-ID and logging exports.

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "@app/runtime",
  "version": "0.1.0",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "lint": "eslint .",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@app/database": "workspace:*",
    "@nestjs/common": "^11.0.1",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@app/config": "workspace:*",
    "@app/eslint-config": "workspace:*",
    "eslint": "^9.18.0",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.20.0",
    "vitest": "^2.1.0"
  }
}
```

`@nestjs/common` is a runtime dependency here and **not** in `@app/database`, which is the whole
point of D5/D6. This package has a `lint` script because the template requires every package with
TypeScript source to lint itself.

- [ ] **Step 2: Add the tsconfigs and eslint config**

`tsconfig.json` extends `@app/config/tsconfig/nest.json` (this package holds decorators) and
includes `["src", "test"]`. `tsconfig.build.json` extends the same preset with
`"composite": false`, `"include": ["src"]`, `"exclude": ["node_modules", "dist", "test"]`.
`eslint.config.mjs` mirrors `packages/contracts/eslint.config.mjs` but with
`defineConfig({ type: 'package' })`.

- [ ] **Step 3: Write the failing test**

Create `src/config/env.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

const valid = { APP_NAME: 'marketcore', DATABASE_URL: 'postgresql://app:app@localhost:5432/app' };

describe('validateEnv', () => {
  it('accepts a valid environment and applies defaults', () => {
    const env = validateEnv(valid);
    expect(env.APP_NAME).toBe('marketcore');
    expect(env.PORT).toBe(3001);
    expect(env.WEB_URL).toBe('http://localhost:3000');
  });

  it('rejects a missing DATABASE_URL and names the field', () => {
    expect(() => validateEnv({ APP_NAME: 'marketcore' })).toThrow(/DATABASE_URL/);
  });

  it('rejects a DATABASE_URL that is not a url', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'not-a-url' })).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @app/runtime test`
Expected: FAIL — cannot resolve `./env`.

- [ ] **Step 5: Move the implementation**

Move `apps/api/src/config/env.ts` to `packages/runtime/src/config/env.ts` unchanged. Create
`src/index.ts`:

```ts
// Shared runtime plumbing for the API and worker processes. Both may import this;
// neither may import the other (see packages/eslint-config).
export * from './config/env';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @app/runtime test`
Expected: 3 passed.

- [ ] **Step 7: Point the API at the package**

`apps/api/package.json` adds `"@app/runtime": "workspace:*"` to `dependencies`. In
`apps/api/src/main.ts`, change the import to `import { validateEnv } from '@app/runtime';`. Delete
`apps/api/src/config/`.

- [ ] **Step 8: Verify the API still boots and the whole suite is green**

Run: `pnpm turbo run lint typecheck test build`
Expected: all tasks pass, including the API's e2e suite which boots the real `AppModule`.

- [ ] **Step 9: Prove the boundary rule still bites**

Temporarily add `import '@app/contracts'`-style app import to `packages/runtime/src/index.ts` as
`import '../../apps/api/src/app.module';`, run `pnpm turbo run lint`, confirm it **fails** with
`boundaries/element-types`, then revert.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(runtime): extract validated env into @app/runtime"
```

---

## Task 7: Move Prisma wiring into `packages/runtime`

**Files:**
- Create: `packages/runtime/src/prisma/prisma.module.ts`, `packages/runtime/src/prisma/prisma.service.ts`
- Modify: `packages/runtime/src/index.ts`, `apps/api/src/app.module.ts`
- Delete: `apps/api/src/prisma/`

**Interfaces:**
- Consumes: `@app/database`'s `PrismaClient`.
- Produces: `PrismaModule` (a `@Global()` Nest module) and `PrismaService extends PrismaClient`.
  Week 8's worker imports both from `@app/runtime`.

- [ ] **Step 1: Move both files unchanged**

Move `apps/api/src/prisma/prisma.module.ts` and `prisma.service.ts` to
`packages/runtime/src/prisma/`, adjusting the import of `PrismaClient` to `@app/database`.

- [ ] **Step 2: Export them**

Append to `packages/runtime/src/index.ts`:

```ts
export * from './prisma/prisma.module';
export * from './prisma/prisma.service';
```

- [ ] **Step 3: Point `AppModule` at the package**

`apps/api/src/app.module.ts` changes `import { PrismaModule } from './prisma/prisma.module';` to
`import { PrismaModule } from '@app/runtime';`. Delete `apps/api/src/prisma/`.

- [ ] **Step 4: Verify the connection is still real**

Run: `pnpm --filter api test:e2e`
Expected: pass. The e2e suite boots the real composition root, so `PrismaService.onModuleInit`
opening a connection is exercised — this is what makes the move provable rather than assumed.
No unit test is added for the Nest module: it is a decorator wiring, and its real proof is this
e2e run.

- [ ] **Step 5: Full suite**

Run: `pnpm turbo run lint typecheck test build`
Expected: all tasks pass.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(runtime): move Prisma Nest wiring into @app/runtime"
```

---

## Task 8: Request-ID propagation and structured logging

**Files:**
- Create: `packages/runtime/src/http/request-id.middleware.ts`,
  `packages/runtime/src/http/request-id.middleware.spec.ts`,
  `packages/runtime/src/logging/logger.ts`
- Modify: `packages/runtime/src/index.ts`, `apps/api/src/main.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `REQUEST_ID_HEADER = 'x-request-id'`
  - `requestIdMiddleware(req, res, next)` — reuses an incoming `x-request-id` when present and
    well-formed, otherwise generates one; always sets the response header.
  - `getRequestId(req): string | undefined`
  - `createLogger(context: string)` — a Nest `LoggerService` emitting one JSON object per line.
  Task 9 consumes `getRequestId` to put the id inside the error envelope.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { REQUEST_ID_HEADER, requestIdMiddleware } from './request-id.middleware';

function fakeRes() {
  return { setHeader: vi.fn(), locals: {} } as any;
}

describe('requestIdMiddleware', () => {
  it('generates an id when none is supplied and echoes it back', () => {
    const req = { headers: {} } as any;
    const res = fakeRes();
    requestIdMiddleware(req, res, vi.fn());
    expect(req.requestId).toMatch(/^req_/);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.requestId);
  });

  it('reuses a well-formed incoming id', () => {
    const req = { headers: { [REQUEST_ID_HEADER]: 'req_abc123' } } as any;
    const res = fakeRes();
    requestIdMiddleware(req, res, vi.fn());
    expect(req.requestId).toBe('req_abc123');
  });

  it('rejects an oversized or malformed incoming id rather than logging it', () => {
    const req = { headers: { [REQUEST_ID_HEADER]: 'x'.repeat(200) } } as any;
    const res = fakeRes();
    requestIdMiddleware(req, res, vi.fn());
    expect(req.requestId).not.toBe('x'.repeat(200));
    expect(req.requestId).toMatch(/^req_/);
  });
});
```

The third case matters: an untrusted header that is logged verbatim is a log-injection vector, and
the plan requires request IDs in structured logs.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @app/runtime test`
Expected: FAIL — cannot resolve `./request-id.middleware`.

- [ ] **Step 3: Implement the middleware and logger**

```ts
// request-id.middleware.ts
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
const MAX_LENGTH = 64;
const SAFE = /^[A-Za-z0-9._-]+$/;

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  req.requestId =
    candidate && candidate.length <= MAX_LENGTH && SAFE.test(candidate)
      ? candidate
      : `req_${randomUUID()}`;
  res.setHeader(REQUEST_ID_HEADER, req.requestId);
  next();
}

export function getRequestId(req: Request): string | undefined {
  return req.requestId;
}
```

`logger.ts` implements `LoggerService` (`log`, `error`, `warn`, `debug`, `verbose`) emitting
`JSON.stringify({ level, event, context, requestId?, ...meta })` to stdout. It takes the request id
from the caller — it does not reach into async-local storage, because that would make the request
lifecycle a dependency of every log call.

Add a `types.d.ts` or module augmentation declaring `requestId` on `Express.Request` so
`getRequestId` typechecks.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @app/runtime test`
Expected: 6 passed (3 env + 3 request-id).

- [ ] **Step 5: Wire it into the API**

In `apps/api/src/main.ts`, register `app.use(requestIdMiddleware)` **before** the global pipes and
filters so the id exists for every request, and pass `createLogger` to `NestFactory.create` via
`{ logger: createLogger('api') }`.

- [ ] **Step 6: Verify a real request carries an id**

Run: `curl -sD- -o/dev/null localhost:3001/api/v1/health`
Expected: an `x-request-id: req_…` response header.
Run: `pnpm --filter api dev` and observe a JSON log line containing `"requestId":"req_…"`.

- [ ] **Step 7: Full suite and commit**

Run: `pnpm turbo run lint typecheck test build`

```bash
git add -A && git commit -m "feat(runtime): request-id propagation and JSON logging"
```

---

## Task 9: Carry `requestId` in the error envelope

**Files:**
- Modify: `packages/contracts/src/error.ts`, `packages/contracts/src/error.test.ts`,
  `apps/api/src/filters/error-envelope.filter.ts`, `apps/api/test/app.e2e-spec.ts`

**Interfaces:**
- Consumes: `getRequestId` from `@app/runtime` (Task 8).
- Produces: `ErrorEnvelopeSchema` gains a **required** `requestId: string` inside `error`. Every
  later week's error responses carry it, so an operator can join a client complaint to a log line —
  which is the plan's Phase 12 requirement, satisfied from Phase 1.

- [ ] **Step 1: Write the failing contract test**

In `packages/contracts/src/error.test.ts`, add a case asserting an envelope **without**
`requestId` is rejected, and one asserting an envelope with it is accepted. This is the
speed-bump pattern the package already uses: widening a contract is a deliberate, tested act.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @app/contracts test`
Expected: FAIL — a malformed envelope is currently accepted.

- [ ] **Step 3: Widen the schema**

Add `requestId: z.string()` to the inner object in `ErrorEnvelopeSchema`. Leave `ErrorCodes`
**untouched** — no new codes this week, and the existing test asserting the set is exactly six
codes must keep passing.

- [ ] **Step 4: Write the failing e2e assertion**

In `apps/api/test/app.e2e-spec.ts`, extend the unknown-route test:

```ts
it('an unknown route returns the error envelope carrying the request id', async () => {
  const res = await request(app.getHttpServer())
    .get('/api/v1/nope')
    .set('x-request-id', 'req_test123')
    .expect(404);
  expect(res.body).toMatchObject({ error: { code: 'NOT_FOUND', requestId: 'req_test123' } });
});
```

Note the e2e harness in `app.e2e-spec.ts` builds the app manually — it must also
`app.use(requestIdMiddleware)` for this test to pass, which is the reminder that a global
registered only on `main.ts` is not installed in tests. That is a real gap this step exposes, and
the fix belongs in a shared `configureApp(app)` helper so `main.ts` and the e2e harness cannot
drift.

- [ ] **Step 5: Implement**

Extract `configureApp(app)` into `apps/api/src/app.setup.ts` (global prefix, pipe, filter,
request-id middleware) and call it from both `main.ts` and the e2e `beforeAll`. The filter reads
the id via `getRequestId(request)` and puts it in the envelope.

- [ ] **Step 6: Run e2e and the full suite**

Run: `pnpm --filter api test:e2e && pnpm turbo run lint typecheck test build`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(contracts): carry requestId in the error envelope"
```

---

## Task 10: Split liveness from readiness, and contract the health response

**Files:**
- Create: `packages/contracts/src/health.ts`, `packages/contracts/src/health.test.ts`
- Modify: `packages/contracts/src/index.ts`,
  `apps/api/src/modules/health/health.controller.ts`, `apps/api/src/modules/health/health.service.ts`,
  `apps/api/test/app.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService` from `@app/runtime`.
- Produces: `HealthSchema` (`{ status: 'ok' }`) and `ReadinessSchema`
  (`{ status: 'ok' | 'degraded', checks: { database: 'up' | 'down' } }`); `GET /api/v1/health`
  (liveness, no dependencies) and `GET /api/v1/health/ready` (readiness, queries the database).

- [ ] **Step 1: Write the failing contract test**

`health.test.ts`: `HealthSchema` accepts `{ status: 'ok' }` and rejects `{ status: 'nope' }`;
`ReadinessSchema` accepts both `up` and `down` database checks and rejects an unknown status.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @app/contracts test`
Expected: FAIL — cannot resolve `./health`.

- [ ] **Step 3: Implement the contracts**

```ts
// health.ts
import { z } from 'zod';

export const HealthSchema = z.object({ status: z.literal('ok') }).meta({ id: 'Health' });
export type Health = z.infer<typeof HealthSchema>;

export const ReadinessSchema = z
  .object({
    status: z.enum(['ok', 'degraded']),
    checks: z.object({ database: z.enum(['up', 'down']) }),
  })
  .meta({ id: 'Readiness' });
export type Readiness = z.infer<typeof ReadinessSchema>;
```

Export from `src/index.ts`. Each gets `.meta({ id })` so `/docs` names them, satisfying Phase 1's
"Swagger describes the health and initial API contract".

- [ ] **Step 4: Write the failing e2e test**

Assert `/api/v1/health` returns 200 `{ status: 'ok' }` **without** touching the database, and
`/api/v1/health/ready` returns 200 with `checks.database === 'up'` against the running Postgres.
Also assert `/docs-json` contains both named components — that is the evidence that Swagger
describes the contract rather than merely existing.

- [ ] **Step 5: Implement the controller and service**

Add `HealthService` with `checkReadiness()` running `SELECT 1` through `PrismaService` in a
try/catch and returning `degraded` / `database: 'down'` on failure — returning a body rather than
throwing, because a readiness probe should describe its own failure. Keep `HealthController`'s
existing liveness method database-free, and keep the doc comment that says why.

- [ ] **Step 6: Run e2e and the full suite**

Run: `pnpm --filter api test:e2e && pnpm turbo run lint typecheck test build`

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(api): split liveness from readiness with contracted responses"
```

---

## Task 11: Seed and reset the database from clean

**Files:**
- Create: `packages/database/prisma/seed.ts`, `packages/database/scripts/reset.mjs`
- Modify: `packages/database/package.json`, `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Produces: `pnpm --filter @app/database db:seed` and `db:reset`. Week 2 adds rows to `seed.ts`;
  the command and the reset sequence do not change again.

- [ ] **Step 1: Write the seed entry point**

`prisma/seed.ts` connects with `PrismaClient`, and this week performs no inserts — there are no
models. It must still: log what it did, exit non-zero on failure, and disconnect in a `finally`,
because those are the properties Week 2 depends on. A comment states explicitly that real rows
arrive with the first models.

- [ ] **Step 2: Write the reset script**

`scripts/reset.mjs` runs, in order: `prisma migrate reset --force --skip-seed`, then `db:seed`.
`prisma migrate reset` is the tool's own supported path for "clean database", and using it beats a
hand-rolled `DROP SCHEMA`, which would drift from Prisma's view of the migrations table.

- [ ] **Step 3: Add the scripts**

```json
"db:seed": "node ../../scripts/check-db-env.mjs && tsx prisma/seed.ts",
"db:reset": "node ../../scripts/check-db-env.mjs && node scripts/reset.mjs"
```

`tsx` is added as a devDependency of `@app/database`. `check-db-env.mjs` guards both, for the same
reason it guards migrate: writing seed rows into a different database than the API serves fails
silently.

- [ ] **Step 4: Verify the sequence against a clean database**

Run: `pnpm --filter @app/database db:reset`
Expected: exits 0, reports no migrations applied and nothing seeded, and leaves a valid
`_prisma_migrations` table. Run it twice — the second run must also exit 0, proving idempotence.

- [ ] **Step 5: Add the sequence to CI**

In `.github/workflows/ci.yml`, after `db:deploy`, add
`pnpm --filter @app/database db:seed`. Leave the `--affected` guard on pull requests untouched.

- [ ] **Step 6: Record the deviation**

Add a note to `README.md`'s roadmap section: Phase 1's "seed data works from a clean database" is
satisfied as a *sequence* this week; the first deterministic rows land with the first models.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(database): seed and reset paths, proven against a clean database"
```

---

## Task 12: Close the Phase 1 CI and documentation gaps

**Files:**
- Modify: `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the Phase 1 exit gate — "one command starts the API and all checks pass" — stated in
  the README and enforced by CI.

- [ ] **Step 1: Confirm CI covers the new package**

`pnpm turbo run lint typecheck test build` is package-agnostic, so `@app/runtime` is covered
automatically. Verify it is actually *running* rather than cache-hit: `pnpm turbo run lint
--force`, and confirm `@app/runtime:lint` appears in the output.

- [ ] **Step 2: Rewrite the README for MarketCore**

Sections per the spec: problem and guarantees, architecture (one diagram reference), quick start
(prerequisites → compose → install → env → migrate → seed → dev → Swagger URL → test commands),
flagship scenarios (stating plainly that they arrive in Weeks 3–9), design decisions (link
`docs/adr/`), and a roadmap with completed / in progress / planned / deliberately excluded. Every
claim must link to a command or a document.

- [ ] **Step 3: Verify the quick start from a clean clone**

Run, in the session scratchpad, outside this working tree:

```bash
git clone "$PWD" /tmp/mc-clean && cd /tmp/mc-clean
cp .env.example .env && cp apps/api/.env.example apps/api/.env && cp packages/database/.env.example packages/database/.env
docker compose up -d && corepack enable && pnpm install
pnpm --filter @app/database db:deploy && pnpm --filter @app/database db:seed
pnpm turbo run lint typecheck test build
```

Expected: every command succeeds with no edits. This is the Phase 1 exit gate, and it is the one
step that cannot be skipped — a README that has not been executed is a claim, not evidence.

- [ ] **Step 4: Verify Swagger and health by hand**

Run: `pnpm dev`, then check `/api/v1/health`, `/api/v1/health/ready`, `/docs` (200), and
`/docs-json` (title `marketcore API`, both health components present).

- [ ] **Step 5: Commit and tag**

```bash
git add -A && git commit -m "docs: rewrite README for MarketCore with a verified quick start"
git tag w01-foundation
```

---

## Task 13: Close the phase with evidence

**Files:**
- Create: `docs/superpowers/STATUS.md`

**Interfaces:**
- Produces: the per-week evidence record the spec's §8 requires, and the input to the Week 2 plan.

- [ ] **Step 1: Write the status record**

```markdown
# Status

## Week 1 — Phases 0, 1 — <date>

- **Exit gate:** one command starts the API; all checks pass.
- **Evidence:** <path to pasted output of the clean-clone quick start; CI run link>
- **Delivered:** packages/runtime; request IDs in logs and in the error envelope; liveness and
  readiness split; seed/reset sequence; ADR 001; architecture, domain model and failure docs.
- **Proven:** <list of the checks actually run>
- **Not proven / deferred:** Prisma models (Week 2); deterministic seed rows (Week 2); a
  concurrency test (Week 3); anything payment-related.
- **Deviations carried:** error envelope keeps the template shape with `requestId` added; seed
  rows deferred.
- **Next:** Week 2 — Phase 2 and 3, tenancy and catalog.
```

- [ ] **Step 2: Verify every claim names an artifact**

For each line under "Proven", confirm a command or file exists that a reviewer could run. Delete
any line that fails this check rather than softening its wording.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/STATUS.md && git commit -m "docs: week 1 status and evidence"
```

---

## Completion checklist

- [ ] `docs/architecture.md`, `docs/domain-model.md`, `docs/failure-scenarios.md`, `docs/adr/0001-*` exist; all ten invariants have an observation column; all eight flagship tests map to a failure row and a week
- [ ] `packages/runtime` exists, lints itself, and exports `validateEnv`, `PrismaModule`, `PrismaService`, `requestIdMiddleware`, `getRequestId`, `createLogger`
- [ ] `apps/api` no longer contains `src/config/` or `src/prisma/`; no file under `apps/api` imports `apps/web`
- [ ] A boundary violation in `packages/runtime` fails `pnpm lint`, verified by trying it and reverting
- [ ] Every error response carries `requestId`; `/health` is database-free; `/health/ready` reports the database check
- [ ] `db:reset` succeeds twice in a row against a clean database
- [ ] `pnpm turbo run lint typecheck test build` is green
- [ ] The clean-clone quick start in Task 12 runs with zero edits
- [ ] `docs/superpowers/STATUS.md` exists and every "Proven" line names a runnable artifact
- [ ] Tagged `w01-foundation`
