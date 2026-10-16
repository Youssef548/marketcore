# MarketCore Phase 4 — Cart, all-or-nothing checkout, the first worker job — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. `superpowers:test-driven-development` applies to every task
> that writes code.

**Goal:** Deliver Release 1's phase-4 slice (T-010 … T-061, milestone M1) — a public catalog, a
server-side multi-seller cart, a checkout that creates every seller's order or none under 100-way
contention, buyer order history, and `apps/worker` cancelling unpaid checkouts exactly once — with
every claim proven by a committed, runnable test.

**Architecture:** Buyer routes are `@TenantFree()`; a fourth global guard turns the authenticated
user into a `BuyerContext`, and every buyer repository composes its `where` from `buyerScope()` in
`packages/domain`, the same shape as `tenantScope()`. Checkout is one interactive Prisma transaction
owned by `CheckoutRepository`: lock the buyer's cart row, lock every inventory row in one
`SELECT … ORDER BY "productId" COLLATE "C" FOR UPDATE`, re-read price and status, let a pure domain
rule decide, then decrement, insert one `Checkout` plus one `Order` per seller, and empty the cart.
`apps/worker` is a plain Node process on a `setTimeout` chain that shares `packages/runtime`,
`packages/domain` and `@app/database`; exactly-once cancellation comes from a conditional
`UPDATE … WHERE status = 'PENDING_PAYMENT'` over a `FOR UPDATE SKIP LOCKED` subquery, not from a queue.

**Tech Stack:** pnpm 9.15.0 workspaces + Turborepo 2; NestJS 11; Prisma 6 + PostgreSQL 16; zod 4
(`nestjs-zod` 5); Node 22; jest 30 + supertest (apps/api); vitest 2 (packages, apps/worker,
apps/web); Next.js 15.5 + React 19 (apps/web); Playwright 1.49 (apps/e2e); Docker Compose + Caddy.

**Spec:** `docs/superpowers/specs/2026-10-16-marketcore-storefront-srs.md` (SRS 1.0, D75–D80).
**Read with it:** `docs/superpowers/specs/2026-10-16-marketcore-storefront-prd.md` (acceptance
criteria), `docs/superpowers/specs/2026-10-16-cr-001-buyer-storefront.md` (D52–D74),
`docs/superpowers/plans/2026-10-16-marketcore-release-1.md` (task ids, §6 test map, §7 deployment),
`docs/domain-model.md`, `docs/failure-scenarios.md`, ADRs `0001`, `010`, `014`.
**This plan adds decisions D81–D90** — each is listed in the *Plan findings* section at the end with
the gap in the SRS or the code that forced it. None changes a requirement silently.

**Branch:** `feat/phase-4-cart-checkout`, from the commit that closes M0 (T-002). The API, domain,
contracts, database and worker tasks (1–19) do not touch the shell and may start before T-002 lands;
the web tasks (20–25) are written against the shell as it is at `3633695` and name the one seam
(`StoreFrame`) T-002 may restyle.

---

## Global Constraints

Copied from the SRS, the platform spec and AGENTS.md. Every task's requirements implicitly include
this section.

- Node 22 (`.node-version`), pnpm 9.15.0 via Corepack. Workspace scope is `@app/*`.
- **Money is integer minor units. No floating point in logic** (platform D9). The only division by
  100 in the repository is display formatting in `apps/web/src/lib/money.ts`.
- `packages/*` never imports `apps/*`; `apps/*` never imports `apps/*` (ADR 0001). The worker
  therefore re-implements nothing from `apps/api` — shared code goes to a package.
- `packages/domain` holds pure rules only — no Nest, no Prisma, no IO. It may import `@app/contracts`.
- Contracts in `packages/contracts` are the wire source of truth. **No new `ErrorCode`** (SRS §8):
  stock, price and cart-change failures are `409 CONFLICT` with a typed `details`; mixed currency and
  shape errors are `400 VALIDATION_ERROR`; a cross-buyer miss is `404 NOT_FOUND` (ADR 010).
- Every route is guarded by default; `@Public()`, `@TenantFree()`, `@OwnerOnly()` remain the only
  opt-outs. Buyer routes are `@TenantFree()` per handler (D75), never class-level.
- Tenant identity comes from `x-organization-id`, resolved by `OrganizationGuard`; buyer identity
  comes from the access token's `sub`, resolved by `BuyerGuard`. A controller reads neither header.
- **Layering is `controller → service → repository → Prisma`.** A service importing `PrismaService`
  is a defect. A transaction is opened by a repository.
- **No literals in logic.** Wire values in `packages/contracts/src/constants.ts`; implementation values
  in a `*.constants.ts` beside the code that owns them; const-object enums with derived types.
- Interfaces and types live in `interfaces/*.interface.ts` (apps) or `<subject>.interface.ts`
  (packages), never beside logic.
- Feature modules: `dto/`, `repositories/`, `interfaces/` folders; controllers, services, mappers and
  the module file at the module root; shared non-module code in `apps/api/src/common/`.
- Migrations are **additive**. `Cart`, `CartItem`, `Checkout`, `Order`, `OrderItem` are new tables —
  verified absent at `3633695` (`grep -rn "model Order" packages/database/prisma` → nothing).
- No Redis in phase 4 (SRS §10). The worker uses PostgreSQL only.
- **Every test that touches data runs against real PostgreSQL** (failure-scenarios §4). Nothing in
  integration, e2e or concurrency suites mocks Prisma.
- Do not weaken a test to get green. If a test fails, decide whether the code or the expectation is
  wrong, and record a wrong expectation in the defect table at the end of this plan.
- Every task ends green on `pnpm turbo run lint typecheck test build`.

## Verification ladder used by this plan

| Claim | Lowest layer that can falsify it | Suite |
|---|---|---|
| Fee split, transitions, line evaluation, grouping | package unit + property | `pnpm --filter @app/domain test` |
| Wire shapes, `PublicProduct.strict()` | contracts unit + property | `pnpm --filter @app/contracts test` |
| CHECKs, uniques, enum drift, all-or-nothing, deadlock classification | integration, real Postgres | `pnpm --filter api test:integration` |
| 100-way stock-1 race ×20; 50 overlapping carts | concurrency, real Postgres, real HTTP | `pnpm --filter api test:concurrency` (created in Task 15) |
| Status codes, guards, envelopes, cross-buyer 404s | API e2e | `pnpm --filter api test:e2e` |
| Two auto-cancel runs restore once; restart catches up | worker integration | `pnpm --filter worker test:integration` (created in Task 17) |
| Browser journeys, the real worker process behind compose | behavioural Playwright | `pnpm --filter e2e test:behavioural` |

## File Structure

**`packages/domain/src`** — new pure rules.

| File | Responsibility |
|---|---|
| `buyer.interface.ts` / `buyer.ts` | `BuyerContext`, `BuyerScope`; `buildBuyerContext`, `buyerScope` |
| `order.interface.ts` / `order.ts` | `StatusTransitionOutcomes`; `planCheckoutTransition`, `planOrderTransition` |
| `fee.interface.ts` / `fee.ts` | `FeeSplit`; `PLATFORM_FEE_BPS`, `BPS_DENOMINATOR`, `splitPlatformFee` (D78) |
| `checkout-policy.ts` | `AUTO_CANCEL_INTERVAL_MS`, `AUTO_CANCEL_BATCH_SIZE` (D79), `CHECKOUT_PAYMENT_WINDOW_MS` (D70) |
| `checkout.interface.ts` / `checkout.ts` | `cartLineAvailability`, `evaluateCheckoutLines`, `singleCurrency`, `sameLines`, `groupBySeller`, `sumLineTotals`, `byLockOrder` |

**`packages/contracts/src`** — `constants.ts` gains the phase-4 value sets; new `pagination.ts`,
`storefront.ts`, `cart.ts`, `checkout.ts`, `buyer-order.ts`; `product.ts` gains
`SetInventoryRequestSchema` (D81).

**`packages/runtime/src`** — `config/env.ts` gains `DatabaseEnvSchema` and `parseEnv`; `constants.ts`
gains the checkout and worker `LogEvents`.

**`packages/database/prisma`** — `schema/{Cart,CartItem,Checkout,Order,OrderItem}.prisma` new;
`User`, `Organization`, `Product` gain back-relations; one migration with hand-written CHECKs.

**`apps/api/src`**

| Path | Responsibility |
|---|---|
| `security/guards/buyer.guard.ts`, `security/decorators/buyer.decorator.ts` | `BuyerContext` on tenant-free routes (D75) |
| `common/pagination/page.ts` | `toPage` — cursor pages for storefront and buyer orders |
| `common/database/{database.constants.ts,retryable-transaction.ts}`, `common/interfaces/retry.interface.ts` | deadlock/serialization classification and bounded retry (SRS §8) |
| `filters/error-envelope.filter.ts` | forwards `details` from an `HttpException` (finding 1) |
| `catalog/…` | `PUT /products/:id/inventory` (D81) |
| `storefront/` | `GET /storefront/products[/:id]` |
| `cart/` | `GET /cart`, `PUT`/`DELETE /cart/items/:productId` |
| `orders/` | `POST /checkouts`, `GET /checkouts/:id`, `GET /buyer/orders[/:id]` |

**`apps/api/test`** — `support/marketplace.ts` (Prisma-level fixtures), `support/logger.ts`
(capturing logger); e2e suites `storefront`, `inventory`, `cart`, `checkout`, `buyer-orders`;
integration `phase-4-constraints`, `deadlock`, `checkout`; `concurrency/` with its own jest config.

**`apps/worker`** (new) — `src/main.ts`, `src/scheduler.ts`, `src/config/worker-env.ts`,
`src/auto-cancel/{auto-cancel.repository.ts,auto-cancel.job.ts}`, `src/interfaces/*.interface.ts`,
`src/worker.constants.ts`; `test/` with its own fixtures (apps never import apps); `Dockerfile`.

**`apps/web/src`** — `app/(shop)/…` (browse, product, cart, checkout, placed, my orders, order
detail), `app/api/{storefront,cart,checkouts,buyer}/…` BFF routes, `lib/storefront/*`,
`lib/money.ts`, `lib/http/buyer-route.ts`.

**Root** — `scripts/check-db-env.mjs` (third target, comparison fix), `docker-compose.e2e.yml`
(worker service), `.github/workflows/ci.yml` (worker logs, concurrency in the gate), README,
STATUS, ADR 010 and architecture wording.

## Task map

| Task | Release-plan id | Deliverable | Proven by |
|---|---|---|---|
| 1 | T-010 | `BuyerContext`, `buyerScope` | domain unit |
| 2 | T-010 | checkout/order statuses and transitions, fee split, auto-cancel policy | domain unit + property |
| 3 | T-010 | checkout line rules | domain unit + property |
| 4 | T-011 | pagination, `PublicProduct` strict | contracts unit + property |
| 5 | T-011 | cart, checkout, conflict details, buyer orders, set-inventory | contracts unit |
| 6 | T-012 | five models, one migration, CHECKs | integration |
| 7 | T-011 | error envelope carries `details` | unit + e2e |
| 8 | T-013 | `BuyerGuard`, `@Buyer()` | unit |
| 9 | D81 | `PUT /products/:id/inventory` | e2e |
| 10 | T-020 | public catalog | e2e |
| 11 | T-030 | cart | unit + e2e |
| 12 | T-040 | retryable transactions, forced deadlock | unit + integration |
| 13 | T-040 | `CheckoutRepository.place` — all or nothing | integration |
| 14 | T-040, T-041 | checkout routes, logs, double submit | unit + e2e |
| 15 | T-040 | stock-1 race ×20, overlapping carts | concurrency |
| 16 | T-060 | buyer orders | e2e |
| 17 | T-050 | `apps/worker` scaffold, env, `check-db-env.mjs` | unit |
| 18 | T-051 | auto-cancel job | worker integration |
| 19 | T-050/T-051 | worker image, compose, CI | compose up + behavioural smoke |
| 20 | T-021 | web: shop shell, BFF, routing | web unit |
| 21 | T-021 | web: browse, product page | web unit |
| 22 | T-031 | web: cart | web unit |
| 23 | T-042 | web: review step, placed screen | web unit |
| 24 | T-061 | web: my orders, order detail | web unit |
| 25 | T-042, T-061, T-051 | behavioural journeys 1–2 and the abandoned checkout | Playwright |
| 26 | M1 | the gate: evidence, docs, STATUS | every suite |

Task order is the dependency order of the release plan §3; tasks within a band (1–5, 9–11, 17)
are independent and may be dispatched in parallel.

---

### Task 1: `packages/domain` — the buyer boundary

**Files:**
- Create: `packages/domain/src/buyer.interface.ts`, `packages/domain/src/buyer.ts`,
  `packages/domain/test/buyer.spec.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BuyerContext` (`{ buyerId: string }`), `BuyerScope` (`{ buyerId: string }`),
  `buildBuyerContext(buyerId: string): BuyerContext` (throws on `''`),
  `buyerScope(buyer: BuyerContext): BuyerScope`.

- [ ] **Step 1: Write the failing test**

`packages/domain/test/buyer.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MemberRoles } from '@app/contracts';
import { buildBuyerContext, buyerScope } from '../src/buyer';
import { buildTenantContext, tenantScope } from '../src/tenant';

describe('buildBuyerContext', () => {
  it('carries the authenticated user as the buyer', () => {
    expect(buildBuyerContext('user_1')).toEqual({ buyerId: 'user_1' });
  });

  it('refuses to build without a buyer id', () => {
    // Same rule as TenantContext: a BuyerContext that exists always names a buyer,
    // so a scope built from it can never match every buyer's rows.
    expect(() => buildBuyerContext('')).toThrow(/buyerId/);
  });
});

describe('buyerScope', () => {
  it('produces the filter every buyer query composes from', () => {
    expect(buyerScope(buildBuyerContext('user_2'))).toEqual({ buyerId: 'user_2' });
  });

  it('never produces a tenant filter, so a buyer read cannot be a tenant read', () => {
    // RULE-BORD-001: buyer queries are by buyer id only. The two scopes share no key,
    // so spreading the wrong one into a where clause filters on a column that is not
    // there and fails loudly in Prisma rather than quietly matching.
    const buyer = buyerScope(buildBuyerContext('user_3'));
    const tenant = tenantScope(buildTenantContext('org_3', MemberRoles.OWNER));

    expect(Object.keys(buyer)).toEqual(['buyerId']);
    expect(Object.keys(buyer).some((key) => key in tenant)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @app/domain test -- buyer`
Expected: FAIL — `Failed to resolve import "../src/buyer"`.

- [ ] **Step 3: Implement**

`packages/domain/src/buyer.interface.ts`:

```ts
/**
 * The buyer a request acts for. Built by BuyerGuard from the access token's
 * subject (D75), never from a request field.
 */
export interface BuyerContext {
  buyerId: string;
}

/** The filter shape every buyer-scoped query composes its `where` from. */
export interface BuyerScope {
  buyerId: string;
}
```

`packages/domain/src/buyer.ts`:

```ts
import type { BuyerContext, BuyerScope } from './buyer.interface';

export * from './buyer.interface';

/** The only sanctioned way to construct a BuyerContext. */
export function buildBuyerContext(buyerId: string): BuyerContext {
  if (buyerId.length === 0) {
    throw new Error('buildBuyerContext requires a buyerId');
  }
  return { buyerId };
}

/**
 * The single definition of the buyer filter — ADR 010's amendment. Cart, checkout
 * and buyer-order repositories compose from this and never from tenantScope.
 */
export function buyerScope(buyer: BuyerContext): BuyerScope {
  return { buyerId: buyer.buyerId };
}
```

Append to `packages/domain/src/index.ts`:

```ts
export * from './buyer';
```

(`buyer.ts` re-exports its interface file, the resolution week 2's defect 3 settled on.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @app/domain test`
Expected: PASS — every existing spec plus `buyer.spec.ts` (4 new cases).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/buyer.interface.ts packages/domain/src/buyer.ts packages/domain/src/index.ts packages/domain/test/buyer.spec.ts
git commit -m "feat(domain): BuyerContext and buyerScope, the buyer twin of the tenant boundary"
```

---

### Task 2: Statuses, transitions, the fee split and the auto-cancel policy

**Files:**
- Modify: `packages/contracts/src/constants.ts`, `packages/contracts/test/constants.spec.ts`,
  `packages/domain/src/index.ts`
- Create: `packages/domain/src/order.interface.ts`, `packages/domain/src/order.ts`,
  `packages/domain/src/fee.interface.ts`, `packages/domain/src/fee.ts`,
  `packages/domain/src/checkout-policy.ts`, `packages/domain/test/order.spec.ts`,
  `packages/domain/test/fee.property.spec.ts`, `packages/domain/test/checkout-policy.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (contracts): `CheckoutStatuses` / `CheckoutStatus` and `OrderStatuses` / `OrderStatus`,
  each exactly `{ PENDING_PAYMENT, CANCELLED }` (D84); `CHECKOUT_PAYMENT_WINDOW_MINUTES = 30` (D70).
- Produces (domain): `StatusTransitionOutcomes` (`ALLOWED`, `ILLEGAL_TRANSITION`),
  `planCheckoutTransition(from: CheckoutStatus, to: CheckoutStatus)`,
  `planOrderTransition(from: OrderStatus, to: OrderStatus)`; `PLATFORM_FEE_BPS = 1000`,
  `BPS_DENOMINATOR = 10_000`, `splitPlatformFee(totalMinor: number): FeeSplit`
  (`{ feeMinor, sellerShareMinor }`); `AUTO_CANCEL_INTERVAL_MS = 60_000`,
  `AUTO_CANCEL_BATCH_SIZE = 100`, `CHECKOUT_PAYMENT_WINDOW_MS = 1_800_000`,
  `checkoutExpiresAt(placedAt: Date): Date`.

**Why only two states (D84).** The domain model's order machine has `PAID`, `FULFILLING` and
`COMPLETED`, but no phase-4 operation can reach them. Week 2 dropped `ARCHIVED` from `ProductStatus`
for exactly this reason, and the same rule applies: phase 6 adds `PAID` with an additive
`ALTER TYPE "OrderStatus" ADD VALUE 'PAID'` in the migration that first writes it.

- [ ] **Step 1: Write the failing tests**

Append to `packages/contracts/test/constants.spec.ts` (keep the file's existing imports; add the
new names to its import from `../src/constants`):

```ts
describe('phase-4 value sets', () => {
  it('a checkout and an order share the same two reachable states (D84)', () => {
    expect(Object.values(CheckoutStatuses).sort()).toEqual(['CANCELLED', 'PENDING_PAYMENT']);
    expect(Object.values(OrderStatuses).sort()).toEqual(['CANCELLED', 'PENDING_PAYMENT']);
  });

  it('states the payment window once, for the API, the worker and the placed screen (D70)', () => {
    expect(CHECKOUT_PAYMENT_WINDOW_MINUTES).toBe(30);
  });
});
```

`packages/domain/test/order.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CheckoutStatuses, OrderStatuses, wireValues } from '@app/contracts';
import {
  StatusTransitionOutcomes,
  planCheckoutTransition,
  planOrderTransition,
} from '../src/order';

describe('planOrderTransition', () => {
  it('allows the auto-cancel move, PENDING_PAYMENT → CANCELLED', () => {
    expect(planOrderTransition(OrderStatuses.PENDING_PAYMENT, OrderStatuses.CANCELLED)).toBe(
      StatusTransitionOutcomes.ALLOWED,
    );
  });

  it('refuses every other pair, including CANCELLED → anything', () => {
    // The illegal table is the negative space of the legal one, so it is asserted
    // over every pair rather than over the pairs someone remembered.
    for (const from of wireValues(OrderStatuses)) {
      for (const to of wireValues(OrderStatuses)) {
        if (from === OrderStatuses.PENDING_PAYMENT && to === OrderStatuses.CANCELLED) continue;
        expect({ from, to, outcome: planOrderTransition(from, to) }).toEqual({
          from,
          to,
          outcome: StatusTransitionOutcomes.ILLEGAL_TRANSITION,
        });
      }
    }
  });
});

describe('planCheckoutTransition', () => {
  it('moves with its orders: the same single legal edge', () => {
    for (const from of wireValues(CheckoutStatuses)) {
      for (const to of wireValues(CheckoutStatuses)) {
        const legal = from === CheckoutStatuses.PENDING_PAYMENT && to === CheckoutStatuses.CANCELLED;
        expect(planCheckoutTransition(from, to)).toBe(
          legal ? StatusTransitionOutcomes.ALLOWED : StatusTransitionOutcomes.ILLEGAL_TRANSITION,
        );
      }
    }
  });
});
```

`packages/domain/test/fee.property.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { BPS_DENOMINATOR, PLATFORM_FEE_BPS, splitPlatformFee } from '../src/fee';

// Int column ceiling: Order.totalMinor is a 32-bit Int (domain-model §3).
const total = fc.integer({ min: 0, max: 2_147_483_647 });

describe('splitPlatformFee (D78)', () => {
  it('is 10%', () => {
    expect(PLATFORM_FEE_BPS).toBe(1000);
    expect(BPS_DENOMINATOR).toBe(10_000);
  });

  it('matches the PRD example orders exactly', () => {
    // AC-US-PAY-001-1's two orders, E£249.00 and E£189.00.
    expect(splitPlatformFee(24_900)).toEqual({ feeMinor: 2_490, sellerShareMinor: 22_410 });
    expect(splitPlatformFee(18_900)).toEqual({ feeMinor: 1_890, sellerShareMinor: 17_010 });
  });

  it('rounds the fee down, so a fraction of a minor unit goes to the seller', () => {
    expect(splitPlatformFee(999)).toEqual({ feeMinor: 99, sellerShareMinor: 900 });
    expect(splitPlatformFee(9)).toEqual({ feeMinor: 0, sellerShareMinor: 9 });
  });

  it('never loses or invents a minor unit: fee + share = total (INV-13)', () => {
    fc.assert(
      fc.property(total, (totalMinor) => {
        const { feeMinor, sellerShareMinor } = splitPlatformFee(totalMinor);
        expect(feeMinor + sellerShareMinor).toBe(totalMinor);
        expect(Number.isInteger(feeMinor)).toBe(true);
        expect(feeMinor).toBeGreaterThanOrEqual(0);
        // floor(total × bps / 10 000), stated without floating point.
        expect(feeMinor * BPS_DENOMINATOR).toBeLessThanOrEqual(totalMinor * PLATFORM_FEE_BPS);
        expect((feeMinor + 1) * BPS_DENOMINATOR).toBeGreaterThan(totalMinor * PLATFORM_FEE_BPS);
      }),
    );
  });

  it('refuses a fractional or negative total rather than rounding it', () => {
    expect(() => splitPlatformFee(10.5)).toThrow(RangeError);
    expect(() => splitPlatformFee(-1)).toThrow(RangeError);
  });
});
```

`packages/domain/test/checkout-policy.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CHECKOUT_PAYMENT_WINDOW_MINUTES } from '@app/contracts';
import {
  AUTO_CANCEL_BATCH_SIZE,
  AUTO_CANCEL_INTERVAL_MS,
  CHECKOUT_PAYMENT_WINDOW_MS,
  checkoutExpiresAt,
} from '../src/checkout-policy';

describe('auto-cancel policy (D70, D79)', () => {
  it('runs every 60 seconds and cancels at most 100 per run', () => {
    expect(AUTO_CANCEL_INTERVAL_MS).toBe(60_000);
    expect(AUTO_CANCEL_BATCH_SIZE).toBe(100);
  });

  it('derives the window in milliseconds from the one wire value', () => {
    expect(CHECKOUT_PAYMENT_WINDOW_MS).toBe(CHECKOUT_PAYMENT_WINDOW_MINUTES * 60_000);
  });

  it('expires a checkout exactly 30 minutes after placement', () => {
    const placedAt = new Date('2026-10-16T10:00:00.000Z');
    expect(checkoutExpiresAt(placedAt).toISOString()).toBe('2026-10-16T10:30:00.000Z');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @app/contracts test -- constants && pnpm --filter @app/domain test -- order fee checkout-policy`
Expected: FAIL — `CheckoutStatuses is not defined` and `Failed to resolve import "../src/order"`.

- [ ] **Step 3: Implement**

Append to `packages/contracts/src/constants.ts`:

```ts
/**
 * A checkout's states in phase 4 (D84). `PAID` arrives in phase 6 with the first
 * code that can write it — a state no operation can enter is scaffolding.
 */
export const CheckoutStatuses = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CANCELLED: 'CANCELLED',
} as const;
export type CheckoutStatus = (typeof CheckoutStatuses)[keyof typeof CheckoutStatuses];

/** Every order of a checkout moves with it (domain-model §5), so the sets are equal. */
export const OrderStatuses = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatuses)[keyof typeof OrderStatuses];

/**
 * How long a checkout may stay unpaid before the worker cancels it (D70).
 * Wire-level for the reason PASSWORD_MIN_LENGTH is: the placed screen states it,
 * and the browser must not hold a second copy.
 */
export const CHECKOUT_PAYMENT_WINDOW_MINUTES = 30;
```

`packages/domain/src/order.interface.ts`:

```ts
export const StatusTransitionOutcomes = {
  ALLOWED: 'ALLOWED',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
} as const;
export type StatusTransitionOutcome =
  (typeof StatusTransitionOutcomes)[keyof typeof StatusTransitionOutcomes];
```

`packages/domain/src/order.ts`:

```ts
import {
  CheckoutStatuses,
  OrderStatuses,
  type CheckoutStatus,
  type OrderStatus,
} from '@app/contracts';
import { StatusTransitionOutcomes, type StatusTransitionOutcome } from './order.interface';

export * from './order.interface';

/** Phase 4's one legal move, for both aggregates: auto-cancel (D70). */
const CHECKOUT_TRANSITIONS: Record<CheckoutStatus, readonly CheckoutStatus[]> = {
  [CheckoutStatuses.PENDING_PAYMENT]: [CheckoutStatuses.CANCELLED],
  [CheckoutStatuses.CANCELLED]: [],
};

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatuses.PENDING_PAYMENT]: [OrderStatuses.CANCELLED],
  [OrderStatuses.CANCELLED]: [],
};

function plan<S extends string>(
  table: Record<S, readonly S[]>,
  from: S,
  to: S,
): StatusTransitionOutcome {
  return table[from].includes(to)
    ? StatusTransitionOutcomes.ALLOWED
    : StatusTransitionOutcomes.ILLEGAL_TRANSITION;
}

export function planCheckoutTransition(
  from: CheckoutStatus,
  to: CheckoutStatus,
): StatusTransitionOutcome {
  return plan(CHECKOUT_TRANSITIONS, from, to);
}

export function planOrderTransition(from: OrderStatus, to: OrderStatus): StatusTransitionOutcome {
  return plan(ORDER_TRANSITIONS, from, to);
}
```

`packages/domain/src/fee.interface.ts`:

```ts
export interface FeeSplit {
  feeMinor: number;
  sellerShareMinor: number;
}
```

`packages/domain/src/fee.ts`:

```ts
import type { FeeSplit } from './fee.interface';

export * from './fee.interface';

/** The platform fee in basis points (D78): 1000 bps = 10%. */
export const PLATFORM_FEE_BPS = 1000;

/** Basis points in a whole. */
export const BPS_DENOMINATOR = 10_000;

/**
 * Splits one seller order's total into the platform fee and the seller share
 * (D78). Applied per order, never per checkout, so a refund of one order can
 * reverse exactly what that order posted (ADR 014).
 *
 * Integer arithmetic only: total ≤ 2^31 and bps ≤ 10^4 keep the product far
 * below 2^53, so Math.floor of an exact integer quotient is exact.
 */
export function splitPlatformFee(totalMinor: number): FeeSplit {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) {
    throw new RangeError(`splitPlatformFee needs a non-negative integer, got ${totalMinor}`);
  }
  const feeMinor = Math.floor((totalMinor * PLATFORM_FEE_BPS) / BPS_DENOMINATOR);
  return { feeMinor, sellerShareMinor: totalMinor - feeMinor };
}
```

`packages/domain/src/checkout-policy.ts`:

```ts
import { CHECKOUT_PAYMENT_WINDOW_MINUTES } from '@app/contracts';

const MS_PER_MINUTE = 60_000;

/** The worker's cadence (D79). */
export const AUTO_CANCEL_INTERVAL_MS = 60_000;

/** The most checkouts one run cancels (D79), so one run's transaction stays short. */
export const AUTO_CANCEL_BATCH_SIZE = 100;

/** D70, in the unit the worker computes with. */
export const CHECKOUT_PAYMENT_WINDOW_MS = CHECKOUT_PAYMENT_WINDOW_MINUTES * MS_PER_MINUTE;

export function checkoutExpiresAt(placedAt: Date): Date {
  return new Date(placedAt.getTime() + CHECKOUT_PAYMENT_WINDOW_MS);
}
```

Append to `packages/domain/src/index.ts`:

```ts
export * from './order';
export * from './fee';
export * from './checkout-policy';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @app/contracts test && pnpm --filter @app/domain test`
Expected: PASS — contracts +2 cases; domain +3 order, +5 fee, +3 policy.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/constants.ts packages/contracts/test/constants.spec.ts packages/domain/src packages/domain/test
git commit -m "feat(domain): phase-4 order states, the 10% fee split and the auto-cancel policy"
```

---

### Task 3: The checkout line rules

**Files:**
- Modify: `packages/contracts/src/constants.ts`, `packages/domain/src/index.ts`
- Create: `packages/domain/src/checkout.interface.ts`, `packages/domain/src/checkout.ts`,
  `packages/domain/test/checkout.spec.ts`, `packages/domain/test/checkout.property.spec.ts`

**Interfaces:**
- Consumes: Task 2's contracts constants file.
- Produces (contracts): `CART_LINE_MIN_QUANTITY = 1`, `CART_LINE_MAX_QUANTITY = 10` (D72),
  `CHECKOUT_MAX_LINES = 50` (SRS §7), `STOREFRONT_PAGE_SIZE = 24` (SRS-FR-CAT-001),
  `BUYER_ORDERS_PAGE_SIZE = 20` (D89), `CartLineAvailabilities` (`OK`, `SHORT`, `SOLD_OUT`),
  `CheckoutConflictReasons` (`SOLD_OUT`, `SHORT`, `PRICE_CHANGED`), `CheckoutRefusals`
  (`CART_CHANGED`), with derived types.
- Produces (domain):
  - `LineQuantity { productId: string; quantity: number }`
  - `ConfirmedLine extends LineQuantity { unitPriceMinor: number }`
  - `LockedLineState { productId: string; purchasable: boolean; available: number; currentUnitPriceMinor: number }`
  - `LineConflict { productId: string; reason: CheckoutConflictReason; available: number; currentUnitPriceMinor: number | null }`
  - `SellerGroup<T> { sellerId: string; lines: T[] }`
  - `cartLineAvailability(quantity, available, purchasable): CartLineAvailability`
  - `evaluateCheckoutLines(confirmed: readonly ConfirmedLine[], state: ReadonlyMap<string, LockedLineState>): LineConflict[]`
  - `singleCurrency<C extends string>(currencies: readonly C[]): C | null`
  - `sameLines(cart: readonly LineQuantity[], requested: readonly LineQuantity[]): boolean`
  - `groupBySeller<T extends { sellerId: string }>(lines: readonly T[]): SellerGroup<T>[]`
  - `sumLineTotals(lines: readonly { quantity: number; unitPriceMinor: number }[]): number`
  - `byLockOrder(a: string, b: string): number`

**The precedence rule (D85).** SRS-FR-CHK-003 lists three reasons but not what one line that fails
two ways reports. One reason per line, in the order a buyer must fix them: `SOLD_OUT` (not
purchasable, or `available = 0`) before `SHORT` before `PRICE_CHANGED`. The current price still rides
on every conflict, so a short line whose price also moved shows both facts.

**The masking rule (D86).** A line whose product is no longer public (draft, or its organization
inactive) reports `available: 0` and `currentUnitPriceMinor: null`: INV-9 keeps a draft's price and
stock private, and a cart is not a reason to leak them.

- [ ] **Step 1: Write the failing tests**

`packages/domain/test/checkout.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CartLineAvailabilities, CheckoutConflictReasons, CurrencyCodes } from '@app/contracts';
import {
  byLockOrder,
  cartLineAvailability,
  evaluateCheckoutLines,
  groupBySeller,
  sameLines,
  singleCurrency,
  sumLineTotals,
} from '../src/checkout';
import type { LockedLineState } from '../src/checkout';

const state = (lines: LockedLineState[]) => new Map(lines.map((line) => [line.productId, line]));
const open = (productId: string, available: number, currentUnitPriceMinor: number) => ({
  productId,
  purchasable: true,
  available,
  currentUnitPriceMinor,
});

describe('cartLineAvailability (SRS-FR-CART-005, -007)', () => {
  it('is OK when stock covers the quantity', () => {
    expect(cartLineAvailability(2, 2, true)).toBe(CartLineAvailabilities.OK);
  });
  it('is SHORT when stock is below the quantity but above zero', () => {
    expect(cartLineAvailability(2, 1, true)).toBe(CartLineAvailabilities.SHORT);
  });
  it('is SOLD_OUT at zero', () => {
    expect(cartLineAvailability(1, 0, true)).toBe(CartLineAvailabilities.SOLD_OUT);
  });
  it('is SOLD_OUT for a product that stopped being purchasable, whatever its stock', () => {
    expect(cartLineAvailability(1, 50, false)).toBe(CartLineAvailabilities.SOLD_OUT);
  });
});

describe('evaluateCheckoutLines (SRS-FR-CHK-003)', () => {
  it('passes lines that are purchasable, covered and still at the confirmed price', () => {
    const lines = [{ productId: 'a', quantity: 2, unitPriceMinor: 500 }];
    expect(evaluateCheckoutLines(lines, state([open('a', 2, 500)]))).toEqual([]);
  });

  it('reports every failing line, not only the first', () => {
    const lines = [
      { productId: 'a', quantity: 1, unitPriceMinor: 500 },
      { productId: 'b', quantity: 3, unitPriceMinor: 700 },
      { productId: 'c', quantity: 1, unitPriceMinor: 900 },
    ];
    const conflicts = evaluateCheckoutLines(
      lines,
      state([open('a', 0, 500), open('b', 2, 700), open('c', 5, 950)]),
    );

    expect(conflicts).toEqual([
      { productId: 'a', reason: CheckoutConflictReasons.SOLD_OUT, available: 0, currentUnitPriceMinor: 500 },
      { productId: 'b', reason: CheckoutConflictReasons.SHORT, available: 2, currentUnitPriceMinor: 700 },
      { productId: 'c', reason: CheckoutConflictReasons.PRICE_CHANGED, available: 5, currentUnitPriceMinor: 950 },
    ]);
  });

  it('reports one reason per line, SHORT before PRICE_CHANGED (D85)', () => {
    const conflicts = evaluateCheckoutLines(
      [{ productId: 'a', quantity: 3, unitPriceMinor: 500 }],
      state([open('a', 1, 600)]),
    );
    expect(conflicts).toEqual([
      { productId: 'a', reason: CheckoutConflictReasons.SHORT, available: 1, currentUnitPriceMinor: 600 },
    ]);
  });

  it('masks a product that is no longer public (D86)', () => {
    const conflicts = evaluateCheckoutLines(
      [{ productId: 'a', quantity: 1, unitPriceMinor: 500 }],
      state([{ productId: 'a', purchasable: false, available: 9, currentUnitPriceMinor: 400 }]),
    );
    expect(conflicts).toEqual([
      { productId: 'a', reason: CheckoutConflictReasons.SOLD_OUT, available: 0, currentUnitPriceMinor: null },
    ]);
  });

  it('treats a product it has no state for as sold out, never as purchasable', () => {
    const conflicts = evaluateCheckoutLines(
      [{ productId: 'ghost', quantity: 1, unitPriceMinor: 500 }],
      state([]),
    );
    expect(conflicts[0]).toMatchObject({ productId: 'ghost', reason: CheckoutConflictReasons.SOLD_OUT });
  });
});

describe('singleCurrency (RULE-CHK-001, D71)', () => {
  it('names the one currency every line shares', () => {
    expect(singleCurrency([CurrencyCodes.EGP, CurrencyCodes.EGP])).toBe(CurrencyCodes.EGP);
  });
  it('is null for a mixed set', () => {
    expect(singleCurrency([CurrencyCodes.EGP, CurrencyCodes.USD])).toBeNull();
  });
  it('is null for nothing at all', () => {
    expect(singleCurrency([])).toBeNull();
  });
});

describe('sameLines (SRS-FR-CHK-006)', () => {
  it('ignores order', () => {
    expect(
      sameLines(
        [{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 2 }],
        [{ productId: 'b', quantity: 2 }, { productId: 'a', quantity: 1 }],
      ),
    ).toBe(true);
  });
  it('refuses a different quantity, a missing line and an extra line', () => {
    const cart = [{ productId: 'a', quantity: 1 }];
    expect(sameLines(cart, [{ productId: 'a', quantity: 2 }])).toBe(false);
    expect(sameLines(cart, [])).toBe(false);
    expect(sameLines(cart, [...cart, { productId: 'b', quantity: 1 }])).toBe(false);
  });
});

describe('groupBySeller (SRS-FR-CART-006, D56)', () => {
  it('keeps first-seen seller order and every line in exactly one group', () => {
    const groups = groupBySeller([
      { sellerId: 's2', productId: 'x' },
      { sellerId: 's1', productId: 'y' },
      { sellerId: 's2', productId: 'z' },
    ]);
    expect(groups.map((group) => [group.sellerId, group.lines.map((line) => line.productId)])).toEqual([
      ['s2', ['x', 'z']],
      ['s1', ['y']],
    ]);
  });
});

describe('sumLineTotals', () => {
  it('sums quantity × unit price in integers', () => {
    expect(sumLineTotals([{ quantity: 2, unitPriceMinor: 24_900 }, { quantity: 1, unitPriceMinor: 18_900 }])).toBe(68_700);
  });
});

describe('byLockOrder (RULE-CHK-002)', () => {
  it('orders ids bytewise, the order Postgres uses under COLLATE "C"', () => {
    // Every inventory lock in the API and the worker is taken in this order, so two
    // transactions that need the same rows can never each hold one the other wants.
    expect(['b', 'A', 'a', '1'].sort(byLockOrder)).toEqual(['1', 'A', 'a', 'b']);
  });
});
```

`packages/domain/test/checkout.property.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CART_LINE_MAX_QUANTITY, CheckoutConflictReasons } from '@app/contracts';
import { evaluateCheckoutLines, groupBySeller, sumLineTotals } from '../src/checkout';

const line = fc.record({
  productId: fc.uuid(),
  quantity: fc.integer({ min: 1, max: CART_LINE_MAX_QUANTITY }),
  unitPriceMinor: fc.integer({ min: 1, max: 1_000_000 }),
  purchasable: fc.boolean(),
  available: fc.integer({ min: 0, max: 20 }),
  currentUnitPriceMinor: fc.integer({ min: 1, max: 1_000_000 }),
});

describe('evaluateCheckoutLines (property)', () => {
  it('is empty exactly when every line is purchasable, covered and unchanged in price', () => {
    fc.assert(
      fc.property(fc.uniqueArray(line, { selector: (l) => l.productId, minLength: 1, maxLength: 10 }), (lines) => {
        const state = new Map(lines.map((l) => [l.productId, l]));
        const conflicts = evaluateCheckoutLines(lines, state);
        const healthy = lines.every(
          (l) => l.purchasable && l.available >= l.quantity && l.available > 0 && l.currentUnitPriceMinor === l.unitPriceMinor,
        );

        expect(conflicts.length === 0).toBe(healthy);
        // At most one conflict per line, each naming a line that was asked for.
        expect(new Set(conflicts.map((c) => c.productId)).size).toBe(conflicts.length);
        for (const conflict of conflicts) {
          expect(lines.some((l) => l.productId === conflict.productId)).toBe(true);
          expect(Object.values(CheckoutConflictReasons)).toContain(conflict.reason);
        }
      }),
    );
  });
});

describe('groupBySeller + sumLineTotals (property)', () => {
  it('the checkout total is the sum of its seller orders (one order per seller)', () => {
    const pricedLine = fc.record({
      sellerId: fc.constantFrom('s1', 's2', 's3'),
      quantity: fc.integer({ min: 1, max: 10 }),
      unitPriceMinor: fc.integer({ min: 1, max: 1_000_000 }),
    });
    fc.assert(
      fc.property(fc.array(pricedLine, { minLength: 1, maxLength: 50 }), (lines) => {
        const groups = groupBySeller(lines);
        expect(new Set(groups.map((g) => g.sellerId)).size).toBe(groups.length);
        expect(groups.reduce((n, g) => n + g.lines.length, 0)).toBe(lines.length);
        expect(groups.reduce((sum, g) => sum + sumLineTotals(g.lines), 0)).toBe(sumLineTotals(lines));
      }),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @app/domain test -- checkout`
Expected: FAIL — `Failed to resolve import "../src/checkout"`.

- [ ] **Step 3: Implement**

Append to `packages/contracts/src/constants.ts`:

```ts
/** A cart line holds 1 to 10 units (D72, RULE-CART-001). */
export const CART_LINE_MIN_QUANTITY = 1;
export const CART_LINE_MAX_QUANTITY = 10;

/** The most lines one checkout may carry (SRS §7). */
export const CHECKOUT_MAX_LINES = 50;

/** Public catalog page size (SRS-FR-CAT-001). */
export const STOREFRONT_PAGE_SIZE = 24;

/** Buyer order history page size (D89 — the SRS does not state one). */
export const BUYER_ORDERS_PAGE_SIZE = 20;

/** A cart line's live availability (SRS-FR-CART-005). */
export const CartLineAvailabilities = { OK: 'OK', SHORT: 'SHORT', SOLD_OUT: 'SOLD_OUT' } as const;
export type CartLineAvailability =
  (typeof CartLineAvailabilities)[keyof typeof CartLineAvailabilities];

/** Why a checkout line was refused (SRS-FR-CHK-003). Precedence is D85. */
export const CheckoutConflictReasons = {
  SOLD_OUT: 'SOLD_OUT',
  SHORT: 'SHORT',
  PRICE_CHANGED: 'PRICE_CHANGED',
} as const;
export type CheckoutConflictReason =
  (typeof CheckoutConflictReasons)[keyof typeof CheckoutConflictReasons];

/** A refusal about the request as a whole rather than one line (SRS-FR-CHK-006). */
export const CheckoutRefusals = { CART_CHANGED: 'CART_CHANGED' } as const;
export type CheckoutRefusal = (typeof CheckoutRefusals)[keyof typeof CheckoutRefusals];
```

`packages/domain/src/checkout.interface.ts`:

```ts
import type { CheckoutConflictReason } from '@app/contracts';

export interface LineQuantity {
  productId: string;
  quantity: number;
}

/** A line as the buyer confirmed it on the review step (D77). */
export interface ConfirmedLine extends LineQuantity {
  unitPriceMinor: number;
}

/** What the checkout transaction read for one product after locking its inventory row. */
export interface LockedLineState {
  productId: string;
  /** PUBLISHED, and its organization ACTIVE. */
  purchasable: boolean;
  available: number;
  currentUnitPriceMinor: number;
}

/** One refused line, exactly the wire shape of `details.lines[]`. */
export interface LineConflict {
  productId: string;
  reason: CheckoutConflictReason;
  available: number;
  /** null when the product is no longer public (D86). */
  currentUnitPriceMinor: number | null;
}

export interface SellerGroup<T> {
  sellerId: string;
  lines: T[];
}
```

`packages/domain/src/checkout.ts`:

```ts
import {
  CartLineAvailabilities,
  CheckoutConflictReasons,
  type CartLineAvailability,
} from '@app/contracts';
import type {
  ConfirmedLine,
  LineConflict,
  LineQuantity,
  LockedLineState,
  SellerGroup,
} from './checkout.interface';

export * from './checkout.interface';

export function cartLineAvailability(
  quantity: number,
  available: number,
  purchasable: boolean,
): CartLineAvailability {
  if (!purchasable || available === 0) return CartLineAvailabilities.SOLD_OUT;
  if (available < quantity) return CartLineAvailabilities.SHORT;
  return CartLineAvailabilities.OK;
}

/**
 * The all-or-nothing decision (INV-11), as a pure function of what the
 * transaction read under lock. It returns every failing line (SRS-FR-CHK-003),
 * one reason each in D85's order, and masks non-public products (D86).
 */
export function evaluateCheckoutLines(
  confirmed: readonly ConfirmedLine[],
  state: ReadonlyMap<string, LockedLineState>,
): LineConflict[] {
  const conflicts: LineConflict[] = [];

  for (const line of confirmed) {
    const current = state.get(line.productId);
    if (current === undefined || !current.purchasable) {
      conflicts.push({
        productId: line.productId,
        reason: CheckoutConflictReasons.SOLD_OUT,
        available: 0,
        currentUnitPriceMinor: null,
      });
      continue;
    }

    const availability = cartLineAvailability(line.quantity, current.available, true);
    const reason =
      availability === CartLineAvailabilities.SOLD_OUT
        ? CheckoutConflictReasons.SOLD_OUT
        : availability === CartLineAvailabilities.SHORT
          ? CheckoutConflictReasons.SHORT
          : current.currentUnitPriceMinor !== line.unitPriceMinor
            ? CheckoutConflictReasons.PRICE_CHANGED
            : null;

    if (reason !== null) {
      conflicts.push({
        productId: line.productId,
        reason,
        available: current.available,
        currentUnitPriceMinor: current.currentUnitPriceMinor,
      });
    }
  }

  return conflicts;
}

/** The one currency every entry shares, or null when mixed or empty (D71). */
export function singleCurrency<C extends string>(currencies: readonly C[]): C | null {
  const [first, ...rest] = currencies;
  if (first === undefined) return null;
  return rest.every((currency) => currency === first) ? first : null;
}

/** Same products with the same quantities, in any order (SRS-FR-CHK-006). */
export function sameLines(cart: readonly LineQuantity[], requested: readonly LineQuantity[]): boolean {
  if (cart.length !== requested.length) return false;
  const wanted = new Map(cart.map((line) => [line.productId, line.quantity]));
  return requested.every((line) => wanted.get(line.productId) === line.quantity);
}

/** One group per seller, in first-seen order — one order per group (D56). */
export function groupBySeller<T extends { sellerId: string }>(lines: readonly T[]): SellerGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const line of lines) {
    const group = groups.get(line.sellerId);
    if (group === undefined) groups.set(line.sellerId, [line]);
    else group.push(line);
  }
  return [...groups].map(([sellerId, grouped]) => ({ sellerId, lines: grouped }));
}

export function sumLineTotals(lines: readonly { quantity: number; unitPriceMinor: number }[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
}

/**
 * The inventory lock order (RULE-CHK-002): bytewise, matching the SQL
 * `ORDER BY "productId" COLLATE "C"` both processes lock with. Not
 * `localeCompare`, whose order depends on the machine's locale.
 */
export function byLockOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
```

Append to `packages/domain/src/index.ts`:

```ts
export * from './checkout';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @app/domain test`
Expected: PASS — +17 example cases in `checkout.spec.ts`, +2 properties.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/constants.ts packages/domain/src packages/domain/test
git commit -m "feat(domain): the checkout line rules — availability, all-or-nothing decision, grouping, lock order"
```

---

### Task 4: Contracts — pagination and the strict `PublicProduct`

**Files:**
- Create: `packages/contracts/src/pagination.ts`, `packages/contracts/src/storefront.ts`,
  `packages/contracts/test/storefront.spec.ts`, `packages/contracts/test/storefront.property.spec.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: `CurrencyCodes`, `wireValues`.
- Produces: `PageQuerySchema` / `PageQuery` (`{ cursor?: string }`); `pageOf(item)` → a strict
  `{ items: T[]; nextCursor: string | null }` schema; `SellerSchema` / `Seller` (`{ name, slug }`,
  strict); `PublicProductSchema` / `PublicProduct` (`id`, `name`, `priceMinor`, `currency`,
  `available`, `seller` — strict, SRS-FR-CAT-003); `PublicProductPageSchema` / `PublicProductPage`.

- [ ] **Step 1: Write the failing tests**

`packages/contracts/test/storefront.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CurrencyCodes } from '../src/constants';
import { PageQuerySchema } from '../src/pagination';
import { PublicProductPageSchema, PublicProductSchema } from '../src/storefront';

const product = {
  id: 'p1',
  name: 'Nile Cotton Shirt',
  priceMinor: 24_900,
  currency: CurrencyCodes.EGP,
  available: 1,
  seller: { name: 'Nile Traders', slug: 'nile-traders' },
};

describe('PublicProductSchema (SRS-FR-CAT-003, SRS-NFR-SEC-001)', () => {
  it('accepts exactly the public fields', () => {
    expect(PublicProductSchema.parse(product)).toEqual(product);
  });

  it.each(['status', 'organizationId', 'createdAt', 'reserved', 'version'])(
    'refuses a private field: %s',
    (key) => {
      expect(PublicProductSchema.safeParse({ ...product, [key]: 'x' }).success).toBe(false);
    },
  );

  it('refuses a private field nested in the seller', () => {
    const leaky = { ...product, seller: { ...product.seller, id: 'org_1' } };
    expect(PublicProductSchema.safeParse(leaky).success).toBe(false);
  });

  it('refuses a fractional price and negative stock', () => {
    expect(PublicProductSchema.safeParse({ ...product, priceMinor: 249.5 }).success).toBe(false);
    expect(PublicProductSchema.safeParse({ ...product, available: -1 }).success).toBe(false);
  });
});

describe('PublicProductPageSchema', () => {
  it('carries items and a nullable cursor, and nothing else', () => {
    expect(PublicProductPageSchema.parse({ items: [product], nextCursor: null })).toEqual({
      items: [product],
      nextCursor: null,
    });
    expect(PublicProductPageSchema.safeParse({ items: [], nextCursor: null, total: 9 }).success).toBe(false);
  });
});

describe('PageQuerySchema', () => {
  it('makes the cursor optional and refuses an empty one', () => {
    expect(PageQuerySchema.parse({})).toEqual({});
    expect(PageQuerySchema.safeParse({ cursor: '' }).success).toBe(false);
  });
});
```

`packages/contracts/test/storefront.property.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CurrencyCodes } from '../src/constants';
import { PublicProductSchema } from '../src/storefront';

const PUBLIC_KEYS = ['id', 'name', 'priceMinor', 'currency', 'available', 'seller'];

describe('PublicProductSchema is the allowlist (property)', () => {
  it('refuses any key outside the public set, whatever it is called', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((key) => !PUBLIC_KEYS.includes(key) && key !== '__proto__'),
        fc.jsonValue(),
        (key, value) => {
          const candidate = {
            id: 'p',
            name: 'n',
            priceMinor: 1,
            currency: CurrencyCodes.USD,
            available: 0,
            seller: { name: 's', slug: 's' },
            [key]: value,
          };
          expect(PublicProductSchema.safeParse(candidate).success).toBe(false);
        },
      ),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @app/contracts test -- storefront`
Expected: FAIL — `Failed to resolve import "../src/pagination"`.

- [ ] **Step 3: Implement**

`packages/contracts/src/pagination.ts`:

```ts
import { z } from 'zod';

/**
 * A cursor page request. The cursor is the id of the last item already seen
 * (D89); it is opaque to clients, who only ever echo `nextCursor` back.
 * Not strict: a query string routinely carries keys a page does not own.
 */
export const PageQuerySchema = z.object({ cursor: z.string().min(1).optional() });
export type PageQuery = z.infer<typeof PageQuerySchema>;

/** A page of `item`. Strict, so a page cannot grow a field nobody contracted. */
export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() }).strict();
}
```

`packages/contracts/src/storefront.ts`:

```ts
import { z } from 'zod';
import { CurrencyCodes, wireValues } from './constants';
import { pageOf } from './pagination';

/** A seller as a buyer sees it: the organization's public name and handle. */
export const SellerSchema = z.object({ name: z.string(), slug: z.string() }).strict();
export type Seller = z.infer<typeof SellerSchema>;

/**
 * The public product (SRS-FR-CAT-003). `.strict()` makes the schema the
 * allowlist (RULE-CAT-001, ADR 010 amendment): the API parses every public read
 * through it, so a private field fails the parse instead of leaving the server.
 * Slug and status are deliberately absent — D76 gives Product no slug, and a
 * public read only ever returns PUBLISHED, so status would carry no information.
 */
export const PublicProductSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    priceMinor: z.int(),
    currency: z.enum(wireValues(CurrencyCodes)),
    available: z.int().min(0),
    seller: SellerSchema,
  })
  .strict();
export type PublicProduct = z.infer<typeof PublicProductSchema>;

export const PublicProductPageSchema = pageOf(PublicProductSchema);
export type PublicProductPage = z.infer<typeof PublicProductPageSchema>;
```

Append to `packages/contracts/src/index.ts`:

```ts
export * from './pagination';
export * from './storefront';
```

Do **not** add `.meta({ id })` to these schemas: they back `createZodDto` classes in Task 10, and
week 1's finding 1 is that the two together make `cleanupOpenApiDoc` throw.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @app/contracts test`
Expected: PASS — +10 example cases, +1 property.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/pagination.ts packages/contracts/src/storefront.ts packages/contracts/src/index.ts packages/contracts/test/storefront.spec.ts packages/contracts/test/storefront.property.spec.ts
git commit -m "feat(contracts): strict PublicProduct and cursor pages"
```

---

### Task 5: Contracts — cart, checkout, conflict details, buyer orders, set-inventory

**Files:**
- Create: `packages/contracts/src/cart.ts`, `packages/contracts/src/checkout.ts`,
  `packages/contracts/src/buyer-order.ts`, `packages/contracts/test/cart.spec.ts`,
  `packages/contracts/test/checkout.spec.ts`, `packages/contracts/test/buyer-order.spec.ts`
- Modify: `packages/contracts/src/product.ts`, `packages/contracts/test/product.spec.ts`,
  `packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: Tasks 2–4 constants and `SellerSchema`, `pageOf`.
- Produces:
  - `SetCartLineRequestSchema` (`{ quantity: 1–10 }`), `CartLineSchema` (`productId`, `name`,
    `quantity`, `currency`, `addedUnitPriceMinor` (D82), `currentUnitPriceMinor: number | null`,
    `available`, `availability`), `CartSellerGroupSchema`, `CartSchema` (`{ sellers: [...] }`) and types
    `Cart`, `CartLine`, `SetCartLineRequest`.
  - `CheckoutLineRequestSchema`, `CreateCheckoutRequestSchema` (1–50 lines, unique `productId`),
    `OrderItemSchema` (`productId`, `name`, `quantity`, `unitPriceMinor`), `CheckoutOrderSchema`,
    `CheckoutSchema`, `CheckoutLineConflictSchema`, `CheckoutLineConflictDetailsSchema`
    (`{ lines: [...] }`), `CheckoutCartChangedDetailsSchema` (`{ reason: 'CART_CHANGED' }`),
    `CheckoutConflictDetailsSchema` (union) and types `CreateCheckoutRequest`, `Checkout`,
    `CheckoutOrder`, `OrderItem`, `CheckoutLineConflict`, `CheckoutConflictDetails`.
  - `BuyerOrderSummarySchema`, `BuyerOrderPageSchema`, `BuyerOrderSchema` and types.
  - `SetInventoryRequestSchema` (`{ available: int ≥ 0 }`), `SetInventoryRequest` (D81).

- [ ] **Step 1: Write the failing tests**

`packages/contracts/test/cart.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CART_LINE_MAX_QUANTITY, CartLineAvailabilities, CurrencyCodes } from '../src/constants';
import { CartSchema, SetCartLineRequestSchema } from '../src/cart';

describe('SetCartLineRequestSchema (D72, AC-US-CART-001-2)', () => {
  it('accepts 1 to 10', () => {
    expect(SetCartLineRequestSchema.parse({ quantity: 1 })).toEqual({ quantity: 1 });
    expect(SetCartLineRequestSchema.parse({ quantity: CART_LINE_MAX_QUANTITY })).toEqual({ quantity: 10 });
  });
  it.each([0, 11, 2.5, -1])('refuses %s', (quantity) => {
    expect(SetCartLineRequestSchema.safeParse({ quantity }).success).toBe(false);
  });
});

describe('CartSchema', () => {
  const line = {
    productId: 'p1',
    name: 'Shirt',
    quantity: 2,
    currency: CurrencyCodes.EGP,
    addedUnitPriceMinor: 24_900,
    currentUnitPriceMinor: 24_900,
    available: 1,
    availability: CartLineAvailabilities.SHORT,
  };

  it('groups lines under a seller and carries live availability', () => {
    const cart = { sellers: [{ seller: { name: 'Nile', slug: 'nile' }, lines: [line] }] };
    expect(CartSchema.parse(cart)).toEqual(cart);
  });

  it('lets a non-public line hide its current price (D86)', () => {
    const masked = { ...line, currentUnitPriceMinor: null, available: 0, availability: CartLineAvailabilities.SOLD_OUT };
    expect(CartSchema.safeParse({ sellers: [{ seller: { name: 'N', slug: 'n' }, lines: [masked] }] }).success).toBe(true);
  });

  it('never carries a cart id: the route is the buyer, not an identifier (finding 4)', () => {
    expect(CartSchema.safeParse({ id: 'c1', sellers: [] }).success).toBe(false);
  });
});
```

`packages/contracts/test/checkout.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CHECKOUT_MAX_LINES,
  CheckoutConflictReasons,
  CheckoutRefusals,
  CheckoutStatuses,
  CurrencyCodes,
  OrderStatuses,
} from '../src/constants';
import {
  CheckoutConflictDetailsSchema,
  CheckoutLineConflictDetailsSchema,
  CheckoutSchema,
  CreateCheckoutRequestSchema,
} from '../src/checkout';

const line = (productId: string) => ({ productId, quantity: 1, unitPriceMinor: 100 });

describe('CreateCheckoutRequestSchema (SRS-FR-CHK-001, §7)', () => {
  it('accepts the confirmed lines', () => {
    expect(CreateCheckoutRequestSchema.parse({ lines: [line('a')] })).toEqual({ lines: [line('a')] });
  });
  it('refuses no lines and more than 50', () => {
    expect(CreateCheckoutRequestSchema.safeParse({ lines: [] }).success).toBe(false);
    const many = Array.from({ length: CHECKOUT_MAX_LINES + 1 }, (_, i) => line(`p${i}`));
    expect(CreateCheckoutRequestSchema.safeParse({ lines: many }).success).toBe(false);
  });
  it('refuses the same product twice', () => {
    expect(CreateCheckoutRequestSchema.safeParse({ lines: [line('a'), line('a')] }).success).toBe(false);
  });
  it.each([
    { quantity: 11 },
    { quantity: 0 },
    { unitPriceMinor: 0 },
    { unitPriceMinor: 99.5 },
  ])('refuses a line with %o', (override) => {
    expect(CreateCheckoutRequestSchema.safeParse({ lines: [{ ...line('a'), ...override }] }).success).toBe(false);
  });
});

describe('CheckoutSchema', () => {
  it('is one checkout of one order per seller, with snapshotted items', () => {
    const checkout = {
      id: 'k1',
      status: CheckoutStatuses.PENDING_PAYMENT,
      totalMinor: 43_800,
      currency: CurrencyCodes.EGP,
      placedAt: '2026-10-16T10:00:00.000Z',
      orders: [
        {
          id: 'o1',
          status: OrderStatuses.PENDING_PAYMENT,
          totalMinor: 24_900,
          currency: CurrencyCodes.EGP,
          seller: { name: 'Nile', slug: 'nile' },
          items: [{ productId: 'p1', name: 'Shirt', quantity: 1, unitPriceMinor: 24_900 }],
        },
      ],
    };
    expect(CheckoutSchema.parse(checkout)).toEqual(checkout);
  });
});

describe('the 409 details (SRS-FR-CHK-003, -006, §8)', () => {
  it('lists failing lines with reason, stock and current price', () => {
    const details = {
      lines: [{ productId: 'p1', reason: CheckoutConflictReasons.SOLD_OUT, available: 0, currentUnitPriceMinor: 100 }],
    };
    expect(CheckoutLineConflictDetailsSchema.parse(details)).toEqual(details);
    expect(CheckoutConflictDetailsSchema.parse(details)).toEqual(details);
  });
  it('names a changed cart', () => {
    expect(CheckoutConflictDetailsSchema.parse({ reason: CheckoutRefusals.CART_CHANGED })).toEqual({
      reason: CheckoutRefusals.CART_CHANGED,
    });
  });
  it('refuses an empty line list and an unknown reason', () => {
    expect(CheckoutLineConflictDetailsSchema.safeParse({ lines: [] }).success).toBe(false);
    expect(CheckoutConflictDetailsSchema.safeParse({ reason: 'NOPE' }).success).toBe(false);
  });
});
```

`packages/contracts/test/buyer-order.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CurrencyCodes, OrderStatuses } from '../src/constants';
import { BuyerOrderPageSchema, BuyerOrderSchema } from '../src/buyer-order';

const summary = {
  id: 'o1',
  checkoutId: 'k1',
  status: OrderStatuses.PENDING_PAYMENT,
  totalMinor: 24_900,
  currency: CurrencyCodes.EGP,
  createdAt: '2026-10-16T10:00:00.000Z',
  seller: { name: 'Nile', slug: 'nile' },
  itemCount: 1,
};

describe('buyer orders (SRS-FR-BORD-001, -002)', () => {
  it('lists summaries in a page', () => {
    expect(BuyerOrderPageSchema.parse({ items: [summary], nextCursor: 'o1' }).items).toHaveLength(1);
  });

  it('details items, unit prices, total, status, checkout and seller', () => {
    const { itemCount: _omitted, ...rest } = summary;
    const detail = { ...rest, items: [{ productId: 'p1', name: 'Shirt', quantity: 1, unitPriceMinor: 24_900 }] };
    expect(BuyerOrderSchema.parse(detail)).toEqual(detail);
  });

  it('never carries the buyer or the seller organization id', () => {
    expect(BuyerOrderPageSchema.safeParse({ items: [{ ...summary, buyerId: 'u1' }], nextCursor: null }).success).toBe(false);
    expect(BuyerOrderPageSchema.safeParse({ items: [{ ...summary, organizationId: 'org' }], nextCursor: null }).success).toBe(false);
  });
});
```

Append to `packages/contracts/test/product.spec.ts` (add `SetInventoryRequestSchema` to its import
from `../src/product`):

```ts
describe('SetInventoryRequestSchema (D81)', () => {
  it('accepts a whole, non-negative count', () => {
    expect(SetInventoryRequestSchema.parse({ available: 0 })).toEqual({ available: 0 });
    expect(SetInventoryRequestSchema.parse({ available: 7 })).toEqual({ available: 7 });
  });
  it.each([-1, 1.5])('refuses %s', (available) => {
    expect(SetInventoryRequestSchema.safeParse({ available }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @app/contracts test -- cart checkout buyer-order product`
Expected: FAIL — `Failed to resolve import "../src/cart"`.

- [ ] **Step 3: Implement**

`packages/contracts/src/cart.ts`:

```ts
import { z } from 'zod';
import {
  CART_LINE_MAX_QUANTITY,
  CART_LINE_MIN_QUANTITY,
  CartLineAvailabilities,
  CurrencyCodes,
  wireValues,
} from './constants';
import { SellerSchema } from './storefront';

const quantity = z.int().min(CART_LINE_MIN_QUANTITY).max(CART_LINE_MAX_QUANTITY);

/** PUT /cart/items/:productId. The quantity is absolute, so a repeat changes nothing. */
export const SetCartLineRequestSchema = z.object({ quantity }).strict();
export type SetCartLineRequest = z.infer<typeof SetCartLineRequestSchema>;

export const CartLineSchema = z
  .object({
    productId: z.string(),
    name: z.string(),
    quantity,
    currency: z.enum(wireValues(CurrencyCodes)),
    /** The price when the line was first added (D82) — what the review step compares against. */
    addedUnitPriceMinor: z.int().min(1),
    /** null when the product is no longer public (D86). */
    currentUnitPriceMinor: z.int().min(1).nullable(),
    available: z.int().min(0),
    availability: z.enum(wireValues(CartLineAvailabilities)),
  })
  .strict();
export type CartLine = z.infer<typeof CartLineSchema>;

export const CartSellerGroupSchema = z
  .object({ seller: SellerSchema, lines: z.array(CartLineSchema).min(1) })
  .strict();
export type CartSellerGroup = z.infer<typeof CartSellerGroupSchema>;

/** The buyer's cart, grouped by seller (SRS-FR-CART-006). It has no id on the wire. */
export const CartSchema = z.object({ sellers: z.array(CartSellerGroupSchema) }).strict();
export type Cart = z.infer<typeof CartSchema>;
```

`packages/contracts/src/checkout.ts`:

```ts
import { z } from 'zod';
import {
  CART_LINE_MAX_QUANTITY,
  CART_LINE_MIN_QUANTITY,
  CHECKOUT_MAX_LINES,
  CheckoutConflictReasons,
  CheckoutRefusals,
  CheckoutStatuses,
  CurrencyCodes,
  OrderStatuses,
  wireValues,
} from './constants';
import { SellerSchema } from './storefront';

const currency = z.enum(wireValues(CurrencyCodes));

/** One line the buyer confirmed on the review step (D77). */
export const CheckoutLineRequestSchema = z
  .object({
    productId: z.string().min(1),
    quantity: z.int().min(CART_LINE_MIN_QUANTITY).max(CART_LINE_MAX_QUANTITY),
    unitPriceMinor: z.int().min(1),
  })
  .strict();
export type CheckoutLineRequest = z.infer<typeof CheckoutLineRequestSchema>;

export const CreateCheckoutRequestSchema = z
  .object({
    lines: z
      .array(CheckoutLineRequestSchema)
      .min(1)
      .max(CHECKOUT_MAX_LINES)
      .refine((lines) => new Set(lines.map((line) => line.productId)).size === lines.length, {
        message: 'Each product may appear once',
      }),
  })
  .strict();
export type CreateCheckoutRequest = z.infer<typeof CreateCheckoutRequestSchema>;

/** An order line. `name` and `unitPriceMinor` are snapshots (PRD-FR-CHK-005, D90). */
export const OrderItemSchema = z
  .object({
    productId: z.string(),
    name: z.string(),
    quantity: z.int().min(1),
    unitPriceMinor: z.int().min(1),
  })
  .strict();
export type OrderItem = z.infer<typeof OrderItemSchema>;

export const CheckoutOrderSchema = z
  .object({
    id: z.string(),
    status: z.enum(wireValues(OrderStatuses)),
    totalMinor: z.int().min(1),
    currency,
    seller: SellerSchema,
    items: z.array(OrderItemSchema).min(1),
  })
  .strict();
export type CheckoutOrder = z.infer<typeof CheckoutOrderSchema>;

/** One "Place order": one buyer, one currency, one order per seller (D56). */
export const CheckoutSchema = z
  .object({
    id: z.string(),
    status: z.enum(wireValues(CheckoutStatuses)),
    totalMinor: z.int().min(1),
    currency,
    placedAt: z.iso.datetime(),
    orders: z.array(CheckoutOrderSchema).min(1),
  })
  .strict();
export type Checkout = z.infer<typeof CheckoutSchema>;

export const CheckoutLineConflictSchema = z
  .object({
    productId: z.string(),
    reason: z.enum(wireValues(CheckoutConflictReasons)),
    available: z.int().min(0),
    currentUnitPriceMinor: z.int().min(1).nullable(),
  })
  .strict();
export type CheckoutLineConflict = z.infer<typeof CheckoutLineConflictSchema>;

/** `error.details` of a 409 refusing lines. The web app branches on `lines[].reason`. */
export const CheckoutLineConflictDetailsSchema = z
  .object({ lines: z.array(CheckoutLineConflictSchema).min(1) })
  .strict();

/** `error.details` of a 409 refusing a request that no longer matches the cart. */
export const CheckoutCartChangedDetailsSchema = z
  .object({ reason: z.literal(CheckoutRefusals.CART_CHANGED) })
  .strict();

export const CheckoutConflictDetailsSchema = z.union([
  CheckoutLineConflictDetailsSchema,
  CheckoutCartChangedDetailsSchema,
]);
export type CheckoutConflictDetails = z.infer<typeof CheckoutConflictDetailsSchema>;
```

`packages/contracts/src/buyer-order.ts`:

```ts
import { z } from 'zod';
import { CurrencyCodes, OrderStatuses, wireValues } from './constants';
import { OrderItemSchema } from './checkout';
import { pageOf } from './pagination';
import { SellerSchema } from './storefront';

const orderFields = {
  id: z.string(),
  checkoutId: z.string(),
  status: z.enum(wireValues(OrderStatuses)),
  totalMinor: z.int().min(1),
  currency: z.enum(wireValues(CurrencyCodes)),
  createdAt: z.iso.datetime(),
  seller: SellerSchema,
};

export const BuyerOrderSummarySchema = z
  .object({ ...orderFields, itemCount: z.int().min(1) })
  .strict();
export type BuyerOrderSummary = z.infer<typeof BuyerOrderSummarySchema>;

export const BuyerOrderPageSchema = pageOf(BuyerOrderSummarySchema);
export type BuyerOrderPage = z.infer<typeof BuyerOrderPageSchema>;

export const BuyerOrderSchema = z
  .object({ ...orderFields, items: z.array(OrderItemSchema).min(1) })
  .strict();
export type BuyerOrder = z.infer<typeof BuyerOrderSchema>;
```

Append to `packages/contracts/src/product.ts`:

```ts
/**
 * PUT /products/:id/inventory (D81). An absolute count rather than a delta, so a
 * repeated request is harmless and a seller states what is on the shelf.
 */
export const SetInventoryRequestSchema = z.object({ available: z.int().min(0) }).strict();
export type SetInventoryRequest = z.infer<typeof SetInventoryRequestSchema>;
```

Append to `packages/contracts/src/index.ts`:

```ts
export * from './cart';
export * from './checkout';
export * from './buyer-order';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @app/contracts test && pnpm --filter @app/contracts typecheck`
Expected: PASS. If the `refine` makes `createZodDto` reject the schema later (Task 14 typecheck),
record it in the defect table and move the uniqueness rule into a `superRefine` on the outer object;
do not drop it.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src packages/contracts/test
git commit -m "feat(contracts): cart, checkout, 409 details, buyer orders and set-inventory schemas"
```

---
### Task 6: The five models, one additive migration, and their constraints

**Files:**
- Create: `packages/database/prisma/schema/Cart.prisma`, `CartItem.prisma`, `Checkout.prisma`,
  `Order.prisma`, `OrderItem.prisma`; `apps/api/test/support/marketplace.ts`;
  `apps/api/test/integration/phase-4-constraints.integration-spec.ts`
- Modify: `packages/database/prisma/schema/User.prisma`, `Organization.prisma`, `Product.prisma`
  (back-relations only); `apps/api/test/integration/enum-drift.integration-spec.ts`
- Generated, then hand-edited:
  `packages/database/prisma/migrations/<timestamp>_add_cart_and_checkout/migration.sql`

**Interfaces:**
- Consumes: Task 2's `CheckoutStatuses`, `OrderStatuses`.
- Produces: Prisma delegates `cart`, `cartItem`, `checkout`, `order`, `orderItem`; enums
  `CheckoutStatus`, `OrderStatus`; tables `carts`, `cart_items`, `checkouts`, `orders`, `order_items`
  with camelCase quoted columns (the existing convention: `"productId"`, `"placedAt"`); the test
  fixtures `createSeller`, `createProduct`, `createBuyer`, `mintBuyers`, `cartWith`, `availableOf`,
  `bearer` in `apps/api/test/support/marketplace.ts`.

**Additive by construction.** Every statement in the migration creates a type, a table, an index, a
foreign key *on a new table*, or a CHECK on a new table. Nothing alters a phase-2/3 table. Because
`Order` is new — not an existing table gaining `checkoutId`, as SRS §6's "+ checkoutId" and release
plan §7's "nullable then backfilled" assume (finding 25) — `checkoutId` is `NOT NULL` from the first
migration.

- [ ] **Step 1: Write the failing integration test**

`apps/api/test/support/marketplace.ts` — Prisma-level fixtures shared by the integration,
concurrency and e2e suites. They write *around* the application on purpose, for the reason
`support/db.ts` records:

```ts
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  CurrencyCodes,
  ProductStatuses,
  type CurrencyCode,
  type ProductStatus,
} from '@app/contracts';
import { TokenService } from '../../src/auth/token.service';
import { testPrisma } from './db';

const suffix = (): string => randomUUID().slice(0, 8);

/** Placeholder hash: these users never log in, they are handed a signed token. */
const UNUSABLE_PASSWORD_HASH = 'x';

export interface SellerFixture {
  organizationId: string;
  name: string;
  slug: string;
}

export interface ProductFixture {
  id: string;
  organizationId: string;
  name: string;
  priceMinor: number;
  currency: CurrencyCode;
}

export async function createSeller(prefix: string): Promise<SellerFixture> {
  const organization = await testPrisma.organization.create({
    data: { name: `${prefix} seller`, slug: `${prefix}-${suffix()}` },
    select: { id: true, name: true, slug: true },
  });
  return { organizationId: organization.id, name: organization.name, slug: organization.slug };
}

export async function createProduct(
  organizationId: string,
  options: Partial<{
    name: string;
    priceMinor: number;
    currency: CurrencyCode;
    status: ProductStatus;
    available: number;
  }> = {},
): Promise<ProductFixture> {
  const {
    name = `Item ${suffix()}`,
    priceMinor = 1000,
    currency = CurrencyCodes.EGP,
    status = ProductStatuses.PUBLISHED,
    available = 5,
  } = options;
  return testPrisma.product.create({
    data: { organizationId, name, priceMinor, currency, status, inventory: { create: { available } } },
    select: { id: true, organizationId: true, name: true, priceMinor: true, currency: true },
  });
}

export async function createBuyer(): Promise<{ id: string }> {
  return testPrisma.user.create({
    data: { email: `buyer-${randomUUID()}@marketcore.test`, passwordHash: UNUSABLE_PASSWORD_HASH },
    select: { id: true },
  });
}

/**
 * Many buyers, each with a valid access token, without touching /auth.
 *
 * The auth routes are throttled to AUTH_THROTTLE_LIMIT per minute (20), so a
 * hundred registrations through HTTP would be refused with 429 long before the
 * race starts (finding 14). The token is signed by the application's own
 * TokenService, so the guard chain the race goes through is the real one.
 */
export async function mintBuyers(
  app: INestApplication,
  count: number,
): Promise<{ id: string; token: string }[]> {
  const ids = Array.from({ length: count }, () => randomUUID());
  await testPrisma.user.createMany({
    data: ids.map((id) => ({
      id,
      email: `racer-${id}@marketcore.test`,
      passwordHash: UNUSABLE_PASSWORD_HASH,
    })),
  });
  const tokens = app.get(TokenService);
  return Promise.all(ids.map(async (id) => ({ id, token: await tokens.signAccessToken(id) })));
}

export async function cartWith(
  buyerId: string,
  lines: { productId: string; quantity: number; addedUnitPriceMinor: number }[],
): Promise<{ id: string }> {
  return testPrisma.cart.create({ data: { buyerId, items: { create: lines } }, select: { id: true } });
}

export async function availableOf(productId: string): Promise<number> {
  const row = await testPrisma.inventory.findUniqueOrThrow({
    where: { productId },
    select: { available: true },
  });
  return row.available;
}

export const bearer = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});
```

`apps/api/test/integration/phase-4-constraints.integration-spec.ts`:

```ts
import { afterAll, describe, expect, it } from '@jest/globals';
import { CART_LINE_MAX_QUANTITY, CheckoutStatuses, CurrencyCodes } from '@app/contracts';
import { testPrisma } from '../support/db';
import { createBuyer, createProduct, createSeller } from '../support/marketplace';

/** Each rule is proven by writing around the application, the week-2 pattern. */
afterAll(async () => {
  await testPrisma.$disconnect();
});

const CHECKS = [
  'cart_items_quantity_range',
  'cart_items_added_price_positive',
  'checkouts_total_positive',
  'orders_total_positive',
  'order_items_quantity_positive',
  'order_items_unit_price_positive',
];

async function checkoutFixture() {
  const seller = await createSeller('constraint');
  const product = await createProduct(seller.organizationId);
  const buyer = await createBuyer();
  const checkout = await testPrisma.checkout.create({
    data: { buyerId: buyer.id, totalMinor: 1000, currency: CurrencyCodes.EGP },
  });
  const order = {
    checkoutId: checkout.id,
    organizationId: seller.organizationId,
    buyerId: buyer.id,
    totalMinor: 1000,
    currency: CurrencyCodes.EGP,
  };
  return { product, checkout, order };
}

describe('phase-4 database constraints', () => {
  it.each(CHECKS)('%s is installed, not merely intended', async (name) => {
    const rows = await testPrisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE conname = ${name}
    `;
    expect(rows).toHaveLength(1);
  });

  it('refuses a cart line above 10 and below 1 (D72)', async () => {
    const seller = await createSeller('qty');
    const product = await createProduct(seller.organizationId);
    const buyer = await createBuyer();
    const cart = await testPrisma.cart.create({ data: { buyerId: buyer.id } });

    for (const quantity of [CART_LINE_MAX_QUANTITY + 1, 0]) {
      await expect(
        testPrisma.cartItem.create({
          data: { cartId: cart.id, productId: product.id, quantity, addedUnitPriceMinor: 1000 },
        }),
      ).rejects.toThrow(/cart_items_quantity_range/);
    }
  });

  it('keeps one cart per buyer (SRS-FR-CART-001)', async () => {
    const buyer = await createBuyer();
    await testPrisma.cart.create({ data: { buyerId: buyer.id } });
    await expect(testPrisma.cart.create({ data: { buyerId: buyer.id } })).rejects.toThrow();
  });

  it('keeps one line per product in a cart', async () => {
    const seller = await createSeller('line');
    const product = await createProduct(seller.organizationId);
    const buyer = await createBuyer();
    const cart = await testPrisma.cart.create({ data: { buyerId: buyer.id } });
    const line = { cartId: cart.id, productId: product.id, quantity: 1, addedUnitPriceMinor: 1000 };

    await testPrisma.cartItem.create({ data: line });
    await expect(testPrisma.cartItem.create({ data: line })).rejects.toThrow();
  });

  it('creates checkouts PENDING_PAYMENT by default', async () => {
    const { checkout } = await checkoutFixture();
    expect(checkout.status).toBe(CheckoutStatuses.PENDING_PAYMENT);
  });

  it('allows one order per seller per checkout (D56)', async () => {
    const { order } = await checkoutFixture();
    await testPrisma.order.create({ data: order });
    await expect(testPrisma.order.create({ data: order })).rejects.toThrow();
  });

  it('refuses an order item of zero units', async () => {
    const { product, order } = await checkoutFixture();
    const created = await testPrisma.order.create({ data: order });

    await expect(
      testPrisma.orderItem.create({
        data: {
          orderId: created.id,
          productId: product.id,
          productName: product.name,
          quantity: 0,
          unitPriceMinor: 1000,
        },
      }),
    ).rejects.toThrow(/order_items_quantity_positive/);
  });
});
```

Append inside the `describe` of `apps/api/test/integration/enum-drift.integration-spec.ts` (and add
`CheckoutStatuses, OrderStatuses` to its `@app/contracts` import):

```ts
  it('checkout statuses agree', () => {
    expect(values($Enums.CheckoutStatus)).toEqual(values(CheckoutStatuses));
  });

  it('order statuses agree', () => {
    expect(values($Enums.OrderStatus)).toEqual(values(OrderStatuses));
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter api test:integration`
Expected: FAIL — TypeScript: `Property 'cart' does not exist on type 'PrismaClient'`.

- [ ] **Step 3: Write the model files**

`packages/database/prisma/schema/Cart.prisma`:

```prisma
// One server-side cart per buyer (D55, SRS-FR-CART-001). It records intent only:
// nothing here reserves stock (D58).
model Cart {
  id        String   @id @default(uuid())
  buyerId   String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  buyer User       @relation(fields: [buyerId], references: [id], onDelete: Cascade)
  items CartItem[]

  @@map("carts")
}
```

`packages/database/prisma/schema/CartItem.prisma`:

```prisma
// quantity BETWEEN 1 AND 10 is a hand-written CHECK in the migration (D72).
// addedUnitPriceMinor is the price when the line was first added (D82), so the
// review step can show what changed since.
model CartItem {
  id                  String   @id @default(uuid())
  cartId              String
  productId           String
  quantity            Int
  addedUnitPriceMinor Int
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  cart    Cart    @relation(fields: [cartId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id], onDelete: Restrict)

  @@unique([cartId, productId])
  @@map("cart_items")
}
```

`packages/database/prisma/schema/Checkout.prisma`:

```prisma
enum CheckoutStatus {
  PENDING_PAYMENT
  CANCELLED
}

// One "Place order" (D56): one buyer, one currency, one order per seller, and —
// from phase 6 — one payment. (status, placedAt) serves the auto-cancel scan.
model Checkout {
  id         String         @id @default(uuid())
  buyerId    String
  status     CheckoutStatus @default(PENDING_PAYMENT)
  totalMinor Int
  currency   CurrencyCode
  placedAt   DateTime       @default(now())

  buyer  User    @relation(fields: [buyerId], references: [id], onDelete: Restrict)
  orders Order[]

  @@index([status, placedAt])
  @@index([buyerId])
  @@map("checkouts")
}
```

`packages/database/prisma/schema/Order.prisma`:

```prisma
enum OrderStatus {
  PENDING_PAYMENT
  CANCELLED
}

// One seller per order (D56). Reachable by the seller through tenantScope and by
// the buyer through buyerScope, never by a bare id (ADR 010 amendment).
// (checkoutId, organizationId) is unique: the database, not only the code, says a
// checkout has at most one order per seller.
model Order {
  id             String       @id @default(uuid())
  checkoutId     String
  organizationId String
  buyerId        String
  status         OrderStatus  @default(PENDING_PAYMENT)
  totalMinor     Int
  currency       CurrencyCode
  createdAt      DateTime     @default(now())

  checkout     Checkout     @relation(fields: [checkoutId], references: [id], onDelete: Restrict)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  buyer        User         @relation(fields: [buyerId], references: [id], onDelete: Restrict)
  items        OrderItem[]

  @@unique([checkoutId, organizationId])
  @@index([buyerId, createdAt])
  @@map("orders")
}
```

`packages/database/prisma/schema/OrderItem.prisma`:

```prisma
// Snapshots: unitPriceMinor (PRD-FR-CHK-005) and productName (D90). An order's
// history does not change when the product does.
model OrderItem {
  id             String @id @default(uuid())
  orderId        String
  productId      String
  productName    String
  quantity       Int
  unitPriceMinor Int

  order   Order   @relation(fields: [orderId], references: [id], onDelete: Restrict)
  product Product @relation(fields: [productId], references: [id], onDelete: Restrict)

  @@unique([orderId, productId])
  @@map("order_items")
}
```

Back-relations — add these fields and nothing else:

- `User.prisma`, in `model User`: `cart Cart?`, `checkouts Checkout[]`, `orders Order[]`
- `Organization.prisma`, in `model Organization`: `orders Order[]`
- `Product.prisma`, in `model Product`: `cartItems CartItem[]`, `orderItems OrderItem[]`

- [ ] **Step 4: Generate the migration without applying it**

```bash
cd packages/database && pnpm exec prisma migrate dev --create-only --name add_cart_and_checkout
```

Expected: `Prisma Migration created … prisma/migrations/<timestamp>_add_cart_and_checkout/migration.sql`,
and **nothing applied** — `--create-only` exists so the CHECKs go in first.

- [ ] **Step 5: Prove it is additive, then hand-write the CHECKs**

```bash
grep -nE '^(DROP|ALTER TABLE "(users|organizations|organization_members|products|inventory|sessions|refresh_tokens)")' packages/database/prisma/migrations/*_add_cart_and_checkout/migration.sql
```

Expected: no output, exit 1. A line here alters a phase-2/3 table and means a model file changed
more than a back-relation — fix the model; do not edit the SQL to hide it.

Append to the generated `migration.sql`:

```sql
-- Business rules the database enforces, so a write around the application is still
-- refused. Prisma cannot express a CHECK; the integration suite proves each by name.
ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_quantity_range" CHECK ("quantity" BETWEEN 1 AND 10);
ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_added_price_positive" CHECK ("addedUnitPriceMinor" >= 1);
ALTER TABLE "checkouts"
  ADD CONSTRAINT "checkouts_total_positive" CHECK ("totalMinor" >= 1);
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_total_positive" CHECK ("totalMinor" >= 1);
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" >= 1);
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_unit_price_positive" CHECK ("unitPriceMinor" >= 1);
```

- [ ] **Step 6: Apply it and regenerate the client**

```bash
pnpm --filter @app/database db:migrate
pnpm --filter @app/database build
```

Expected: `check-db-env` passes silently, then `Applying migration …_add_cart_and_checkout` and
`Your database is now in sync with your schema.`

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter api test:integration`
Expected: PASS — `phase-4-constraints` 12 cases (6 installed + 6 behavioural), `enum-drift` 7,
every existing integration case unchanged.

- [ ] **Step 8: Commit**

```bash
git add packages/database/prisma apps/api/test/support/marketplace.ts apps/api/test/integration
git commit -m "feat(database): cart, checkout, order and order item tables with their CHECKs"
```

---

### Task 7: The error envelope carries `details` from an `HttpException`

**Files:**
- Modify: `apps/api/src/filters/error-envelope.filter.ts`
- Create: `apps/api/src/filters/error-envelope.filter.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: an `HttpException` constructed from an object with a `details` key — e.g.
  `new ConflictException({ message, details })` — reaches the client as
  `{ error: { code, message, requestId, details } }`. Tasks 14–15 depend on it.

**Why this is a task (finding 1).** At `3633695` the filter forwards `details` only for a
`ZodValidationException`. An `HttpException` loses it, so SRS §8's 409 `details.lines` could not reach
a client however the checkout service threw it.

- [ ] **Step 1: Write the failing test**

`apps/api/src/filters/error-envelope.filter.spec.ts`:

```ts
import {
  ConflictException,
  NotFoundException,
  type ArgumentsHost,
  type LoggerService,
} from '@nestjs/common';
import { ErrorCodes } from '@app/contracts';
import { ErrorEnvelopeFilter } from './error-envelope.filter';

const silent: LoggerService = { log: () => undefined, error: () => undefined, warn: () => undefined };

function capture(requestId = 'req_test') {
  const sent: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return response;
    },
    json(body: unknown) {
      sent.body = body;
      return response;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ requestId }) }),
  } as unknown as ArgumentsHost;
  return { host, sent };
}

describe('ErrorEnvelopeFilter', () => {
  it('forwards typed details from an HttpException built with them (SRS §8)', () => {
    const { host, sent } = capture();
    const details = {
      lines: [{ productId: 'p1', reason: 'SOLD_OUT', available: 0, currentUnitPriceMinor: 100 }],
    };

    new ErrorEnvelopeFilter(silent).catch(
      new ConflictException({ message: 'Some lines cannot be ordered', details }),
      host,
    );

    expect(sent.status).toBe(409);
    expect(sent.body).toEqual({
      error: {
        code: ErrorCodes.CONFLICT,
        message: 'Some lines cannot be ordered',
        requestId: 'req_test',
        details,
      },
    });
  });

  it('leaves details out when an exception carries none', () => {
    const { host, sent } = capture();
    new ErrorEnvelopeFilter(silent).catch(new NotFoundException('Product not found'), host);

    expect(JSON.parse(JSON.stringify(sent.body))).toEqual({
      error: { code: ErrorCodes.NOT_FOUND, message: 'Product not found', requestId: 'req_test' },
    });
  });

  it('never leaks an internal error message', () => {
    const { host, sent } = capture();
    new ErrorEnvelopeFilter(silent).catch(new Error('connection string was …'), host);

    expect(sent.status).toBe(500);
    expect(JSON.stringify(sent.body)).not.toContain('connection string');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter api exec jest src/filters/error-envelope.filter.spec.ts`
Expected: FAIL — case 1's body has no `details`.

- [ ] **Step 3: Implement**

In `apps/api/src/filters/error-envelope.filter.ts`, replace the `HttpException` branch of `map`:

```ts
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string }).message ?? exception.message);
      // A typed refusal (checkout's 409) is thrown as `new ConflictException({
      // message, details })`; its details are contract, not decoration.
      const details =
        typeof body === 'object' && body !== null && 'details' in body
          ? (body as { details?: unknown }).details
          : undefined;
      return { status: exception.getStatus(), code: this.codeFor(exception), message, details };
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter api exec jest && pnpm --filter api test:e2e`
Expected: PASS — 3 new unit cases; every e2e suite unchanged (no existing exception carries a
`details` key, so no existing body changes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/filters
git commit -m "fix(api): carry an HttpException's typed details into the error envelope"
```

---

### Task 8: `BuyerGuard` and `@Buyer()`

**Files:**
- Create: `apps/api/src/security/guards/buyer.guard.ts`,
  `apps/api/src/security/guards/buyer.guard.spec.ts`,
  `apps/api/src/security/decorators/buyer.decorator.ts`
- Modify: `apps/api/src/security/security.module.ts`,
  `apps/api/src/common/interfaces/request-context.interface.ts`

**Interfaces:**
- Consumes: `buildBuyerContext`, `BuyerContext` (Task 1); `SecurityMetadata` (existing).
- Produces: `request.buyer?: BuyerContext` on `AuthenticatedRequest`; global `BuyerGuard`
  registered third, between `OrganizationGuard` and `RolesGuard`; the `@Buyer()` parameter decorator
  returning `BuyerContext`.

**The rule (D75).** On a non-public `@TenantFree()` route with an authenticated user, the guard builds
`BuyerContext` from `request.user.id` — the token's `sub`, never a header or body field. It never
refuses: authentication is `AccessTokenGuard`'s job, and two guards answering one question drift. It
builds nothing on tenant routes, so `@Buyer()` used on one fails on the first request of any test.

- [ ] **Step 1: Write the failing test**

`apps/api/src/security/guards/buyer.guard.spec.ts`:

```ts
import type { ExecutionContext } from '@nestjs/common';
import { buildBuyerContext } from '@app/domain';
import { SecurityMetadata } from '../security.constants';
import { BuyerGuard } from './buyer.guard';

type Request = { user?: { id: string }; buyer?: unknown };

const contextFor = (request: Request) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext;

const guardFor = (marks: { isPublic?: boolean; tenantFree?: boolean }) =>
  new BuyerGuard({
    getAllAndOverride: jest.fn((key: string) =>
      key === SecurityMetadata.PUBLIC ? marks.isPublic : marks.tenantFree,
    ),
  } as never);

describe('BuyerGuard (D75)', () => {
  it('builds the buyer from the authenticated user on a tenant-free route', () => {
    const request: Request = { user: { id: 'user_1' } };

    expect(guardFor({ tenantFree: true }).canActivate(contextFor(request))).toBe(true);
    expect(request.buyer).toEqual(buildBuyerContext('user_1'));
  });

  it('builds nothing on a tenant route, so @Buyer() cannot be used there', () => {
    const request: Request = { user: { id: 'user_1' } };

    expect(guardFor({ tenantFree: false }).canActivate(contextFor(request))).toBe(true);
    expect(request.buyer).toBeUndefined();
  });

  it('builds nothing on a public route', () => {
    const request: Request = {};

    expect(guardFor({ isPublic: true, tenantFree: true }).canActivate(contextFor(request))).toBe(true);
    expect(request.buyer).toBeUndefined();
  });

  it('never refuses: authentication belongs to AccessTokenGuard', () => {
    expect(guardFor({ tenantFree: true }).canActivate(contextFor({}))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter api exec jest src/security/guards/buyer.guard.spec.ts`
Expected: FAIL — `Cannot find module './buyer.guard'`.

- [ ] **Step 3: Implement**

`apps/api/src/common/interfaces/request-context.interface.ts` — widen the domain import to
`import type { BuyerContext, TenantContext } from '@app/domain';` and add to
`AuthenticatedRequest`:

```ts
  /** Set by BuyerGuard on tenant-free routes (D75). */
  buyer?: BuyerContext;
```

`apps/api/src/security/guards/buyer.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { buildBuyerContext } from '@app/domain';
import { SecurityMetadata } from '../security.constants';
import type { AuthenticatedRequest } from '../../common/interfaces/request-context.interface';

/**
 * Resolves who the buyer is, the way OrganizationGuard resolves which tenant:
 * once, in a guard, from something the caller cannot forge — the access token's
 * subject (D75). A controller never reads a buyer id from the request.
 */
@Injectable()
export class BuyerGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(SecurityMetadata.PUBLIC, targets) ?? false;
    const isTenantFree =
      this.reflector.getAllAndOverride<boolean>(SecurityMetadata.TENANT_FREE, targets) ?? false;

    if (isPublic || !isTenantFree) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user !== undefined) request.buyer = buildBuyerContext(request.user.id);
    return true;
  }
}
```

`apps/api/src/security/decorators/buyer.decorator.ts`:

```ts
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { BuyerContext } from '@app/domain';
import type { AuthenticatedRequest } from '../../common/interfaces/request-context.interface';

/** Reads what BuyerGuard resolved. Never reads a buyer id from the request. */
export const Buyer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): BuyerContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.buyer === undefined) {
      throw new Error('Buyer used on a route that is not @TenantFree(), so BuyerGuard built nothing');
    }
    return request.buyer;
  },
);
```

`apps/api/src/security/security.module.ts` — import `BuyerGuard`, register it third:

```ts
  providers: [
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: OrganizationGuard },
    { provide: APP_GUARD, useClass: BuyerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
```

and extend the class comment: "…the organization guard establishes which tenant they may act in,
the buyer guard which buyer a tenant-free route acts for, and the roles guard authorizes within a
tenant."

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter api exec jest && pnpm --filter api test:e2e`
Expected: PASS — 4 new unit cases; `guards.e2e-spec.ts` and every other e2e suite unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/security apps/api/src/common/interfaces/request-context.interface.ts
git commit -m "feat(api): BuyerGuard resolves a BuyerContext from the token on tenant-free routes"
```

---

### Task 9: `PUT /products/:id/inventory` — a seller can state their stock (D81)

**Files:**
- Modify: `apps/api/src/catalog/catalog.controller.ts`, `catalog.service.ts`,
  `repositories/catalog.repository.ts`, `dto/catalog.dto.ts`; `apps/api/test/support/fixtures.ts`
- Create: `apps/api/test/inventory.e2e-spec.ts`

**Interfaces:**
- Consumes: `SetInventoryRequestSchema` (Task 5), `tenantScope`.
- Produces: `PUT /api/v1/products/:id/inventory` `{ available }` → `200 Inventory`, 404 outside the
  tenant. Fixtures: `newTenant` also returns `slug`;
  `publishedProduct(app, tenant, overrides?) → Promise<{ id; name; priceMinor }>` creates, stocks
  and publishes a product through the seller's own HTTP routes.

**Why (finding 2).** At `3633695` an `Inventory` row is created at 0 and is only readable. No API, UI
or seed path lets a seller stock a new product, so the behavioural journeys (Task 25) — and a reviewer
running the stack — could buy nothing but the two seeded products.

- [ ] **Step 1: Write the failing test**

`apps/api/test/inventory.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ErrorCodes, InventorySchema } from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { expectContract } from './support/contracts';
import { newTenant, productPayload, tenantHeaders } from './support/fixtures';

describe('set inventory (e2e, D81)', () => {
  let app: INestApplication;
  let owner: Awaited<ReturnType<typeof newTenant>>;
  let other: Awaited<ReturnType<typeof newTenant>>;
  let productId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    owner = await newTenant(app, 'stock');
    other = await newTenant(app, 'otherstock');
    const created = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(tenantHeaders(owner.accessToken, owner.organizationId))
      .send(productPayload())
      .expect(201);
    productId = created.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const put = (tenant: typeof owner, body: object) =>
    request(app.getHttpServer())
      .put(`/api/v1/products/${productId}/inventory`)
      .set(tenantHeaders(tenant.accessToken, tenant.organizationId))
      .send(body);

  it('sets an absolute count and returns the inventory', async () => {
    const res = await put(owner, { available: 7 }).expect(200);

    expect(res.body).toEqual({ productId, available: 7, reserved: 0 });
    expectContract(InventorySchema, res.body);
  });

  it('is idempotent: the same body twice leaves the same count', async () => {
    await put(owner, { available: 3 }).expect(200);
    expect((await put(owner, { available: 3 }).expect(200)).body.available).toBe(3);
  });

  it('answers 404 to another tenant and leaves the stock alone (INV-9)', async () => {
    await put(owner, { available: 4 }).expect(200);
    const res = await put(other, { available: 999 }).expect(404);

    expect(res.body.error.code).toBe(ErrorCodes.NOT_FOUND);
    const inventory = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}/inventory`)
      .set(tenantHeaders(owner.accessToken, owner.organizationId))
      .expect(200);
    expect(inventory.body.available).toBe(4);
  });

  it.each([{ available: -1 }, { available: 1.5 }, {}])('refuses %o with 400', async (body) => {
    const res = await put(owner, body).expect(400);
    expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter api test:e2e -- inventory`
Expected: FAIL — `expected 200 "OK", got 404 "Not Found"`.

- [ ] **Step 3: Implement**

`apps/api/src/catalog/dto/catalog.dto.ts` — add `SetInventoryRequestSchema` to the contracts import
and:

```ts
export class SetInventoryRequestDto extends createZodDto(SetInventoryRequestSchema) {}
```

`apps/api/src/catalog/repositories/catalog.repository.ts` — add:

```ts
  /**
   * `updateMany` with the tenant filter through the relation, like findInventory:
   * an inventory row is never writable by product id alone. Waits behind a
   * checkout's row lock rather than racing it.
   */
  async setAvailable(tenant: TenantContext, productId: string, available: number): Promise<number> {
    const updated = await this.prisma.inventory.updateMany({
      where: { productId, product: { ...tenantScope(tenant) } },
      data: { available },
    });
    return updated.count;
  }
```

`apps/api/src/catalog/catalog.service.ts` — add:

```ts
  async setInventory(tenant: TenantContext, id: string, available: number): Promise<Inventory> {
    const updated = await this.catalogRepository.setAvailable(tenant, id, available);
    if (updated === 0) throw new NotFoundException(ProductMessages.NOT_FOUND);
    return this.inventory(tenant, id);
  }
```

`apps/api/src/catalog/catalog.controller.ts` — add `Put` to the `@nestjs/common` import and
`SetInventoryRequestDto` to the dto import, then:

```ts
  /** Absolute, not a delta: the seller states what is on the shelf (D81). */
  @Put(':id/inventory')
  @ApiOkResponse({ type: InventoryDto })
  setInventory(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: SetInventoryRequestDto,
  ): Promise<Inventory> {
    return this.catalogService.setInventory(tenant, id, body.available);
  }
```

`apps/api/test/support/fixtures.ts` — `newTenant` returns the slug, plus a helper:

```ts
export async function newTenant(
  app: INestApplication,
  prefix: string,
): Promise<{ accessToken: string; organizationId: string; slug: string }> {
  const accessToken = await registerAndLogin(app, `${unique(prefix)}@marketcore.test`);
  const created = await request(app.getHttpServer())
    .post('/api/v1/organizations')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(organizationPayload(prefix))
    .expect(201);

  return {
    accessToken,
    organizationId: created.body.id as string,
    slug: created.body.slug as string,
  };
}

/** A priced, stocked, PUBLISHED product, created through the seller's own routes. */
export async function publishedProduct(
  app: INestApplication,
  tenant: { accessToken: string; organizationId: string },
  overrides: Partial<{ name: string; priceMinor: number; currency: string; available: number }> = {},
): Promise<{ id: string; name: string; priceMinor: number }> {
  const { available = 5, ...product } = overrides;
  const headers = tenantHeaders(tenant.accessToken, tenant.organizationId);
  const created = await request(app.getHttpServer())
    .post('/api/v1/products')
    .set(headers)
    .send(productPayload({ name: unique('item'), ...product }))
    .expect(201);
  const id = created.body.id as string;

  await request(app.getHttpServer())
    .put(`/api/v1/products/${id}/inventory`)
    .set(headers)
    .send({ available })
    .expect(200);
  await request(app.getHttpServer()).post(`/api/v1/products/${id}/publish`).set(headers).expect(204);

  return { id, name: created.body.name as string, priceMinor: created.body.priceMinor as number };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter api test:e2e`
Expected: PASS — `inventory.e2e-spec` 6 cases; `tenancy`, `catalog` and the rest unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/catalog apps/api/test/inventory.e2e-spec.ts apps/api/test/support/fixtures.ts
git commit -m "feat(catalog): a seller sets a product's available stock (D81)"
```

---
### Task 10: The public catalog — `GET /storefront/products[/:id]`

**Files:**
- Create: `apps/api/src/storefront/storefront.module.ts`, `storefront.controller.ts`,
  `storefront.service.ts`, `storefront.constants.ts`, `public-product.mapper.ts`,
  `public-product.mapper.spec.ts`, `dto/storefront.dto.ts`, `interfaces/public-product.interface.ts`,
  `repositories/storefront.repository.ts`; `apps/api/src/common/pagination/page.ts`,
  `page.spec.ts`, `pagination.constants.ts`; `apps/api/test/storefront.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PublicProductSchema`, `PublicProductPageSchema`, `PageQuerySchema`,
  `STOREFRONT_PAGE_SIZE`, `ProductStatuses`, `OrganizationStatuses`; `publishedProduct`, `newTenant`
  (Task 9); `createSeller`, `createProduct`, `bearer` (Task 6).
- Produces: `toPage<Row extends { id: string }, Item>(rows, size, map)` →
  `{ items: Item[]; nextCursor: string | null }` (reused by Task 16); `PUBLIC_PRODUCT_WHERE` (reused
  by Tasks 11, 13); `GET /api/v1/storefront/products?cursor=` → `PublicProductPage`;
  `GET /api/v1/storefront/products/:id` → `PublicProduct` or 404.

**The cross-tenant product read (ADR 010 amendment).** `StorefrontRepository` reads without a
`TenantContext`, pinned to `PUBLISHED` products of `ACTIVE` organizations by one
`PUBLIC_PRODUCT_WHERE` constant. Everything it returns goes through `toPublicProduct`, which builds
the object field by field and then parses it with the strict schema: a field selected by mistake is
dropped, and a field mapped by mistake fails the parse with a 500 rather than leaving the server.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/common/pagination/page.spec.ts`:

```ts
import { toPage } from './page';

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}` }));

describe('toPage', () => {
  it('returns a cursor when one row more than the page size came back', () => {
    expect(toPage(rows(3), 2, (row) => row.id)).toEqual({ items: ['r0', 'r1'], nextCursor: 'r1' });
  });

  it('returns no cursor on the last page', () => {
    expect(toPage(rows(2), 2, (row) => row.id)).toEqual({ items: ['r0', 'r1'], nextCursor: null });
    expect(toPage(rows(0), 2, (row) => row.id)).toEqual({ items: [], nextCursor: null });
  });
});
```

`apps/api/src/storefront/public-product.mapper.spec.ts`:

```ts
import { CurrencyCodes } from '@app/contracts';
import { toPublicProduct } from './public-product.mapper';

const row = {
  id: 'p1',
  name: 'Shirt',
  priceMinor: 24_900,
  currency: CurrencyCodes.EGP,
  inventory: { available: 1 },
  organization: { name: 'Nile Traders', slug: 'nile-traders' },
};

describe('toPublicProduct', () => {
  it('builds exactly the public shape', () => {
    expect(toPublicProduct(row)).toEqual({
      id: 'p1',
      name: 'Shirt',
      priceMinor: 24_900,
      currency: CurrencyCodes.EGP,
      available: 1,
      seller: { name: 'Nile Traders', slug: 'nile-traders' },
    });
  });

  it('reads a missing inventory row as zero, never as available', () => {
    expect(toPublicProduct({ ...row, inventory: null }).available).toBe(0);
  });

  it('drops a private field that reached the row, because it builds field by field', () => {
    const leaky = { ...row, organizationId: 'org_1', status: 'DRAFT' };
    expect(toPublicProduct(leaky)).not.toHaveProperty('organizationId');
  });
});
```

`apps/api/test/storefront.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  ErrorCodes,
  OrganizationStatuses,
  PublicProductPageSchema,
  PublicProductSchema,
  STOREFRONT_PAGE_SIZE,
  type PublicProduct,
} from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { expectContract } from './support/contracts';
import { testPrisma } from './support/db';
import {
  newTenant,
  productPayload,
  publishedProduct,
  registerAndLogin,
  tenantHeaders,
  unique,
} from './support/fixtures';
import { bearer, createProduct, createSeller } from './support/marketplace';

/**
 * AC-US-CAT-001-1/-2, AC-US-CAT-002-1, SRS-NFR-SEC-001.
 *
 * The suites share one database, so "exactly the two published products appear"
 * is asserted over this suite's two sellers — every other suite's published
 * products are legitimately public too (finding 19).
 */
describe('public catalog (e2e)', () => {
  let app: INestApplication;
  let buyerToken: string;
  let sellerA: Awaited<ReturnType<typeof newTenant>>;
  let sellerB: Awaited<ReturnType<typeof newTenant>>;
  const published: { id: string; name: string }[] = [];
  const drafts: { id: string; name: string }[] = [];

  const server = () => app.getHttpServer();
  const PUBLIC_KEYS = ['available', 'currency', 'id', 'name', 'priceMinor', 'seller'];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    sellerA = await newTenant(app, 'shopa');
    sellerB = await newTenant(app, 'shopb');
    // A buyer is a user with no membership at all (D53).
    buyerToken = await registerAndLogin(app, `${unique('buyer')}@marketcore.test`);

    for (const seller of [sellerA, sellerB]) {
      published.push(await publishedProduct(app, seller, { available: 1 }));
      const draft = await request(server())
        .post('/api/v1/products')
        .set(tenantHeaders(seller.accessToken, seller.organizationId))
        .send(productPayload({ name: unique('secret-draft') }))
        .expect(201);
      drafts.push({ id: draft.body.id, name: draft.body.name });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const list = (cursor?: string) =>
    request(server())
      .get('/api/v1/storefront/products')
      .query(cursor === undefined ? {} : { cursor })
      .set(bearer(buyerToken))
      .expect(200);

  it("lists both sellers' published products and neither draft (AC-US-CAT-001-1)", async () => {
    const res = await list();
    const page = expectContract(PublicProductPageSchema, res.body);
    const ours = page.items.filter((item) => [sellerA.slug, sellerB.slug].includes(item.seller.slug));

    expect(ours.map((item) => item.id).sort()).toEqual(published.map((p) => p.id).sort());
    expect(JSON.stringify(res.body)).not.toContain('secret-draft');
  });

  it('answers 404 for a draft by id, without its name (AC-US-CAT-001-2)', async () => {
    const res = await request(server())
      .get(`/api/v1/storefront/products/${drafts[0].id}`)
      .set(bearer(buyerToken))
      .expect(404);

    expect(res.body.error.code).toBe(ErrorCodes.NOT_FOUND);
    expect(JSON.stringify(res.body)).not.toContain(drafts[0].name);
  });

  it('shows stock 1 and the seller name (AC-US-CAT-002-1)', async () => {
    const res = await request(server())
      .get(`/api/v1/storefront/products/${published[0].id}`)
      .set(bearer(buyerToken))
      .expect(200);

    const product: PublicProduct = expectContract(PublicProductSchema, res.body);
    expect(product.available).toBe(1);
    expect(product.seller).toEqual({ name: 'shopa co', slug: sellerA.slug });
  });

  it('returns exactly the public keys, nothing more (SRS-NFR-SEC-001)', async () => {
    const res = await request(server())
      .get(`/api/v1/storefront/products/${published[0].id}`)
      .set(bearer(buyerToken))
      .expect(200);

    expect(Object.keys(res.body).sort()).toEqual(PUBLIC_KEYS);
    expect(Object.keys(res.body.seller).sort()).toEqual(['name', 'slug']);
  });

  it("hides an inactive organization's products from the list and by id", async () => {
    const inactive = await createSeller('inactive');
    const product = await createProduct(inactive.organizationId);
    await testPrisma.organization.update({
      where: { id: inactive.organizationId },
      data: { status: OrganizationStatuses.DISABLED },
    });

    await request(server())
      .get(`/api/v1/storefront/products/${product.id}`)
      .set(bearer(buyerToken))
      .expect(404);
    const res = await list();
    expect(res.body.items.some((item: PublicProduct) => item.id === product.id)).toBe(false);
  });

  it('pages 24 at a time, newest first, without overlap (SRS-FR-CAT-001)', async () => {
    const seller = await createSeller('paging');
    const created: string[] = [];
    for (let i = 0; i <= STOREFRONT_PAGE_SIZE; i++) {
      created.push((await createProduct(seller.organizationId)).id);
    }

    const first = expectContract(PublicProductPageSchema, (await list()).body);
    expect(first.items).toHaveLength(STOREFRONT_PAGE_SIZE);
    expect(first.nextCursor).not.toBeNull();

    const second = expectContract(PublicProductPageSchema, (await list(first.nextCursor!)).body);
    const firstIds = first.items.map((item) => item.id);
    expect(second.items.some((item) => firstIds.includes(item.id))).toBe(false);
    // The 25 just created are the newest rows: 24 on page one, the 25th first on page two.
    expect([...firstIds, second.items[0].id].sort()).toEqual([...created].sort());
  });

  it('requires a signed-in user (SRS §5)', async () => {
    await request(server()).get('/api/v1/storefront/products').expect(401);
  });
});
```

`expectContract` (in `test/support/contracts.ts`) returns the parsed value, which is why the suites
assign its result.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api exec jest src/common/pagination src/storefront && pnpm --filter api test:e2e -- storefront`
Expected: FAIL — `Cannot find module './page'` and `'./public-product.mapper'`; the e2e answers 404
for the route.

- [ ] **Step 3: Implement**

`apps/api/src/common/pagination/page.ts`:

```ts
/**
 * A cursor page from `size + 1` rows: the extra row only proves there is more.
 * The cursor is the last returned row's id (D89); callers order by
 * (createdAt desc, id desc) so the id breaks ties deterministically.
 */
export function toPage<Row extends { id: string }, Item>(
  rows: readonly Row[],
  size: number,
  map: (row: Row) => Item,
): { items: Item[]; nextCursor: string | null } {
  const hasMore = rows.length > size;
  const pageRows = hasMore ? rows.slice(0, size) : rows;
  const last = pageRows[pageRows.length - 1];
  return { items: pageRows.map(map), nextCursor: hasMore && last !== undefined ? last.id : null };
}
```

`apps/api/src/storefront/interfaces/public-product.interface.ts`:

```ts
import type { CurrencyCode } from '@app/contracts';

/** What the storefront query selects — and nothing it does not need. */
export interface PublicProductRow {
  id: string;
  name: string;
  priceMinor: number;
  currency: CurrencyCode;
  inventory: { available: number } | null;
  organization: { name: string; slug: string };
}
```

`apps/api/src/storefront/storefront.constants.ts`:

```ts
import { OrganizationStatuses, ProductStatuses } from '@app/contracts';

export const StorefrontMessages = { NOT_FOUND: 'Product not found' } as const;

/**
 * The only definition of "public" (RULE-CAT-001, ADR 010 amendment): a published
 * product of an active organization. Every buyer-side product read spreads this.
 */
export const PUBLIC_PRODUCT_WHERE = {
  status: ProductStatuses.PUBLISHED,
  organization: { status: OrganizationStatuses.ACTIVE },
} as const;

export const PUBLIC_PRODUCT_SELECT = {
  id: true,
  name: true,
  priceMinor: true,
  currency: true,
  inventory: { select: { available: true } },
  organization: { select: { name: true, slug: true } },
} as const;
```

`apps/api/src/common/pagination/pagination.constants.ts`:

```ts
/** Newest first; the id breaks ties so a cursor is deterministic (D89). Shared by every cursor page. */
export const NEWEST_FIRST = [{ createdAt: 'desc' }, { id: 'desc' }] as const;
```

`apps/api/src/storefront/repositories/storefront.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/runtime';
import { NEWEST_FIRST } from '../../common/pagination/pagination.constants';
import type { PublicProductRow } from '../interfaces/public-product.interface';
import { PUBLIC_PRODUCT_SELECT, PUBLIC_PRODUCT_WHERE } from '../storefront.constants';

/**
 * The public read path (ADR 010 amendment). It takes no TenantContext because a
 * published product is public by design (INV-9 as narrowed); what keeps it safe
 * is PUBLIC_PRODUCT_WHERE here and the strict schema in the mapper.
 */
@Injectable()
export class StorefrontRepository {
  constructor(private readonly prisma: PrismaService) {}

  listPublished(cursor: string | undefined, size: number): Promise<PublicProductRow[]> {
    return this.prisma.product.findMany({
      where: PUBLIC_PRODUCT_WHERE,
      select: PUBLIC_PRODUCT_SELECT,
      orderBy: [...NEWEST_FIRST],
      take: size + 1,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    });
  }

  findPublished(id: string): Promise<PublicProductRow | null> {
    return this.prisma.product.findFirst({
      where: { id, ...PUBLIC_PRODUCT_WHERE },
      select: PUBLIC_PRODUCT_SELECT,
    });
  }
}
```

`apps/api/src/storefront/public-product.mapper.ts`:

```ts
import { PublicProductSchema, type PublicProduct } from '@app/contracts';
import type { PublicProductRow } from './interfaces/public-product.interface';

/**
 * Field by field, then through the strict schema (SRS-FR-CAT-003). `available`
 * comes from the same query as the product and is never cached (SRS-FR-CAT-004).
 */
export function toPublicProduct(row: PublicProductRow): PublicProduct {
  return PublicProductSchema.parse({
    id: row.id,
    name: row.name,
    priceMinor: row.priceMinor,
    currency: row.currency,
    available: row.inventory?.available ?? 0,
    seller: { name: row.organization.name, slug: row.organization.slug },
  });
}
```

`apps/api/src/storefront/storefront.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { STOREFRONT_PAGE_SIZE, type PublicProduct, type PublicProductPage } from '@app/contracts';
import { toPage } from '../common/pagination/page';
import { toPublicProduct } from './public-product.mapper';
import { StorefrontRepository } from './repositories/storefront.repository';
import { StorefrontMessages } from './storefront.constants';

@Injectable()
export class StorefrontService {
  constructor(private readonly storefrontRepository: StorefrontRepository) {}

  async list(cursor: string | undefined): Promise<PublicProductPage> {
    const rows = await this.storefrontRepository.listPublished(cursor, STOREFRONT_PAGE_SIZE);
    return toPage(rows, STOREFRONT_PAGE_SIZE, toPublicProduct);
  }

  /** A draft, an unknown id and an inactive seller's product answer alike (SRS-FR-CAT-002). */
  async findOne(id: string): Promise<PublicProduct> {
    const row = await this.storefrontRepository.findPublished(id);
    if (row === null) throw new NotFoundException(StorefrontMessages.NOT_FOUND);
    return toPublicProduct(row);
  }
}
```

`apps/api/src/storefront/dto/storefront.dto.ts`:

```ts
import { createZodDto } from 'nestjs-zod';
import { PageQuerySchema, PublicProductPageSchema, PublicProductSchema } from '@app/contracts';

export class PageQueryDto extends createZodDto(PageQuerySchema) {}
export class PublicProductDto extends createZodDto(PublicProductSchema) {}
export class PublicProductPageDto extends createZodDto(PublicProductPageSchema) {}
```

`apps/api/src/storefront/storefront.controller.ts`:

```ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import type { PublicProduct, PublicProductPage } from '@app/contracts';
import { TenantFree } from '../security/decorators/tenant-free.decorator';
import { PageQueryDto, PublicProductDto, PublicProductPageDto } from './dto/storefront.dto';
import { StorefrontService } from './storefront.service';

/** Signed-in, tenant-free (SRS §5): any user reads the public catalog. */
@Controller('storefront/products')
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Get()
  @TenantFree()
  @ApiOkResponse({ type: PublicProductPageDto })
  list(@Query() query: PageQueryDto): Promise<PublicProductPage> {
    return this.storefrontService.list(query.cursor);
  }

  @Get(':id')
  @TenantFree()
  @ApiOkResponse({ type: PublicProductDto })
  findOne(@Param('id') id: string): Promise<PublicProduct> {
    return this.storefrontService.findOne(id);
  }
}
```

`apps/api/src/storefront/storefront.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { StorefrontRepository } from './repositories/storefront.repository';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';

@Module({
  controllers: [StorefrontController],
  providers: [StorefrontRepository, StorefrontService],
})
export class StorefrontModule {}
```

`apps/api/src/app.module.ts` — add `StorefrontModule` to `imports`, before `SecurityModule`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter api exec jest && pnpm --filter api test:e2e`
Expected: PASS — `page.spec` 2, mapper 3, `storefront.e2e-spec` 7; `client-contract.e2e-spec` still
green (it renders the Swagger document, so a DTO that breaks `cleanupOpenApiDoc` fails there).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/pagination apps/api/src/storefront apps/api/src/app.module.ts apps/api/test/storefront.e2e-spec.ts
git commit -m "feat(storefront): the public catalog, published only, through the strict PublicProduct"
```

---

### Task 11: The cart — `GET /cart`, `PUT`/`DELETE /cart/items/:productId`

**Files:**
- Create: `apps/api/src/cart/cart.module.ts`, `cart.controller.ts`, `cart.service.ts`,
  `cart.constants.ts`, `cart.mapper.ts`, `cart.mapper.spec.ts`, `dto/cart.dto.ts`,
  `interfaces/cart.interface.ts`, `repositories/cart.repository.ts`; `apps/api/test/cart.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `buyerScope`, `cartLineAvailability`, `groupBySeller` (Tasks 1, 3); `CartSchema`,
  `SetCartLineRequestSchema` (Task 5); `@Buyer()` (Task 8); `PUBLIC_PRODUCT_WHERE` (Task 10).
- Produces: `GET /api/v1/cart`, `PUT /api/v1/cart/items/:productId` `{ quantity }`,
  `DELETE /api/v1/cart/items/:productId` — each `200 Cart`. The invariant Task 13 relies on: **every
  cart write locks the buyer's cart row before touching a line** (D83).

**Rules implemented.** SRS-FR-CART-001 … 007. A cart write never reads-for-update or writes
`Inventory` (FR-CART-004); availability is a plain read for the response. `PUT` checks only that the
product is public — stock is checked at checkout (D58). `addedUnitPriceMinor` is written on insert
and never on update (D82), so changing a quantity does not silently accept a new price.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/cart/cart.mapper.spec.ts`:

```ts
import {
  CartLineAvailabilities,
  CurrencyCodes,
  OrganizationStatuses,
  ProductStatuses,
} from '@app/contracts';
import { toCart } from './cart.mapper';
import type { CartLineRow } from './interfaces/cart.interface';

function row(
  productId: string,
  overrides: Partial<CartLineRow['product']> & { quantity?: number; sellerId?: string } = {},
): CartLineRow {
  const sellerId = overrides.sellerId ?? 's1';
  return {
    productId,
    quantity: overrides.quantity ?? 1,
    addedUnitPriceMinor: 1000,
    product: {
      name: overrides.name ?? 'Item',
      priceMinor: overrides.priceMinor ?? 1000,
      currency: CurrencyCodes.EGP,
      status: overrides.status ?? ProductStatuses.PUBLISHED,
      inventory: overrides.inventory ?? { available: 5 },
      organization: overrides.organization ?? {
        id: sellerId,
        name: `Seller ${sellerId}`,
        slug: `seller-${sellerId}`,
        status: OrganizationStatuses.ACTIVE,
      },
    },
  };
}

describe('toCart', () => {
  it('groups lines by seller (SRS-FR-CART-006)', () => {
    const cart = toCart([row('a', { sellerId: 's1' }), row('b', { sellerId: 's2' })]);
    expect(cart.sellers.map((group) => group.seller.slug)).toEqual(['seller-s1', 'seller-s2']);
  });

  it('flags a line short of stock (AC-US-CART-002-1)', () => {
    const cart = toCart([row('a', { quantity: 2, inventory: { available: 1 } })]);
    expect(cart.sellers[0].lines[0]).toMatchObject({ available: 1, availability: CartLineAvailabilities.SHORT });
  });

  it('keeps an unpublished line, sold out and masked (SRS-FR-CART-007, D86)', () => {
    const cart = toCart([row('a', { status: ProductStatuses.DRAFT, inventory: { available: 9 } })]);
    expect(cart.sellers[0].lines[0]).toMatchObject({
      availability: CartLineAvailabilities.SOLD_OUT,
      available: 0,
      currentUnitPriceMinor: null,
    });
  });

  it('shows the added price beside the current one (D82)', () => {
    const cart = toCart([row('a', { priceMinor: 1200 })]);
    expect(cart.sellers[0].lines[0]).toMatchObject({ addedUnitPriceMinor: 1000, currentUnitPriceMinor: 1200 });
  });
});
```

`apps/api/test/cart.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  CART_LINE_MAX_QUANTITY,
  CartLineAvailabilities,
  CartSchema,
  ErrorCodes,
  type Cart,
} from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { expectContract } from './support/contracts';
import {
  newTenant,
  productPayload,
  publishedProduct,
  registerAndLogin,
  tenantHeaders,
  unique,
} from './support/fixtures';
import { bearer } from './support/marketplace';

describe('cart (e2e)', () => {
  let app: INestApplication;
  let sellerA: Awaited<ReturnType<typeof newTenant>>;
  let sellerB: Awaited<ReturnType<typeof newTenant>>;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    sellerA = await newTenant(app, 'carta');
    sellerB = await newTenant(app, 'cartb');
  });

  afterAll(async () => {
    await app.close();
  });

  const newBuyer = () => registerAndLogin(app, `${unique('cartbuyer')}@marketcore.test`);
  const getCart = async (token: string): Promise<Cart> =>
    expectContract(CartSchema, (await request(server()).get('/api/v1/cart').set(bearer(token)).expect(200)).body);
  const setLine = (token: string, productId: string, quantity: unknown) =>
    request(server()).put(`/api/v1/cart/items/${productId}`).set(bearer(token)).send({ quantity });
  const sellerHeaders = (seller: typeof sellerA) => tenantHeaders(seller.accessToken, seller.organizationId);
  const stockOf = async (seller: typeof sellerA, productId: string): Promise<number> =>
    (await request(server()).get(`/api/v1/products/${productId}/inventory`).set(sellerHeaders(seller)).expect(200))
      .body.available;
  const lines = (cart: Cart) => cart.sellers.flatMap((group) => group.lines);

  it('creates an empty cart on first read (SRS-FR-CART-001)', async () => {
    expect(await getCart(await newBuyer())).toEqual({ sellers: [] });
  });

  it('holds two sellers in one cart and leaves both stocks alone (AC-US-CART-001-1)', async () => {
    const token = await newBuyer();
    const a = await publishedProduct(app, sellerA, { available: 5 });
    const b = await publishedProduct(app, sellerB, { available: 5 });

    await setLine(token, a.id, 1).expect(200);
    const cart = expectContract(CartSchema, (await setLine(token, b.id, 2).expect(200)).body);

    expect(cart.sellers.map((group) => group.seller.slug).sort()).toEqual([sellerA.slug, sellerB.slug].sort());
    expect(await stockOf(sellerA, a.id)).toBe(5);
    expect(await stockOf(sellerB, b.id)).toBe(5);
  });

  it('refuses an eleventh unit and keeps the line at 10 (AC-US-CART-001-2)', async () => {
    const token = await newBuyer();
    const a = await publishedProduct(app, sellerA, { available: 50 });

    await setLine(token, a.id, CART_LINE_MAX_QUANTITY).expect(200);
    const refused = await setLine(token, a.id, CART_LINE_MAX_QUANTITY + 1).expect(400);

    expect(refused.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(lines(await getCart(token))[0].quantity).toBe(CART_LINE_MAX_QUANTITY);
  });

  it.each([0, 2.5, '3'])('refuses quantity %p with 400', async (quantity) => {
    const a = await publishedProduct(app, sellerA);
    await setLine(await newBuyer(), a.id, quantity).expect(400);
  });

  it('flags "only N left" once stock drops below the quantity (AC-US-CART-002-1)', async () => {
    const token = await newBuyer();
    const a = await publishedProduct(app, sellerA, { available: 5 });
    await setLine(token, a.id, 2).expect(200);

    await request(server())
      .put(`/api/v1/products/${a.id}/inventory`)
      .set(sellerHeaders(sellerA))
      .send({ available: 1 })
      .expect(200);

    expect(lines(await getCart(token))[0]).toMatchObject({ available: 1, availability: CartLineAvailabilities.SHORT });
  });

  it('keeps a line that was unpublished, sold out and masked (SRS-FR-CART-007, D86)', async () => {
    const token = await newBuyer();
    const a = await publishedProduct(app, sellerA, { available: 5 });
    await setLine(token, a.id, 1).expect(200);

    await request(server()).post(`/api/v1/products/${a.id}/unpublish`).set(sellerHeaders(sellerA)).expect(204);

    expect(lines(await getCart(token))[0]).toMatchObject({
      productId: a.id,
      availability: CartLineAvailabilities.SOLD_OUT,
      available: 0,
      currentUnitPriceMinor: null,
    });
  });

  it('keeps the price a line was added at when the seller changes it (D82)', async () => {
    const token = await newBuyer();
    const a = await publishedProduct(app, sellerA, { priceMinor: 1000 });
    await setLine(token, a.id, 1).expect(200);

    await request(server())
      .patch(`/api/v1/products/${a.id}`)
      .set(sellerHeaders(sellerA))
      .send({ priceMinor: 1200 })
      .expect(204);
    await setLine(token, a.id, 2).expect(200); // a quantity change is not a price confirmation

    expect(lines(await getCart(token))[0]).toMatchObject({ addedUnitPriceMinor: 1000, currentUnitPriceMinor: 1200 });
  });

  it('refuses a draft or unknown product with 404 (SRS-FR-CART-003)', async () => {
    const token = await newBuyer();
    const draft = await request(server())
      .post('/api/v1/products')
      .set(sellerHeaders(sellerA))
      .send(productPayload())
      .expect(201);

    await setLine(token, draft.body.id, 1).expect(404);
    await setLine(token, '00000000-0000-4000-8000-000000000000', 1).expect(404);
  });

  it('PUT and DELETE are idempotent (SRS-FR-CART-002)', async () => {
    const token = await newBuyer();
    const a = await publishedProduct(app, sellerA);

    await setLine(token, a.id, 3).expect(200);
    await setLine(token, a.id, 3).expect(200);
    expect(lines(await getCart(token))).toHaveLength(1);

    await request(server()).delete(`/api/v1/cart/items/${a.id}`).set(bearer(token)).expect(200);
    const again = await request(server()).delete(`/api/v1/cart/items/${a.id}`).set(bearer(token)).expect(200);
    expect(again.body).toEqual({ sellers: [] });
  });

  it("another buyer can neither read nor change X's cart (AC-US-CART-002-2, INV-12)", async () => {
    const x = await newBuyer();
    const y = await newBuyer();
    const a = await publishedProduct(app, sellerA);
    await setLine(x, a.id, 2).expect(200);

    // There is no cart id on the wire (finding 4): Y's only handle is Y's own cart.
    expect(await getCart(y)).toEqual({ sellers: [] });
    await request(server()).delete(`/api/v1/cart/items/${a.id}`).set(bearer(y)).expect(200);
    await setLine(y, a.id, 5).expect(200);

    // Control: X still has exactly X's line, untouched by Y's writes.
    expect(lines(await getCart(x))).toEqual([expect.objectContaining({ productId: a.id, quantity: 2 })]);
    expect(lines(await getCart(y))).toEqual([expect.objectContaining({ productId: a.id, quantity: 5 })]);
  });

  it('requires a signed-in user', async () => {
    await request(server()).get('/api/v1/cart').expect(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api exec jest src/cart && pnpm --filter api test:e2e -- cart`
Expected: FAIL — `Cannot find module './cart.mapper'`; the e2e answers 404 for `/api/v1/cart`.

- [ ] **Step 3: Implement**

`apps/api/src/cart/interfaces/cart.interface.ts`:

```ts
import type { CurrencyCode, OrganizationStatus, ProductStatus } from '@app/contracts';

/** One cart line as the cart query reads it, joined to its product and seller. */
export interface CartLineRow {
  productId: string;
  quantity: number;
  addedUnitPriceMinor: number;
  product: {
    name: string;
    priceMinor: number;
    currency: CurrencyCode;
    status: ProductStatus;
    inventory: { available: number } | null;
    organization: { id: string; name: string; slug: string; status: OrganizationStatus };
  };
}
```

`apps/api/src/cart/cart.constants.ts`:

```ts
export const CartMessages = { PRODUCT_NOT_FOUND: 'Product not found' } as const;

export const CART_LINE_SELECT = {
  productId: true,
  quantity: true,
  addedUnitPriceMinor: true,
  product: {
    select: {
      name: true,
      priceMinor: true,
      currency: true,
      status: true,
      inventory: { select: { available: true } },
      organization: { select: { id: true, name: true, slug: true, status: true } },
    },
  },
} as const;

/** Lines in the order the buyer added them; the product id breaks a same-millisecond tie. */
export const CART_LINE_ORDER = [{ createdAt: 'asc' }, { productId: 'asc' }] as const;
```

`apps/api/src/cart/repositories/cart.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@app/database';
import { buyerScope, type BuyerContext } from '@app/domain';
import { PrismaService } from '@app/runtime';
import { PUBLIC_PRODUCT_WHERE } from '../../storefront/storefront.constants';
import { CART_LINE_ORDER, CART_LINE_SELECT } from '../cart.constants';
import type { CartLineRow } from '../interfaces/cart.interface';

/**
 * Every write here locks the buyer's cart row before touching a line (D83). The
 * checkout transaction takes the same row lock first, so a line cannot be added,
 * changed or removed between checkout reading the cart and emptying it. One order
 * everywhere — cart row, then lines — so the two can never deadlock.
 */
@Injectable()
export class CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the cart on first use (SRS-FR-CART-001). A native upsert: INSERT … ON CONFLICT. */
  async ensureCart(buyer: BuyerContext): Promise<void> {
    await this.prisma.cart.upsert({ where: buyerScope(buyer), update: {}, create: buyerScope(buyer) });
  }

  readLines(buyer: BuyerContext): Promise<CartLineRow[]> {
    return this.prisma.cartItem.findMany({
      where: { cart: buyerScope(buyer) },
      select: CART_LINE_SELECT,
      orderBy: [...CART_LINE_ORDER],
    });
  }

  /** A plain read: the cart never locks or writes Inventory (SRS-FR-CART-004). */
  findPublicPrice(productId: string): Promise<{ priceMinor: number } | null> {
    return this.prisma.product.findFirst({
      where: { id: productId, ...PUBLIC_PRODUCT_WHERE },
      select: { priceMinor: true },
    });
  }

  async setLine(buyer: BuyerContext, productId: string, quantity: number, priceMinor: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const cart = await this.touchCart(tx, buyer);
      await tx.cartItem.upsert({
        where: { cartId_productId: { cartId: cart.id, productId } },
        // Written once (D82): a quantity change is not a price confirmation.
        update: { quantity },
        create: { cartId: cart.id, productId, quantity, addedUnitPriceMinor: priceMinor },
      });
    });
  }

  async removeLine(buyer: BuyerContext, productId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const cart = await this.touchCart(tx, buyer);
      await tx.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
    });
  }

  /**
   * An upsert with an explicit `updatedAt`, so the row is written — and therefore
   * locked until commit — even when it already exists. `update: {}` lets Prisma
   * skip the UPDATE and take no lock.
   */
  private touchCart(tx: Prisma.TransactionClient, buyer: BuyerContext): Promise<{ id: string }> {
    return tx.cart.upsert({
      where: buyerScope(buyer),
      update: { updatedAt: new Date() },
      create: buyerScope(buyer),
      select: { id: true },
    });
  }
}
```

`apps/api/src/cart/cart.mapper.ts`:

```ts
import {
  CartSchema,
  OrganizationStatuses,
  ProductStatuses,
  type Cart,
  type CartLine,
  type Seller,
} from '@app/contracts';
import { cartLineAvailability, groupBySeller } from '@app/domain';
import type { CartLineRow } from './interfaces/cart.interface';

interface SellerLine {
  sellerId: string;
  seller: Seller;
  line: CartLine;
}

function toSellerLine(row: CartLineRow): SellerLine {
  const { product } = row;
  const purchasable =
    product.status === ProductStatuses.PUBLISHED &&
    product.organization.status === OrganizationStatuses.ACTIVE;
  // D86: a product that stopped being public reveals neither its price nor its stock.
  const available = purchasable ? (product.inventory?.available ?? 0) : 0;

  return {
    sellerId: product.organization.id,
    seller: { name: product.organization.name, slug: product.organization.slug },
    line: {
      productId: row.productId,
      name: product.name,
      quantity: row.quantity,
      currency: product.currency,
      addedUnitPriceMinor: row.addedUnitPriceMinor,
      currentUnitPriceMinor: purchasable ? product.priceMinor : null,
      available,
      availability: cartLineAvailability(row.quantity, available, purchasable),
    },
  };
}

export function toCart(rows: readonly CartLineRow[]): Cart {
  return CartSchema.parse({
    sellers: groupBySeller(rows.map(toSellerLine)).map((group) => ({
      seller: group.lines[0].seller,
      lines: group.lines.map((entry) => entry.line),
    })),
  });
}
```

`apps/api/src/cart/cart.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Cart } from '@app/contracts';
import type { BuyerContext } from '@app/domain';
import { CartMessages } from './cart.constants';
import { toCart } from './cart.mapper';
import { CartRepository } from './repositories/cart.repository';

@Injectable()
export class CartService {
  constructor(private readonly cartRepository: CartRepository) {}

  async get(buyer: BuyerContext): Promise<Cart> {
    await this.cartRepository.ensureCart(buyer);
    return toCart(await this.cartRepository.readLines(buyer));
  }

  /** 404 for a product that is not public (SRS-FR-CART-003); stock is not checked (D58). */
  async setLine(buyer: BuyerContext, productId: string, quantity: number): Promise<Cart> {
    const product = await this.cartRepository.findPublicPrice(productId);
    if (product === null) throw new NotFoundException(CartMessages.PRODUCT_NOT_FOUND);
    await this.cartRepository.setLine(buyer, productId, quantity, product.priceMinor);
    return this.get(buyer);
  }

  async removeLine(buyer: BuyerContext, productId: string): Promise<Cart> {
    await this.cartRepository.removeLine(buyer, productId);
    return this.get(buyer);
  }
}
```

`apps/api/src/cart/dto/cart.dto.ts`:

```ts
import { createZodDto } from 'nestjs-zod';
import { CartSchema, SetCartLineRequestSchema } from '@app/contracts';

export class CartDto extends createZodDto(CartSchema) {}
export class SetCartLineRequestDto extends createZodDto(SetCartLineRequestSchema) {}
```

`apps/api/src/cart/cart.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import type { Cart } from '@app/contracts';
import type { BuyerContext } from '@app/domain';
import { Buyer } from '../security/decorators/buyer.decorator';
import { TenantFree } from '../security/decorators/tenant-free.decorator';
import { CartService } from './cart.service';
import { CartDto, SetCartLineRequestDto } from './dto/cart.dto';

/** The caller's own cart. The route names no cart: the buyer is the resource (finding 4). */
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @TenantFree()
  @ApiOkResponse({ type: CartDto })
  get(@Buyer() buyer: BuyerContext): Promise<Cart> {
    return this.cartService.get(buyer);
  }

  @Put('items/:productId')
  @TenantFree()
  @ApiOkResponse({ type: CartDto })
  setLine(
    @Buyer() buyer: BuyerContext,
    @Param('productId') productId: string,
    @Body() body: SetCartLineRequestDto,
  ): Promise<Cart> {
    return this.cartService.setLine(buyer, productId, body.quantity);
  }

  @Delete('items/:productId')
  @TenantFree()
  @ApiOkResponse({ type: CartDto })
  removeLine(@Buyer() buyer: BuyerContext, @Param('productId') productId: string): Promise<Cart> {
    return this.cartService.removeLine(buyer, productId);
  }
}
```

`apps/api/src/cart/cart.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartRepository } from './repositories/cart.repository';

@Module({ controllers: [CartController], providers: [CartRepository, CartService] })
export class CartModule {}
```

`apps/api/src/app.module.ts` — add `CartModule` to `imports`, before `SecurityModule`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter api exec jest && pnpm --filter api test:e2e`
Expected: PASS — mapper 4 cases; `cart.e2e-spec` 13 cases (10 `it` plus a 3-row `it.each`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cart apps/api/src/app.module.ts apps/api/test/cart.e2e-spec.ts
git commit -m "feat(cart): one server-side cart per buyer, live availability, seller groups"
```

---
### Task 12: Retryable transactions, proven against a real deadlock

**Files:**
- Create: `apps/api/src/common/database/database.constants.ts`,
  `apps/api/src/common/database/retryable-transaction.ts`,
  `apps/api/src/common/database/retryable-transaction.spec.ts`,
  `apps/api/src/common/interfaces/retry.interface.ts`,
  `apps/api/test/integration/deadlock.integration-spec.ts`

**Interfaces:**
- Consumes: `Prisma` from `@app/database`; `createSeller`, `createProduct` (Task 6).
- Produces: `isRetryableTransactionError(error: unknown): boolean`;
  `withTransactionRetry<T>(run: () => Promise<T>, options: RetryOptions): Promise<T>`;
  `RetryOptions { retries: number; baseDelayMs: number; sleep?: (ms: number) => Promise<void>; random?: () => number; onRetry?: (attempt: number, error: unknown) => void }`;
  constants `TRANSACTION_RETRIES = 3`, `TRANSACTION_RETRY_BASE_DELAY_MS = 15`,
  `INTERACTIVE_TRANSACTION_MAX_WAIT_MS = 10_000`, `INTERACTIVE_TRANSACTION_TIMEOUT_MS = 10_000`,
  `RETRYABLE_SQLSTATES`, `PrismaErrorCodes`.

**What SRS §8 asks and what is not known (finding 24).** "A deadlock or serialization failure is
retried up to 3 times with jitter." Postgres names those failures `40P01` and `40001`; how Prisma 6
surfaces them from an interactive transaction is not documented as a contract — `P2034` for a write
conflict, or `P2010` (raw query failed) carrying the SQLSTATE in `meta.code` when the failing
statement is a `$queryRaw`. The classifier accepts both, and Step 1's integration case manufactures
a real deadlock so the mapping is a measured fact, not a guess. If that case fails, print the
rejection, fix the classifier to the observed shape, and record the shape in the defect table.

**Why retries are defensive here.** Task 13 takes every lock in one global order (cart row, then
inventory by `productId`), and the worker takes inventory in the same order, so a deadlock cycle
should be impossible. Task 15 asserts zero retries under contention; the retry exists for the case
that assertion is wrong in production, not to make it pass.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/common/database/retryable-transaction.spec.ts`:

```ts
import { Prisma } from '@app/database';
import { isRetryableTransactionError, withTransactionRetry } from './retryable-transaction';

const known = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test', meta });

describe('isRetryableTransactionError', () => {
  it('accepts a transaction write conflict or deadlock (P2034)', () => {
    expect(isRetryableTransactionError(known('P2034'))).toBe(true);
  });
  it('accepts a raw query that failed with a deadlock or serialization SQLSTATE', () => {
    expect(isRetryableTransactionError(known('P2010', { code: '40P01' }))).toBe(true);
    expect(isRetryableTransactionError(known('P2010', { code: '40001' }))).toBe(true);
  });
  it('refuses everything else, including a unique violation and a CHECK violation', () => {
    expect(isRetryableTransactionError(known('P2002'))).toBe(false);
    expect(isRetryableTransactionError(known('P2010', { code: '23514' }))).toBe(false);
    expect(isRetryableTransactionError(new Error('40P01'))).toBe(false);
  });
});

describe('withTransactionRetry', () => {
  const options = { retries: 3, baseDelayMs: 10, sleep: jest.fn(async () => undefined), random: () => 0.5 };

  it('retries a retryable failure and returns the eventual result', async () => {
    const run = jest.fn().mockRejectedValueOnce(known('P2034')).mockResolvedValueOnce('ok');
    const onRetry = jest.fn();

    await expect(withTransactionRetry(run, { ...options, onRetry })).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Prisma.PrismaClientKnownRequestError));
  });

  it('gives up after 3 retries — 4 attempts — and rethrows the last failure', async () => {
    const run = jest.fn().mockRejectedValue(known('P2034'));

    await expect(withTransactionRetry(run, options)).rejects.toMatchObject({ code: 'P2034' });
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('never retries a non-retryable failure', async () => {
    const run = jest.fn().mockRejectedValue(known('P2002'));

    await expect(withTransactionRetry(run, options)).rejects.toMatchObject({ code: 'P2002' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('waits a jittered, growing delay between attempts', async () => {
    const sleep = jest.fn(async () => undefined);
    const run = jest.fn().mockRejectedValue(known('P2034'));

    await expect(withTransactionRetry(run, { ...options, sleep })).rejects.toBeDefined();
    // random() = 0.5 → half of 10, 20, 40.
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([5, 10, 20]);
  });
});
```

`apps/api/test/integration/deadlock.integration-spec.ts`:

```ts
import { afterAll, describe, expect, it } from '@jest/globals';
import { Prisma } from '@app/database';
import { isRetryableTransactionError } from '../../src/common/database/retryable-transaction';
import { testPrisma } from '../support/db';
import { createProduct, createSeller } from '../support/marketplace';

const TX = { maxWait: 10_000, timeout: 15_000 };

afterAll(async () => {
  await testPrisma.$disconnect();
});

/**
 * The "forced lock-order test" failure-scenarios §1 promises for a database
 * deadlock: two transactions take the same two rows in opposite orders, so
 * Postgres must kill one. What Prisma raises for the victim is the fact the
 * retry classifier is written against.
 */
describe('a forced deadlock', () => {
  it('kills exactly one transaction, and the classifier calls it retryable', async () => {
    const seller = await createSeller('deadlock');
    const a = await createProduct(seller.organizationId);
    const b = await createProduct(seller.organizationId);

    let arrived = 0;
    let release!: () => void;
    const bothHoldOne = new Promise<void>((resolve) => (release = resolve));
    const meet = async () => {
      arrived += 1;
      if (arrived === 2) release();
      await bothHoldOne;
    };

    const lockInOrder = (first: string, second: string) =>
      testPrisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM inventory WHERE "productId" = ${first} FOR UPDATE`;
        await meet();
        await tx.$queryRaw`SELECT 1 FROM inventory WHERE "productId" = ${second} FOR UPDATE`;
      }, TX);

    const results = await Promise.allSettled([lockInOrder(a.id, b.id), lockInOrder(b.id, a.id)]);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    expect(rejected).toHaveLength(1);
    const reason = rejected[0].reason as { code?: string; meta?: unknown };
    // If this fails, the printed code/meta is what Prisma 6 really raises: fix the
    // classifier to it. Never loosen this assertion.
    expect({ retryable: isRetryableTransactionError(reason), code: reason.code, meta: reason.meta }).toMatchObject({
      retryable: true,
    });
  });

  it('the cure: the same two transactions locking in one sorted statement both commit', async () => {
    const seller = await createSeller('nodeadlock');
    const a = await createProduct(seller.organizationId);
    const b = await createProduct(seller.organizationId);

    const lockSorted = (ids: string[]) =>
      testPrisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT 1 FROM inventory WHERE "productId" IN (${Prisma.join(ids)})
          ORDER BY "productId" COLLATE "C" FOR UPDATE`;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }, TX);

    const results = await Promise.allSettled([lockSorted([a.id, b.id]), lockSorted([b.id, a.id])]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api exec jest src/common/database && pnpm --filter api test:integration -- deadlock`
Expected: FAIL — `Cannot find module './retryable-transaction'` in both.

- [ ] **Step 3: Implement**

`apps/api/src/common/interfaces/retry.interface.ts`:

```ts
export interface RetryOptions {
  /** Retries after the first attempt; SRS §8 says 3. */
  retries: number;
  baseDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (attempt: number, error: unknown) => void;
}
```

`apps/api/src/common/database/database.constants.ts`:

```ts
/** SRS §8: a deadlock or serialization failure is retried up to 3 times. */
export const TRANSACTION_RETRIES = 3;

/** The first retry's jitter ceiling; it doubles per attempt. */
export const TRANSACTION_RETRY_BASE_DELAY_MS = 15;

/**
 * How long an interactive transaction may wait for a pooled connection, and run.
 * Prisma's defaults (2 s / 5 s) are sized for one request; 100 checkouts queued
 * on a pool of ~2×CPU+1 connections can wait longer than 2 s for a connection
 * without anything being wrong, and would fail with P2028 instead of a 409.
 */
export const INTERACTIVE_TRANSACTION_MAX_WAIT_MS = 10_000;
export const INTERACTIVE_TRANSACTION_TIMEOUT_MS = 10_000;

/** deadlock_detected, serialization_failure. */
export const RETRYABLE_SQLSTATES = ['40P01', '40001'] as const;

export const PrismaErrorCodes = {
  /** "Transaction failed due to a write conflict or a deadlock." */
  TRANSACTION_CONFLICT: 'P2034',
  /** "Raw query failed" — the SQLSTATE is in `meta.code`. */
  RAW_QUERY_FAILED: 'P2010',
} as const;
```

`apps/api/src/common/database/retryable-transaction.ts`:

```ts
import { Prisma } from '@app/database';
import type { RetryOptions } from '../interfaces/retry.interface';
import { PrismaErrorCodes, RETRYABLE_SQLSTATES } from './database.constants';

export function isRetryableTransactionError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === PrismaErrorCodes.TRANSACTION_CONFLICT) return true;
  if (error.code !== PrismaErrorCodes.RAW_QUERY_FAILED) return false;

  const sqlState = (error.meta as { code?: unknown } | undefined)?.code;
  return typeof sqlState === 'string' && (RETRYABLE_SQLSTATES as readonly string[]).includes(sqlState);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs a whole transaction again when Postgres aborted it as a deadlock victim or
 * a serialization failure. The transaction is the unit retried — never a single
 * statement inside it, because the abort already rolled every statement back.
 */
export async function withTransactionRetry<T>(run: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= options.retries || !isRetryableTransactionError(error)) throw error;
      options.onRetry?.(attempt + 1, error);
      // Full jitter: two transactions that just deadlocked must not retry in lockstep.
      await sleep(Math.round(random() * options.baseDelayMs * 2 ** attempt));
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter api exec jest src/common/database && pnpm --filter api test:integration -- deadlock`
Expected: PASS — 7 unit cases; 2 integration cases, the first taking about one second (Postgres's
default `deadlock_timeout`). Record in the defect table which Prisma code the victim carried.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/database apps/api/src/common/interfaces/retry.interface.ts apps/api/test/integration/deadlock.integration-spec.ts
git commit -m "feat(api): bounded, jittered retry for deadlocked transactions, proven on a forced deadlock"
```

---

### Task 13: `CheckoutRepository.place` — every seller's order, or none

**Files:**
- Create: `apps/api/src/orders/orders.constants.ts`, `apps/api/src/orders/interfaces/checkout.interface.ts`,
  `apps/api/src/orders/repositories/checkout.repository.ts`, `apps/api/test/support/logger.ts`,
  `apps/api/test/integration/checkout.integration-spec.ts`
- Modify: `packages/runtime/src/constants.ts`

**Interfaces:**
- Consumes: Task 3's rules (`evaluateCheckoutLines`, `sameLines`, `groupBySeller`, `sumLineTotals`,
  `byLockOrder`), Task 12's `withTransactionRetry` and constants, Task 11's cart-row-first invariant.
- Produces:
  - `CheckoutRepository.place(buyer: BuyerContext, lines: readonly ConfirmedLine[]): Promise<PlaceCheckoutOutcome>`
  - `CheckoutRepository.currenciesOf(productIds: readonly string[]): Promise<CurrencyCode[]>` — a
    plain, non-locking read
  - `CheckoutRepository.findForBuyer(buyer: BuyerContext, id: string): Promise<CheckoutRecord | null>`
  - `PlaceCheckoutOutcomes` (`PLACED`, `REJECTED`, `CART_CHANGED`) and the
    `PlaceCheckoutOutcome` union; `CheckoutRecord`; `ORDERS_LOGGER` token
  - `LogEvents.CHECKOUT_PLACED = 'checkout.placed'`, `CHECKOUT_REJECTED = 'checkout.rejected'`,
    `CHECKOUT_TRANSACTION_RETRIED = 'checkout.transaction.retried'` in `@app/runtime`
  - `captureLogger()` test helper returning a `LoggerService` with a `lines` array

**The transaction (SRS-FR-CHK-002 … 004, 006, 007; INV-11).**

1. `SELECT id FROM carts WHERE "buyerId" = $1 FOR UPDATE` — the buyer's cart row, first (D83).
2. Read the cart's lines; if they are not the confirmed lines, return `CART_CHANGED` (FR-CHK-006).
3. `SELECT "productId", available FROM inventory WHERE "productId" IN (…) ORDER BY "productId" COLLATE "C" FOR UPDATE`
   — every inventory row in one statement, in lock order (RULE-CHK-002).
4. Re-read price, status and seller of every product *after* the locks.
5. `evaluateCheckoutLines` decides. Any conflict → return `REJECTED`. Nothing has been written, so
   committing the read-only transaction leaves stock, orders and the cart unchanged.
6. Decrement each line, insert one `Checkout`, one `Order` per seller with snapshotted items, delete
   the cart's lines (FR-CHK-007). One commit.

**The one cross-module write (finding 16).** Steps 1–6 touch `carts`, `cart_items` and `inventory`,
which other modules own. Architecture rule 4 forbids writing another module's tables "without an
explicit application boundary"; the boundary here is this repository and its transaction. The
alternative — passing a `Prisma.TransactionClient` through `CartService` and a catalog service —
puts a Prisma type in three services, which the layering rule calls a defect. The gate task records
the exception in `docs/architecture.md`.

- [ ] **Step 1: Write the failing test**

`apps/api/test/support/logger.ts`:

```ts
import type { LoggerService } from '@nestjs/common';

export interface CapturedLine {
  level: string;
  event: unknown;
  fields: Record<string, unknown>;
}

/** A LoggerService that remembers what it was told, for asserting structured log lines. */
export function captureLogger(): LoggerService & { lines: CapturedLine[] } {
  const lines: CapturedLine[] = [];
  const at =
    (level: string) =>
    (message: unknown, ...params: unknown[]) => {
      const fields = Object.assign(
        {},
        ...params.filter((param) => param !== null && typeof param === 'object' && !Array.isArray(param)),
      ) as Record<string, unknown>;
      lines.push({ level, event: message, fields });
    };
  return { lines, log: at('log'), error: at('error'), warn: at('warn'), debug: at('debug'), verbose: at('verbose') };
}
```

`apps/api/test/integration/checkout.integration-spec.ts`:

```ts
import { afterAll, describe, expect, it } from '@jest/globals';
import {
  CheckoutConflictReasons,
  CheckoutStatuses,
  OrderStatuses,
  ProductStatuses,
} from '@app/contracts';
import { buildBuyerContext } from '@app/domain';
import type { PrismaService } from '@app/runtime';
import { PlaceCheckoutOutcomes } from '../../src/orders/orders.constants';
import { CheckoutRepository } from '../../src/orders/repositories/checkout.repository';
import { testPrisma } from '../support/db';
import { captureLogger } from '../support/logger';
import {
  availableOf,
  cartWith,
  createBuyer,
  createProduct,
  createSeller,
  type ProductFixture,
} from '../support/marketplace';

afterAll(async () => {
  await testPrisma.$disconnect();
});

const repository = new CheckoutRepository(testPrisma as unknown as PrismaService, captureLogger());

const confirmed = (product: ProductFixture, quantity: number, unitPriceMinor = product.priceMinor) => ({
  productId: product.id,
  quantity,
  unitPriceMinor,
});

async function threeSellerCart(stock: [number, number, number], quantities: [number, number, number]) {
  const sellers = await Promise.all(['chka', 'chkb', 'chkc'].map(createSeller));
  const products = await Promise.all(
    sellers.map((seller, i) =>
      createProduct(seller.organizationId, { priceMinor: [24_900, 18_900, 5_000][i], available: stock[i] }),
    ),
  );
  const buyer = await createBuyer();
  await cartWith(
    buyer.id,
    products.map((product, i) => ({ productId: product.id, quantity: quantities[i], addedUnitPriceMinor: product.priceMinor })),
  );
  const lines = products.map((product, i) => confirmed(product, quantities[i]));
  return { sellers, products, buyer, lines, context: buildBuyerContext(buyer.id) };
}

const snapshot = async (buyerId: string, productIds: string[]) => ({
  checkouts: await testPrisma.checkout.count({ where: { buyerId } }),
  orders: await testPrisma.order.count({ where: { buyerId } }),
  stock: await Promise.all(productIds.map(availableOf)),
  cart: await testPrisma.cartItem.findMany({
    where: { cart: { buyerId } },
    select: { productId: true, quantity: true },
    orderBy: { productId: 'asc' },
  }),
});

describe('CheckoutRepository.place', () => {
  it('three sellers → one checkout, three orders, stock decremented, cart emptied (AC-US-CHK-002-1)', async () => {
    const { sellers, products, buyer, lines, context } = await threeSellerCart([5, 5, 5], [1, 2, 3]);

    const outcome = await repository.place(context, lines);

    expect(outcome.kind).toBe(PlaceCheckoutOutcomes.PLACED);
    const checkouts = await testPrisma.checkout.findMany({
      where: { buyerId: buyer.id },
      include: { orders: { include: { items: true } } },
    });
    expect(checkouts).toHaveLength(1);
    const [checkout] = checkouts;
    expect(checkout.status).toBe(CheckoutStatuses.PENDING_PAYMENT);
    expect(checkout.orders).toHaveLength(3);
    expect(checkout.orders.map((order) => order.organizationId).sort()).toEqual(
      sellers.map((seller) => seller.organizationId).sort(),
    );
    expect(checkout.orders.every((order) => order.status === OrderStatuses.PENDING_PAYMENT)).toBe(true);
    // INV-13's precondition: the orders sum to the checkout.
    expect(checkout.orders.reduce((sum, order) => sum + order.totalMinor, 0)).toBe(checkout.totalMinor);
    expect(checkout.totalMinor).toBe(24_900 * 1 + 18_900 * 2 + 5_000 * 3);
    // Snapshots (PRD-FR-CHK-005, D90).
    const items = checkout.orders.flatMap((order) => order.items);
    for (const product of products) {
      expect(items.find((item) => item.productId === product.id)).toMatchObject({
        unitPriceMinor: product.priceMinor,
        productName: product.name,
      });
    }
    expect(await Promise.all(products.map((product) => availableOf(product.id)))).toEqual([4, 3, 2]);
    expect(await testPrisma.cartItem.count({ where: { cart: { buyerId: buyer.id } } })).toBe(0);
  });

  it("one seller's line short by one → nothing at all changes (AC-US-CHK-002-2, INV-11)", async () => {
    // Seller C has 2 and the buyer wants 3: short by exactly one unit.
    const { products, buyer, lines, context } = await threeSellerCart([5, 5, 2], [1, 1, 3]);
    const before = await snapshot(buyer.id, products.map((p) => p.id));

    const outcome = await repository.place(context, lines);

    expect(outcome).toEqual({
      kind: PlaceCheckoutOutcomes.REJECTED,
      conflicts: [
        { productId: products[2].id, reason: CheckoutConflictReasons.SHORT, available: 2, currentUnitPriceMinor: 5_000 },
      ],
    });
    const after = await snapshot(buyer.id, products.map((p) => p.id));
    expect(after).toEqual(before);
    expect(after.checkouts).toBe(0);
    expect(after.orders).toBe(0);
    expect(after.stock).toEqual([5, 5, 2]);
    expect(after.cart).toHaveLength(3);
  });

  it('reports every failing line, not only the first (SRS-FR-CHK-003)', async () => {
    const { products, buyer, context } = await threeSellerCart([0, 5, 5], [1, 1, 1]);
    const lines = [confirmed(products[0], 1), confirmed(products[1], 1, 999), confirmed(products[2], 1)];

    const outcome = await repository.place(context, lines);

    expect(outcome.kind).toBe(PlaceCheckoutOutcomes.REJECTED);
    if (outcome.kind !== PlaceCheckoutOutcomes.REJECTED) throw new Error('unreachable');
    expect(outcome.conflicts.map((c) => [c.productId, c.reason])).toEqual([
      [products[0].id, CheckoutConflictReasons.SOLD_OUT],
      [products[1].id, CheckoutConflictReasons.PRICE_CHANGED],
    ]);
    expect(await testPrisma.checkout.count({ where: { buyerId: buyer.id } })).toBe(0);
  });

  it('a line that stopped being public is SOLD_OUT and masked (D86)', async () => {
    const { products, lines, context } = await threeSellerCart([5, 5, 5], [1, 1, 1]);
    await testPrisma.product.update({ where: { id: products[1].id }, data: { status: ProductStatuses.DRAFT } });

    const outcome = await repository.place(context, lines);

    expect(outcome).toEqual({
      kind: PlaceCheckoutOutcomes.REJECTED,
      conflicts: [{ productId: products[1].id, reason: CheckoutConflictReasons.SOLD_OUT, available: 0, currentUnitPriceMinor: null }],
    });
  });

  it('two products of one seller make one order with two items (D56)', async () => {
    const seller = await createSeller('oneseller');
    const first = await createProduct(seller.organizationId);
    const second = await createProduct(seller.organizationId);
    const buyer = await createBuyer();
    await cartWith(buyer.id, [
      { productId: first.id, quantity: 1, addedUnitPriceMinor: first.priceMinor },
      { productId: second.id, quantity: 1, addedUnitPriceMinor: second.priceMinor },
    ]);

    await repository.place(buildBuyerContext(buyer.id), [confirmed(first, 1), confirmed(second, 1)]);

    const orders = await testPrisma.order.findMany({ where: { buyerId: buyer.id }, include: { items: true } });
    expect(orders).toHaveLength(1);
    expect(orders[0].items).toHaveLength(2);
  });

  it('refuses lines that are not the cart, and writes nothing (SRS-FR-CHK-006)', async () => {
    const { products, buyer, context } = await threeSellerCart([5, 5, 5], [1, 1, 1]);
    const before = await snapshot(buyer.id, products.map((p) => p.id));

    expect(await repository.place(context, [confirmed(products[0], 2)])).toEqual({ kind: PlaceCheckoutOutcomes.CART_CHANGED });
    expect(await snapshot(buyer.id, products.map((p) => p.id))).toEqual(before);
  });

  it('refuses a buyer who has no cart at all', async () => {
    const seller = await createSeller('nocart');
    const product = await createProduct(seller.organizationId);
    const buyer = await createBuyer();

    expect(await repository.place(buildBuyerContext(buyer.id), [confirmed(product, 1)])).toEqual({
      kind: PlaceCheckoutOutcomes.CART_CHANGED,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter api test:integration -- checkout`
Expected: FAIL — `Cannot find module '../../src/orders/orders.constants'`.

- [ ] **Step 3: Implement**

Append to `LogEvents` in `packages/runtime/src/constants.ts`:

```ts
export const LogEvents = {
  HTTP_REQUEST_COMPLETED: 'http.request.completed',
  /** SRS-NFR-OBS-001: one line per checkout outcome, carrying the request id. */
  CHECKOUT_PLACED: 'checkout.placed',
  CHECKOUT_REJECTED: 'checkout.rejected',
  /** A deadlock or serialization victim being retried (SRS §8). Expected to be zero. */
  CHECKOUT_TRANSACTION_RETRIED: 'checkout.transaction.retried',
} as const;
```

`apps/api/src/orders/orders.constants.ts`:

```ts
/** DI token for the orders module's structured logger, the AUTH_LOGGER pattern. */
export const ORDERS_LOGGER = 'ORDERS_LOGGER';

export const PlaceCheckoutOutcomes = {
  PLACED: 'PLACED',
  REJECTED: 'REJECTED',
  CART_CHANGED: 'CART_CHANGED',
} as const;

/** Human-facing. Clients branch on `code` and `details`, never on these. */
export const CheckoutMessages = {
  LINES_CONFLICT: 'Some lines cannot be ordered as confirmed',
  CART_CHANGED: 'The cart changed since it was reviewed',
  MIXED_CURRENCY: 'A checkout holds one currency',
  CONTENDED: 'Checkout is busy; try again',
  NOT_FOUND: 'Checkout not found',
} as const;

export const BuyerOrderMessages = { NOT_FOUND: 'Order not found' } as const;

/** Reasons logged for refusals that are not line conflicts. */
export const CheckoutLogReasons = { MIXED_CURRENCY: 'MIXED_CURRENCY', CONTENDED: 'CONTENDED' } as const;

export const LOCKED_PRODUCT_SELECT = {
  id: true,
  name: true,
  priceMinor: true,
  currency: true,
  status: true,
  organization: { select: { id: true, status: true } },
} as const;

export const ORDER_ITEM_SELECT = {
  productId: true,
  productName: true,
  quantity: true,
  unitPriceMinor: true,
} as const;

export const CHECKOUT_SELECT = {
  id: true,
  status: true,
  totalMinor: true,
  currency: true,
  placedAt: true,
  orders: {
    select: {
      id: true,
      status: true,
      totalMinor: true,
      currency: true,
      organization: { select: { name: true, slug: true } },
      items: { select: ORDER_ITEM_SELECT, orderBy: { productId: 'asc' } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} as const;
```

`apps/api/src/orders/interfaces/checkout.interface.ts`:

```ts
import type {
  CheckoutStatus,
  CurrencyCode,
  OrderStatus,
  OrganizationStatus,
  ProductStatus,
} from '@app/contracts';
import type { LineConflict } from '@app/domain';
import type { PlaceCheckoutOutcomes } from '../orders.constants';

export type PlaceCheckoutOutcome =
  | { kind: typeof PlaceCheckoutOutcomes.PLACED; checkoutId: string }
  | { kind: typeof PlaceCheckoutOutcomes.REJECTED; conflicts: LineConflict[] }
  | { kind: typeof PlaceCheckoutOutcomes.CART_CHANGED };

/** A product as the checkout transaction re-reads it after the inventory locks. */
export interface LockedProductRow {
  id: string;
  name: string;
  priceMinor: number;
  currency: CurrencyCode;
  status: ProductStatus;
  organization: { id: string; status: OrganizationStatus };
}

export interface OrderItemRecord {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceMinor: number;
}

export interface CheckoutOrderRecord {
  id: string;
  status: OrderStatus;
  totalMinor: number;
  currency: CurrencyCode;
  organization: { name: string; slug: string };
  items: OrderItemRecord[];
}

export interface CheckoutRecord {
  id: string;
  status: CheckoutStatus;
  totalMinor: number;
  currency: CurrencyCode;
  placedAt: Date;
  orders: CheckoutOrderRecord[];
}
```

`apps/api/src/orders/repositories/checkout.repository.ts`:

```ts
import { Inject, Injectable, type LoggerService } from '@nestjs/common';
import { Prisma } from '@app/database';
import {
  OrganizationStatuses,
  ProductStatuses,
  type CurrencyCode,
} from '@app/contracts';
import {
  buyerScope,
  byLockOrder,
  evaluateCheckoutLines,
  groupBySeller,
  sameLines,
  sumLineTotals,
  type BuyerContext,
  type ConfirmedLine,
  type LockedLineState,
} from '@app/domain';
import { LogEvents, PrismaService } from '@app/runtime';
import {
  INTERACTIVE_TRANSACTION_MAX_WAIT_MS,
  INTERACTIVE_TRANSACTION_TIMEOUT_MS,
  TRANSACTION_RETRIES,
  TRANSACTION_RETRY_BASE_DELAY_MS,
} from '../../common/database/database.constants';
import { withTransactionRetry } from '../../common/database/retryable-transaction';
import type {
  CheckoutRecord,
  LockedProductRow,
  PlaceCheckoutOutcome,
} from '../interfaces/checkout.interface';
import {
  CHECKOUT_SELECT,
  LOCKED_PRODUCT_SELECT,
  ORDERS_LOGGER,
  PlaceCheckoutOutcomes,
} from '../orders.constants';

const isPurchasable = (product: LockedProductRow): boolean =>
  product.status === ProductStatuses.PUBLISHED &&
  product.organization.status === OrganizationStatuses.ACTIVE;

/**
 * The checkout transaction (SRS-FR-CHK-002 … 007). It owns the one write that
 * spans modules — inventory, the cart and the new orders commit together or not
 * at all (INV-11; finding 16 records why the boundary is this repository).
 *
 * Lock order is global and fixed: the buyer's cart row, then inventory rows by
 * productId under COLLATE "C". The cart routes and the worker take the same order,
 * so no two transactions can each hold a row the other is waiting for.
 */
@Injectable()
export class CheckoutRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ORDERS_LOGGER) private readonly logger: LoggerService,
  ) {}

  /** A plain read, taken before any lock (SRS-FR-CHK-005). */
  async currenciesOf(productIds: readonly string[]): Promise<CurrencyCode[]> {
    const rows = await this.prisma.product.findMany({
      where: { id: { in: [...productIds] } },
      select: { currency: true },
    });
    return rows.map((row) => row.currency);
  }

  place(buyer: BuyerContext, lines: readonly ConfirmedLine[]): Promise<PlaceCheckoutOutcome> {
    return withTransactionRetry(
      () =>
        this.prisma.$transaction((tx) => this.placeWithin(tx, buyer, lines), {
          maxWait: INTERACTIVE_TRANSACTION_MAX_WAIT_MS,
          timeout: INTERACTIVE_TRANSACTION_TIMEOUT_MS,
        }),
      {
        retries: TRANSACTION_RETRIES,
        baseDelayMs: TRANSACTION_RETRY_BASE_DELAY_MS,
        onRetry: (attempt) =>
          this.logger.warn(LogEvents.CHECKOUT_TRANSACTION_RETRIED, { attempt, buyerId: buyer.buyerId }),
      },
    );
  }

  findForBuyer(buyer: BuyerContext, id: string): Promise<CheckoutRecord | null> {
    return this.prisma.checkout.findFirst({
      where: { id, ...buyerScope(buyer) },
      select: CHECKOUT_SELECT,
    });
  }

  private async placeWithin(
    tx: Prisma.TransactionClient,
    buyer: BuyerContext,
    lines: readonly ConfirmedLine[],
  ): Promise<PlaceCheckoutOutcome> {
    // 1. The cart row first (D83): every cart write takes it too, so the lines read
    //    next cannot change before they are deleted in step 6.
    const [cart] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM carts WHERE "buyerId" = ${buyer.buyerId} FOR UPDATE`;
    if (cart === undefined) return { kind: PlaceCheckoutOutcomes.CART_CHANGED };

    // 2. The request must be the cart (SRS-FR-CHK-006).
    const cartLines = await tx.cartItem.findMany({
      where: { cartId: cart.id },
      select: { productId: true, quantity: true },
    });
    if (!sameLines(cartLines, lines)) return { kind: PlaceCheckoutOutcomes.CART_CHANGED };

    // 3. Every inventory row, one statement, in lock order (RULE-CHK-002).
    const productIds = lines.map((line) => line.productId);
    const stock = await tx.$queryRaw<{ productId: string; available: number }[]>`
      SELECT "productId", available FROM inventory
      WHERE "productId" IN (${Prisma.join(productIds)})
      ORDER BY "productId" COLLATE "C"
      FOR UPDATE`;

    // 4. Price, status and seller re-read after the locks: what is decided is what is true now.
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: LOCKED_PRODUCT_SELECT,
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    const availableById = new Map(stock.map((row) => [row.productId, row.available]));
    const state = new Map<string, LockedLineState>(
      products.map((product) => [
        product.id,
        {
          productId: product.id,
          purchasable: isPurchasable(product),
          available: availableById.get(product.id) ?? 0,
          currentUnitPriceMinor: product.priceMinor,
        },
      ]),
    );

    // 5. The decision is pure and lives in @app/domain. Nothing has been written yet,
    //    so a rejection commits a read-only transaction: no stock, order or cart change.
    const conflicts = evaluateCheckoutLines(lines, state);
    if (conflicts.length > 0) return { kind: PlaceCheckoutOutcomes.REJECTED, conflicts };

    // 6. Every write, in one commit.
    const productFor = (productId: string): LockedProductRow => {
      const product = productById.get(productId);
      if (product === undefined) throw new Error(`checkout passed a line with no product: ${productId}`);
      return product;
    };

    for (const line of [...lines].sort((a, b) => byLockOrder(a.productId, b.productId))) {
      await tx.inventory.update({
        where: { productId: line.productId },
        data: { available: { decrement: line.quantity } },
      });
    }

    // One currency is guaranteed: the service refused a mixed request before any
    // lock (SRS-FR-CHK-005), and a product's currency cannot be changed.
    const currency = productFor(lines[0].productId).currency;
    const checkout = await tx.checkout.create({
      data: { buyerId: buyer.buyerId, totalMinor: sumLineTotals(lines), currency },
      select: { id: true },
    });

    const sellerLines = lines.map((line) => {
      const product = productFor(line.productId);
      return { ...line, sellerId: product.organization.id, productName: product.name };
    });
    for (const group of groupBySeller(sellerLines)) {
      await tx.order.create({
        data: {
          checkoutId: checkout.id,
          organizationId: group.sellerId,
          buyerId: buyer.buyerId,
          totalMinor: sumLineTotals(group.lines),
          currency,
          items: {
            create: group.lines.map((line) => ({
              productId: line.productId,
              productName: line.productName,
              quantity: line.quantity,
              unitPriceMinor: line.unitPriceMinor,
            })),
          },
        },
      });
    }

    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    return { kind: PlaceCheckoutOutcomes.PLACED, checkoutId: checkout.id };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @app/runtime build && pnpm --filter api test:integration -- checkout`
Expected: PASS — 7 cases.

- [ ] **Step 5: Prove the all-or-nothing test bites**

Temporarily move the decrement loop of step 6 above step 5's `if (conflicts.length > 0) return …`,
run `pnpm --filter api test:integration -- checkout`, and confirm case 2 fails on
`after.stock` — the rejected checkout committed decrements. Revert. A test that cannot fail against
the bug it names proves nothing (AGENTS.md: no fake green).

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/constants.ts apps/api/src/orders apps/api/test/support/logger.ts apps/api/test/integration/checkout.integration-spec.ts
git commit -m "feat(orders): the all-or-nothing checkout transaction with ordered locks"
```

---

### Task 14: `POST /checkouts`, `GET /checkouts/:id`, the outcome logs, and double submit

**Files:**
- Create: `apps/api/src/orders/checkout.service.ts`, `checkout.service.spec.ts`,
  `checkout.controller.ts`, `checkout.mapper.ts`, `orders.module.ts`, `dto/orders.dto.ts`;
  `apps/api/test/checkout.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: Task 13 (`CheckoutRepository`, outcomes, `ORDERS_LOGGER`, log events), Task 7
  (`details` reach the client), Task 12 (`isRetryableTransactionError`), Task 5 schemas.
- Produces: `POST /api/v1/checkouts` → `201 Checkout` | `400 VALIDATION_ERROR` (shape, mixed
  currency) | `409 CONFLICT` with `details` matching `CheckoutConflictDetailsSchema` |
  `409 CONFLICT` (contended after retries, no details); `GET /api/v1/checkouts/:id` → `200 Checkout`
  or 404 for anyone but its buyer (SRS-FR-CHK-009, INV-12). `toCheckout(record: CheckoutRecord): Checkout`.
  `OrdersModule` (Task 16 adds to it).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/orders/checkout.service.spec.ts`:

```ts
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  CheckoutConflictReasons,
  CheckoutRefusals,
  CheckoutStatuses,
  CurrencyCodes,
  OrderStatuses,
} from '@app/contracts';
import { Prisma } from '@app/database';
import { buildBuyerContext } from '@app/domain';
import { LogEvents } from '@app/runtime';
import { captureLogger } from '../../test/support/logger';
import { CheckoutService } from './checkout.service';
import { PlaceCheckoutOutcomes } from './orders.constants';

const buyer = buildBuyerContext('buyer_1');
const request = { lines: [{ productId: 'p1', quantity: 1, unitPriceMinor: 1000 }] };
const record = {
  id: 'k1',
  status: CheckoutStatuses.PENDING_PAYMENT,
  totalMinor: 1000,
  currency: CurrencyCodes.EGP,
  placedAt: new Date('2026-10-16T10:00:00.000Z'),
  orders: [
    {
      id: 'o1',
      status: OrderStatuses.PENDING_PAYMENT,
      totalMinor: 1000,
      currency: CurrencyCodes.EGP,
      organization: { name: 'Nile', slug: 'nile' },
      items: [{ productId: 'p1', productName: 'Shirt', quantity: 1, unitPriceMinor: 1000 }],
    },
  ],
};

function setup(place: jest.Mock, currencies = [CurrencyCodes.EGP]) {
  const repository = {
    currenciesOf: jest.fn().mockResolvedValue(currencies),
    place,
    findForBuyer: jest.fn().mockResolvedValue(record),
  };
  const logger = captureLogger();
  return { service: new CheckoutService(repository as never, logger), repository, logger };
}

describe('CheckoutService.place', () => {
  it('returns the placed checkout and logs one checkout.placed line with the request id (SRS-NFR-OBS-001)', async () => {
    const { service, logger } = setup(jest.fn().mockResolvedValue({ kind: PlaceCheckoutOutcomes.PLACED, checkoutId: 'k1' }));

    const checkout = await service.place(buyer, request, 'req_1');

    expect(checkout).toMatchObject({ id: 'k1', placedAt: '2026-10-16T10:00:00.000Z' });
    expect(checkout.orders[0].items[0].name).toBe('Shirt');
    expect(logger.lines).toEqual([
      { level: 'log', event: LogEvents.CHECKOUT_PLACED, fields: { requestId: 'req_1', buyerId: 'buyer_1', checkoutId: 'k1' } },
    ]);
  });

  it('refuses conflicting lines with 409 and details.lines, and logs the reasons', async () => {
    const conflicts = [{ productId: 'p1', reason: CheckoutConflictReasons.SOLD_OUT, available: 0, currentUnitPriceMinor: 1000 }];
    const { service, logger } = setup(jest.fn().mockResolvedValue({ kind: PlaceCheckoutOutcomes.REJECTED, conflicts }));

    const error = await service.place(buyer, request, 'req_2').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ details: { lines: conflicts } });
    expect(logger.lines[0]).toMatchObject({
      event: LogEvents.CHECKOUT_REJECTED,
      fields: { requestId: 'req_2', reasons: [CheckoutConflictReasons.SOLD_OUT] },
    });
  });

  it('refuses a changed cart with 409 and details.reason CART_CHANGED', async () => {
    const { service } = setup(jest.fn().mockResolvedValue({ kind: PlaceCheckoutOutcomes.CART_CHANGED }));

    const error = await service.place(buyer, request, 'req_3').catch((e: unknown) => e);
    expect((error as ConflictException).getResponse()).toMatchObject({ details: { reason: CheckoutRefusals.CART_CHANGED } });
  });

  it('refuses mixed currencies with 400 before the transaction runs (SRS-FR-CHK-005)', async () => {
    const place = jest.fn();
    const { service } = setup(place, [CurrencyCodes.EGP, CurrencyCodes.USD]);

    await expect(service.place(buyer, request, 'req_4')).rejects.toBeInstanceOf(BadRequestException);
    expect(place).not.toHaveBeenCalled();
  });

  it('answers 409 when retries are exhausted, never 500 (SRS §8)', async () => {
    const deadlock = new Prisma.PrismaClientKnownRequestError('deadlock', { code: 'P2034', clientVersion: 'test' });
    const { service } = setup(jest.fn().mockRejectedValue(deadlock));

    await expect(service.place(buyer, request, 'req_5')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rethrows anything that is not contention', async () => {
    const { service } = setup(jest.fn().mockRejectedValue(new Error('disk full')));
    await expect(service.place(buyer, request, 'req_6')).rejects.toThrow('disk full');
  });
});
```

`apps/api/test/checkout.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  CartSchema,
  CheckoutCartChangedDetailsSchema,
  CheckoutConflictReasons,
  CheckoutLineConflictDetailsSchema,
  CheckoutSchema,
  CheckoutStatuses,
  CurrencyCodes,
  ErrorCodes,
} from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { expectContract } from './support/contracts';
import { testPrisma } from './support/db';
import { newTenant, publishedProduct, tenantHeaders } from './support/fixtures';
import { availableOf, bearer, mintBuyers } from './support/marketplace';

describe('checkout (e2e)', () => {
  let app: INestApplication;
  let sellerA: Awaited<ReturnType<typeof newTenant>>;
  let sellerB: Awaited<ReturnType<typeof newTenant>>;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    sellerA = await newTenant(app, 'chka');
    sellerB = await newTenant(app, 'chkb');
  });

  afterAll(async () => {
    await app.close();
  });

  const buyer = async () => (await mintBuyers(app, 1))[0];
  const addToCart = (token: string, productId: string, quantity: number) =>
    request(server()).put(`/api/v1/cart/items/${productId}`).set(bearer(token)).send({ quantity }).expect(200);
  const place = (token: string, lines: { productId: string; quantity: number; unitPriceMinor: number }[]) =>
    request(server()).post('/api/v1/checkouts').set(bearer(token)).send({ lines });

  it('places one checkout of one order per seller and empties the cart (D56, SRS-FR-CHK-004)', async () => {
    const b = await buyer();
    const a1 = await publishedProduct(app, sellerA, { priceMinor: 24_900, available: 3 });
    const b1 = await publishedProduct(app, sellerB, { priceMinor: 18_900, available: 3 });
    await addToCart(b.token, a1.id, 1);
    await addToCart(b.token, b1.id, 1);

    const res = await place(b.token, [
      { productId: a1.id, quantity: 1, unitPriceMinor: 24_900 },
      { productId: b1.id, quantity: 1, unitPriceMinor: 18_900 },
    ]).expect(201);

    const checkout = expectContract(CheckoutSchema, res.body);
    expect(checkout).toMatchObject({ status: CheckoutStatuses.PENDING_PAYMENT, totalMinor: 43_800, currency: CurrencyCodes.EGP });
    expect(checkout.orders.map((order) => order.seller.slug).sort()).toEqual([sellerA.slug, sellerB.slug].sort());
    const cart = expectContract(CartSchema, (await request(server()).get('/api/v1/cart').set(bearer(b.token)).expect(200)).body);
    expect(cart).toEqual({ sellers: [] });
    expect(await availableOf(a1.id)).toBe(2);
  });

  it('refuses a price that rose since it was confirmed, with old and new visible to the client (AC-US-CHK-001-1)', async () => {
    const b = await buyer();
    const a1 = await publishedProduct(app, sellerA, { priceMinor: 1000 });
    await addToCart(b.token, a1.id, 1);
    await request(server())
      .patch(`/api/v1/products/${a1.id}`)
      .set(tenantHeaders(sellerA.accessToken, sellerA.organizationId))
      .send({ priceMinor: 1200 })
      .expect(204);

    const res = await place(b.token, [{ productId: a1.id, quantity: 1, unitPriceMinor: 1000 }]).expect(409);

    expect(res.body.error.code).toBe(ErrorCodes.CONFLICT);
    expect(CheckoutLineConflictDetailsSchema.parse(res.body.error.details).lines).toEqual([
      { productId: a1.id, reason: CheckoutConflictReasons.PRICE_CHANGED, available: 5, currentUnitPriceMinor: 1200 },
    ]);
    expect(await testPrisma.checkout.count({ where: { buyerId: b.id } })).toBe(0);
  });

  it('refuses a sold-out line and leaves the cart as it was (D59, SRS-FR-CHK-007)', async () => {
    const b = await buyer();
    const a1 = await publishedProduct(app, sellerA, { available: 1 });
    await addToCart(b.token, a1.id, 1);
    await request(server())
      .put(`/api/v1/products/${a1.id}/inventory`)
      .set(tenantHeaders(sellerA.accessToken, sellerA.organizationId))
      .send({ available: 0 })
      .expect(200);

    const res = await place(b.token, [{ productId: a1.id, quantity: 1, unitPriceMinor: a1.priceMinor }]).expect(409);

    expect(CheckoutLineConflictDetailsSchema.parse(res.body.error.details).lines[0].reason).toBe(CheckoutConflictReasons.SOLD_OUT);
    expect(await testPrisma.cartItem.count({ where: { cart: { buyerId: b.id } } })).toBe(1);
  });

  it('refuses mixed currencies with 400 before taking any lock (AC-US-CHK-002-5, SRS-FR-CHK-005)', async () => {
    const b = await buyer();
    const egp = await publishedProduct(app, sellerA, { currency: CurrencyCodes.EGP });
    const usd = await publishedProduct(app, sellerB, { currency: CurrencyCodes.USD });
    await addToCart(b.token, egp.id, 1);
    await addToCart(b.token, usd.id, 1);

    // Hold egp's inventory row locked from outside. If the service took a lock
    // before refusing, this request would block on that lock and time out.
    let release!: () => void;
    let locked!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const holder = testPrisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM inventory WHERE "productId" = ${egp.id} FOR UPDATE`;
        locked();
        await held;
      },
      { timeout: 20_000 },
    );

    try {
      await isLocked;
      const res = await place(b.token, [
        { productId: egp.id, quantity: 1, unitPriceMinor: egp.priceMinor },
        { productId: usd.id, quantity: 1, unitPriceMinor: usd.priceMinor },
      ])
        .timeout(5_000)
        .expect(400);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    } finally {
      release();
      await holder;
    }
  });

  it('refuses lines that are not the cart with 409 CART_CHANGED (SRS-FR-CHK-006)', async () => {
    const b = await buyer();
    const a1 = await publishedProduct(app, sellerA);
    await addToCart(b.token, a1.id, 1);

    const res = await place(b.token, [{ productId: a1.id, quantity: 2, unitPriceMinor: a1.priceMinor }]).expect(409);
    expect(CheckoutCartChangedDetailsSchema.parse(res.body.error.details)).toEqual({ reason: 'CART_CHANGED' });
  });

  it.each([
    { lines: [] },
    { lines: [{ productId: 'p', quantity: 11, unitPriceMinor: 100 }] },
    { lines: [{ productId: 'p', quantity: 1, unitPriceMinor: 0 }] },
    { lines: [{ productId: 'p', quantity: 1, unitPriceMinor: 100 }, { productId: 'p', quantity: 1, unitPriceMinor: 100 }] },
    { lines: Array.from({ length: 51 }, (_, i) => ({ productId: `p${i}`, quantity: 1, unitPriceMinor: 100 })) },
  ])('refuses a malformed body with 400 (§7)', async (body) => {
    const b = await buyer();
    const res = await request(server()).post('/api/v1/checkouts').set(bearer(b.token)).send(body).expect(400);
    expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
  });

  it('a double submit makes one checkout; the second sees an empty cart (D83)', async () => {
    const b = await buyer();
    const a1 = await publishedProduct(app, sellerA, { available: 5 });
    await addToCart(b.token, a1.id, 1);
    const lines = [{ productId: a1.id, quantity: 1, unitPriceMinor: a1.priceMinor }];

    const [first, second] = await Promise.all([place(b.token, lines), place(b.token, lines)]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const refused = first.status === 409 ? first : second;
    expect(CheckoutCartChangedDetailsSchema.parse(refused.body.error.details)).toEqual({ reason: 'CART_CHANGED' });
    expect(await testPrisma.checkout.count({ where: { buyerId: b.id } })).toBe(1);
    expect(await availableOf(a1.id)).toBe(4);
  });

  it("reads a buyer's own checkout and answers 404 to anyone else (SRS-FR-CHK-009, INV-12)", async () => {
    const [x, y] = await mintBuyers(app, 2);
    const a1 = await publishedProduct(app, sellerA);
    await addToCart(x.token, a1.id, 1);
    const placed = await place(x.token, [{ productId: a1.id, quantity: 1, unitPriceMinor: a1.priceMinor }]).expect(201);

    const other = await request(server()).get(`/api/v1/checkouts/${placed.body.id}`).set(bearer(y.token)).expect(404);
    expect(other.body.error.code).toBe(ErrorCodes.NOT_FOUND);
    expect(JSON.stringify(other.body)).not.toContain(a1.name);

    // Control: without it, the 404 above would also pass against a route that 404s everyone.
    const own = await request(server()).get(`/api/v1/checkouts/${placed.body.id}`).set(bearer(x.token)).expect(200);
    expect(expectContract(CheckoutSchema, own.body).id).toBe(placed.body.id);
  });

  it('requires a signed-in user', async () => {
    await request(server()).post('/api/v1/checkouts').send({ lines: [] }).expect(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api exec jest src/orders && pnpm --filter api test:e2e -- checkout`
Expected: FAIL — `Cannot find module './checkout.service'`; the e2e gets 404 for `/api/v1/checkouts`.

- [ ] **Step 3: Implement**

`apps/api/src/orders/checkout.mapper.ts`:

```ts
import { CheckoutSchema, type Checkout } from '@app/contracts';
import type { CheckoutRecord } from './interfaces/checkout.interface';

export function toCheckout(record: CheckoutRecord): Checkout {
  return CheckoutSchema.parse({
    id: record.id,
    status: record.status,
    totalMinor: record.totalMinor,
    currency: record.currency,
    placedAt: record.placedAt.toISOString(),
    orders: record.orders.map((order) => ({
      id: order.id,
      status: order.status,
      totalMinor: order.totalMinor,
      currency: order.currency,
      seller: { name: order.organization.name, slug: order.organization.slug },
      items: order.items.map((item) => ({
        productId: item.productId,
        name: item.productName,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
      })),
    })),
  });
}
```

`apps/api/src/orders/checkout.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  type LoggerService,
} from '@nestjs/common';
import { CheckoutRefusals, type Checkout, type CreateCheckoutRequest } from '@app/contracts';
import { singleCurrency, type BuyerContext } from '@app/domain';
import { LogEvents } from '@app/runtime';
import { isRetryableTransactionError } from '../common/database/retryable-transaction';
import { toCheckout } from './checkout.mapper';
import type { PlaceCheckoutOutcome } from './interfaces/checkout.interface';
import {
  CheckoutLogReasons,
  CheckoutMessages,
  ORDERS_LOGGER,
  PlaceCheckoutOutcomes,
} from './orders.constants';
import { CheckoutRepository } from './repositories/checkout.repository';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly checkoutRepository: CheckoutRepository,
    @Inject(ORDERS_LOGGER) private readonly logger: LoggerService,
  ) {}

  async place(buyer: BuyerContext, request: CreateCheckoutRequest, requestId: string): Promise<Checkout> {
    const productIds = request.lines.map((line) => line.productId);

    // SRS-FR-CHK-005: refused before any lock. An unknown id has no currency and is
    // left to the transaction, which reports it as CART_CHANGED or SOLD_OUT.
    const currencies = await this.checkoutRepository.currenciesOf(productIds);
    if (currencies.length > 0 && singleCurrency(currencies) === null) {
      this.rejected(requestId, buyer, [CheckoutLogReasons.MIXED_CURRENCY]);
      throw new BadRequestException(CheckoutMessages.MIXED_CURRENCY);
    }

    const outcome = await this.placeOrRefuse(buyer, request, requestId);
    switch (outcome.kind) {
      case PlaceCheckoutOutcomes.PLACED:
        this.logger.log(LogEvents.CHECKOUT_PLACED, { requestId, buyerId: buyer.buyerId, checkoutId: outcome.checkoutId });
        return this.findOne(buyer, outcome.checkoutId);
      case PlaceCheckoutOutcomes.REJECTED:
        this.rejected(requestId, buyer, outcome.conflicts.map((conflict) => conflict.reason));
        throw new ConflictException({ message: CheckoutMessages.LINES_CONFLICT, details: { lines: outcome.conflicts } });
      case PlaceCheckoutOutcomes.CART_CHANGED:
        this.rejected(requestId, buyer, [CheckoutRefusals.CART_CHANGED]);
        throw new ConflictException({
          message: CheckoutMessages.CART_CHANGED,
          details: { reason: CheckoutRefusals.CART_CHANGED },
        });
    }
  }

  /** Another buyer's checkout and an unknown id answer alike (INV-12, ADR 010). */
  async findOne(buyer: BuyerContext, id: string): Promise<Checkout> {
    const record = await this.checkoutRepository.findForBuyer(buyer, id);
    if (record === null) throw new NotFoundException(CheckoutMessages.NOT_FOUND);
    return toCheckout(record);
  }

  /** SRS §8: contention that survived three retries is a 409, never a 500. */
  private async placeOrRefuse(
    buyer: BuyerContext,
    request: CreateCheckoutRequest,
    requestId: string,
  ): Promise<PlaceCheckoutOutcome> {
    try {
      return await this.checkoutRepository.place(buyer, request.lines);
    } catch (error) {
      if (!isRetryableTransactionError(error)) throw error;
      this.rejected(requestId, buyer, [CheckoutLogReasons.CONTENDED]);
      throw new ConflictException(CheckoutMessages.CONTENDED);
    }
  }

  private rejected(requestId: string, buyer: BuyerContext, reasons: string[]): void {
    this.logger.log(LogEvents.CHECKOUT_REJECTED, { requestId, buyerId: buyer.buyerId, reasons });
  }
}
```

`apps/api/src/orders/dto/orders.dto.ts`:

```ts
import { createZodDto } from 'nestjs-zod';
import { CheckoutSchema, CreateCheckoutRequestSchema } from '@app/contracts';

export class CreateCheckoutRequestDto extends createZodDto(CreateCheckoutRequestSchema) {}
export class CheckoutDto extends createZodDto(CheckoutSchema) {}
```

`apps/api/src/orders/checkout.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import type { Checkout } from '@app/contracts';
import type { BuyerContext } from '@app/domain';
import { UNKNOWN_REQUEST_ID, getRequestId } from '@app/runtime';
import { Buyer } from '../security/decorators/buyer.decorator';
import { TenantFree } from '../security/decorators/tenant-free.decorator';
import { CheckoutService } from './checkout.service';
import { CheckoutDto, CreateCheckoutRequestDto } from './dto/orders.dto';

@Controller('checkouts')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  /** No Idempotency-Key until phase 5 (SRS-FR-CHK-008); D83 makes a double submit harmless meanwhile. */
  @Post()
  @TenantFree()
  @ApiCreatedResponse({ type: CheckoutDto })
  place(
    @Buyer() buyer: BuyerContext,
    @Body() body: CreateCheckoutRequestDto,
    @Req() request: Request,
  ): Promise<Checkout> {
    return this.checkoutService.place(buyer, body, getRequestId(request) ?? UNKNOWN_REQUEST_ID);
  }

  @Get(':id')
  @TenantFree()
  @ApiOkResponse({ type: CheckoutDto })
  findOne(@Buyer() buyer: BuyerContext, @Param('id') id: string): Promise<Checkout> {
    return this.checkoutService.findOne(buyer, id);
  }
}
```

`apps/api/src/orders/orders.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { createLogger } from '@app/runtime';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { ORDERS_LOGGER } from './orders.constants';
import { CheckoutRepository } from './repositories/checkout.repository';

@Module({
  controllers: [CheckoutController],
  providers: [
    { provide: ORDERS_LOGGER, useFactory: () => createLogger('orders') },
    CheckoutRepository,
    CheckoutService,
  ],
})
export class OrdersModule {}
```

`apps/api/src/app.module.ts` — add `OrdersModule` to `imports`, before `SecurityModule`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter api exec jest && pnpm --filter api test:e2e`
Expected: PASS — 6 service unit cases; `checkout.e2e-spec` 13 cases (8 `it` plus a 5-row
`it.each`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/orders apps/api/src/app.module.ts apps/api/test/checkout.e2e-spec.ts
git commit -m "feat(orders): POST /checkouts and GET /checkouts/:id with typed 409s and outcome logs"
```

---

### Task 15: The concurrency suite — the stock-1 race ×20 and overlapping carts

**Files:**
- Create: `apps/api/test/jest-concurrency.json`,
  `apps/api/test/concurrency/last-unit.concurrency-spec.ts`,
  `apps/api/test/concurrency/overlapping-carts.concurrency-spec.ts`
- Modify: `apps/api/package.json` (scripts), `apps/api/test/jest-coverage.json` (`testRegex`)

**Interfaces:**
- Consumes: `mintBuyers`, `cartWith`, `createSeller`, `createProduct`, `availableOf` (Task 6);
  `captureLogger` (Task 13); `ORDERS_LOGGER`; the routes of Task 14.
- Produces: `pnpm --filter api test:concurrency`; the suite also runs inside `pnpm --filter api test`
  and `test:coverage`, so turbo and CI gate it.

**Why real HTTP and a listening server.** The race is a claim about the deployed request path — guard
chain, validation pipe, pooled connections, row locks — not about a repository called 100 times. The
app listens on an ephemeral port and supertest sends 100 genuinely concurrent requests to it.

- [ ] **Step 1: Create the harness and write the failing tests**

`apps/api/test/jest-concurrency.json`:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "..",
  "testEnvironment": "node",
  "testRegex": ".concurrency-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "setupFiles": ["dotenv/config"],
  "moduleNameMapper": {
    "^@app/(.*)$": "<rootDir>/../../packages/$1/src/index.ts"
  }
}
```

`apps/api/package.json` — scripts:

```json
"test": "jest --passWithNoTests && jest --config ./test/jest-e2e.json --runInBand && jest --config ./test/jest-integration.json --runInBand && jest --config ./test/jest-concurrency.json --runInBand",
"test:concurrency": "jest --config ./test/jest-concurrency.json --runInBand",
```

`apps/api/test/jest-coverage.json` — `testRegex` becomes
`"(src/.*\\.spec\\.ts$|test/.*\\.(e2e|integration|concurrency)-spec\\.ts$)"`, so CI's
`test:coverage` (which replaces `test` there) runs the race too.

`apps/api/test/concurrency/last-unit.concurrency-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  CheckoutConflictReasons,
  CheckoutLineConflictDetailsSchema,
  ErrorCodes,
} from '@app/contracts';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { testPrisma } from '../support/db';
import { availableOf, bearer, cartWith, createProduct, createSeller, mintBuyers } from '../support/marketplace';

/**
 * AC-US-CHK-002-3 and SRS-NFR-REL-001 — the flagship race.
 *
 * One unit, one hundred buyers who all hold it in their carts, all placing the
 * order at once. Repeated twenty consecutive times with fresh rows, because a race
 * that passes once may simply not have interleaved (failure-scenarios §4).
 */
jest.setTimeout(600_000);

const RACE_RUNS = 20;
const RACERS = 100;
const PRICE_MINOR = 1000;

describe('the last unit (concurrency)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  it(`sells one unit exactly once to ${RACERS} concurrent buyers, ${RACE_RUNS} runs in a row`, async () => {
    for (let run = 1; run <= RACE_RUNS; run++) {
      const seller = await createSeller(`race${run}`);
      const product = await createProduct(seller.organizationId, { available: 1, priceMinor: PRICE_MINOR });
      const buyers = await mintBuyers(app, RACERS);
      await Promise.all(
        buyers.map((buyer) =>
          cartWith(buyer.id, [{ productId: product.id, quantity: 1, addedUnitPriceMinor: PRICE_MINOR }]),
        ),
      );
      const body = { lines: [{ productId: product.id, quantity: 1, unitPriceMinor: PRICE_MINOR }] };

      const responses = await Promise.all(
        buyers.map((buyer) => request(baseUrl).post('/api/v1/checkouts').set(bearer(buyer.token)).send(body)),
      );

      const statuses: Record<number, number> = {};
      for (const res of responses) statuses[res.status] = (statuses[res.status] ?? 0) + 1;
      // The run number travels with the assertion, so a failure names the run.
      expect({ run, statuses }).toEqual({ run, statuses: { 201: 1, 409: RACERS - 1 } });

      for (const loser of responses.filter((res) => res.status === 409)) {
        expect(loser.body.error.code).toBe(ErrorCodes.CONFLICT);
        // The 99 see "Sold out" (AC-US-CHK-002-3): the reason the web app branches on.
        expect(CheckoutLineConflictDetailsSchema.parse(loser.body.error.details).lines).toEqual([
          { productId: product.id, reason: CheckoutConflictReasons.SOLD_OUT, available: 0, currentUnitPriceMinor: PRICE_MINOR },
        ]);
      }

      expect({ run, available: await availableOf(product.id) }).toEqual({ run, available: 0 });
      expect(await testPrisma.orderItem.count({ where: { productId: product.id } })).toBe(1);
      expect(
        await testPrisma.checkout.count({ where: { orders: { some: { items: { some: { productId: product.id } } } } } }),
      ).toBe(1);
      // D57 for the losers: their carts are exactly as they were.
      expect(await testPrisma.cartItem.count({ where: { productId: product.id } })).toBe(RACERS - 1);
    }
  });
});
```

`apps/api/test/concurrency/overlapping-carts.concurrency-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { LogEvents } from '@app/runtime';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ORDERS_LOGGER } from '../../src/orders/orders.constants';
import { testPrisma } from '../support/db';
import { captureLogger } from '../support/logger';
import {
  availableOf,
  bearer,
  cartWith,
  createProduct,
  createSeller,
  mintBuyers,
  type ProductFixture,
} from '../support/marketplace';

/**
 * SRS-NFR-REL-002 and RISK-003: overlapping multi-seller checkouts never
 * deadlock-fail. Fifty buyers each want the same three products from three
 * sellers, each listing them in a different order. Ordered locks, not retries,
 * must be what makes this pass — so the suite also asserts zero retries.
 */
jest.setTimeout(600_000);

const BUYERS = 50;
const PRICE_MINOR = 500;
const ORDERINGS = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
] as const;

describe('overlapping carts (concurrency)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const logger = captureLogger();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ORDERS_LOGGER)
      .useValue(logger)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  async function race(stock: number) {
    const sellers = await Promise.all(['ova', 'ovb', 'ovc'].map(createSeller));
    const products: ProductFixture[] = await Promise.all(
      sellers.map((seller) => createProduct(seller.organizationId, { available: stock, priceMinor: PRICE_MINOR })),
    );
    const buyers = await mintBuyers(app, BUYERS);
    const linesFor = (i: number) =>
      ORDERINGS[i % ORDERINGS.length].map((index) => ({ productId: products[index].id, quantity: 1 }));

    await Promise.all(
      buyers.map((buyer, i) =>
        cartWith(buyer.id, linesFor(i).map((line) => ({ ...line, addedUnitPriceMinor: PRICE_MINOR }))),
      ),
    );
    const retriesBefore = logger.lines.filter((line) => line.event === LogEvents.CHECKOUT_TRANSACTION_RETRIED).length;

    const responses = await Promise.all(
      buyers.map((buyer, i) =>
        request(baseUrl)
          .post('/api/v1/checkouts')
          .set(bearer(buyer.token))
          .send({ lines: linesFor(i).map((line) => ({ ...line, unitPriceMinor: PRICE_MINOR })) }),
      ),
    );

    const retries = logger.lines.filter((line) => line.event === LogEvents.CHECKOUT_TRANSACTION_RETRIED).length - retriesBefore;
    return { products, responses, retries };
  }

  it('50 buyers, ample stock: all 50 succeed, no deadlock reaches anyone, no retry was needed', async () => {
    const { products, responses, retries } = await race(1000);

    expect(responses.map((res) => res.status).filter((status) => status !== 201)).toEqual([]);
    expect(retries).toBe(0);
    for (const product of products) expect(await availableOf(product.id)).toBe(1000 - BUYERS);
    expect(await testPrisma.order.count({ where: { items: { some: { productId: products[0].id } } } })).toBe(BUYERS);
  });

  it('50 buyers, stock 20: 20 succeed, 30 are refused with 409, nothing 5xx, stock exactly 0', async () => {
    const { products, responses, retries } = await race(20);

    const statuses = responses.map((res) => res.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(20);
    expect(statuses.filter((status) => status === 409)).toHaveLength(BUYERS - 20);
    expect(statuses.filter((status) => status >= 500)).toEqual([]);
    expect(retries).toBe(0);
    for (const product of products) expect(await availableOf(product.id)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the suite to verify it runs and passes**

The routes exist from Task 14, so this suite is written against working code — the failing-first
evidence is Step 3.

Run: `pnpm --filter api test:concurrency`
Expected: PASS — `last-unit` 1 case (20 runs × 100 requests), `overlapping-carts` 2 cases. Record
the wall-clock time Jest prints for each; it goes into STATUS.md.

- [ ] **Step 3: Prove each test bites**

Each is a temporary edit to `checkout.repository.ts`, run, observed, reverted — never committed.

1. **Race without the lock.** Delete `FOR UPDATE` from the inventory statement. Run
   `pnpm --filter api test:concurrency -- last-unit`. Expected: FAIL on run 1 — more than one 201
   gets as far as the decrement, and the losers' decrements violate `inventory_quantities_non_negative`
   (status 500), so `statuses` is not `{ 201: 1, 409: 99 }`. Revert.
2. **Overlap without the order.** Replace the single ordered statement with one
   `SELECT … WHERE "productId" = $1 FOR UPDATE` per line in **request** order, and set
   `TRANSACTION_RETRIES = 0`. Run `pnpm --filter api test:concurrency -- overlapping`. Expected: FAIL —
   at least one `409 CONTENDED` (a deadlock victim) or a nonzero `retries` count with retries restored.
   Revert both edits.

Record both outcomes, with the observed counts, for STATUS.md.

- [ ] **Step 4: Run it twenty-times-over again from cold**

Run: `pnpm --filter api test:concurrency` a second time, then `pnpm --filter api test`.
Expected: PASS both times. The second run proves the suite tolerates the rows the first left behind
(it shares the developer database).

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/jest-concurrency.json apps/api/test/concurrency apps/api/package.json apps/api/test/jest-coverage.json
git commit -m "test(api): the stock-1 race x20 and the overlapping-cart suite, gated by test and coverage"
```

---

### Task 16: Buyer orders — `GET /buyer/orders[/:id]`

**Files:**
- Create: `apps/api/src/orders/buyer-orders.controller.ts`, `buyer-orders.service.ts`,
  `buyer-order.mapper.ts`, `interfaces/buyer-order.interface.ts`,
  `repositories/buyer-orders.repository.ts`, `repositories/buyer-orders.repository.spec.ts`;
  `apps/api/test/buyer-orders.e2e-spec.ts`
- Modify: `apps/api/src/orders/orders.module.ts`, `apps/api/src/orders/orders.constants.ts`,
  `apps/api/src/orders/dto/orders.dto.ts`, `apps/api/test/support/marketplace.ts`

**Interfaces:**
- Consumes: `buyerScope` (Task 1); `toPage`, `NEWEST_FIRST` (Task 10); `PageQueryDto` (Task 10);
  `BuyerOrderPageSchema`, `BuyerOrderSchema`, `BUYER_ORDERS_PAGE_SIZE` (Tasks 3, 5);
  `ORDER_ITEM_SELECT`, `BuyerOrderMessages` (Task 13).
- Produces: `GET /api/v1/buyer/orders?cursor=` → `BuyerOrderPage`, newest first, 20 per page (D89);
  `GET /api/v1/buyer/orders/:id` → `BuyerOrder` or 404 (SRS-FR-BORD-001 … 003). Fixture
  `placedOrder(buyerId, product, quantity?)` writes a checkout + order + item directly.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/orders/repositories/buyer-orders.repository.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SRS-FR-BORD-003 / RULE-BORD-001 is a statement about where a filter comes from,
 * so it is checked where it lives. The e2e suite proves the behaviour; this keeps
 * a later edit from "fixing" a query by reaching for the tenant filter.
 */
describe('BuyerOrdersRepository (structure)', () => {
  const source = readFileSync(join(__dirname, 'buyer-orders.repository.ts'), 'utf8');

  it('composes every query from buyerScope', () => {
    expect(source.match(/buyerScope\(buyer\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('never uses tenantScope', () => {
    expect(source).not.toContain('tenantScope');
  });
});
```

Append to `apps/api/test/support/marketplace.ts`:

```ts
/** A placed checkout with one order of one item, written directly — for list and paging fixtures. */
export async function placedOrder(
  buyerId: string,
  product: ProductFixture,
  quantity = 1,
): Promise<{ checkoutId: string; orderId: string }> {
  const totalMinor = product.priceMinor * quantity;
  const checkout = await testPrisma.checkout.create({
    data: { buyerId, totalMinor, currency: product.currency },
    select: { id: true },
  });
  const order = await testPrisma.order.create({
    data: {
      checkoutId: checkout.id,
      organizationId: product.organizationId,
      buyerId,
      totalMinor,
      currency: product.currency,
      items: {
        create: { productId: product.id, productName: product.name, quantity, unitPriceMinor: product.priceMinor },
      },
    },
    select: { id: true },
  });
  return { checkoutId: checkout.id, orderId: order.id };
}
```

`apps/api/test/buyer-orders.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  BUYER_ORDERS_PAGE_SIZE,
  BuyerOrderPageSchema,
  BuyerOrderSchema,
  ErrorCodes,
  OrderStatuses,
} from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { expectContract } from './support/contracts';
import { bearer, createProduct, createSeller, mintBuyers, placedOrder } from './support/marketplace';

/** AC-US-BORD-001-1, AC-US-BORD-002-1, SRS-NFR-SEC-002 (INV-12). */
describe('buyer orders (e2e)', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const list = async (token: string, cursor?: string) =>
    expectContract(
      BuyerOrderPageSchema,
      (
        await request(server())
          .get('/api/v1/buyer/orders')
          .query(cursor === undefined ? {} : { cursor })
          .set(bearer(token))
          .expect(200)
      ).body,
    );

  it("lists only the caller's orders (AC-US-BORD-001-1)", async () => {
    const [x, y] = await mintBuyers(app, 2);
    const seller = await createSeller('bord');
    const product = await createProduct(seller.organizationId, { name: 'Y only widget' });
    const mine = await placedOrder(x.id, product);
    const theirs = await placedOrder(y.id, product);

    const page = await list(x.token);
    expect(page.items.map((order) => order.id)).toEqual([mine.orderId]);
    expect(page.items.map((order) => order.id)).not.toContain(theirs.orderId);
  });

  it("answers 404 for another buyer's order, with no data, and 200 for one's own (AC-US-BORD-002-1)", async () => {
    const [x, y] = await mintBuyers(app, 2);
    const seller = await createSeller('bordd');
    const product = await createProduct(seller.organizationId, { name: 'Private purchase', priceMinor: 18_900 });
    const theirs = await placedOrder(y.id, product, 2);

    const res = await request(server()).get(`/api/v1/buyer/orders/${theirs.orderId}`).set(bearer(x.token)).expect(404);
    expect(res.body.error.code).toBe(ErrorCodes.NOT_FOUND);
    expect(JSON.stringify(res.body)).not.toContain('Private purchase');

    // Control: the owner reads every field SRS-FR-BORD-002 names.
    const own = await request(server()).get(`/api/v1/buyer/orders/${theirs.orderId}`).set(bearer(y.token)).expect(200);
    expect(expectContract(BuyerOrderSchema, own.body)).toEqual({
      id: theirs.orderId,
      checkoutId: theirs.checkoutId,
      status: OrderStatuses.PENDING_PAYMENT,
      totalMinor: 37_800,
      currency: product.currency,
      createdAt: expect.any(String),
      seller: { name: seller.name, slug: seller.slug },
      items: [{ productId: product.id, name: 'Private purchase', quantity: 2, unitPriceMinor: 18_900 }],
    });
  });

  it('lists newest first, 20 per page, without overlap (SRS-FR-BORD-001, D89)', async () => {
    const [x] = await mintBuyers(app, 1);
    const seller = await createSeller('bordp');
    const product = await createProduct(seller.organizationId);
    const created: string[] = [];
    for (let i = 0; i <= BUYER_ORDERS_PAGE_SIZE; i++) created.push((await placedOrder(x.id, product)).orderId);

    const first = await list(x.token);
    expect(first.items).toHaveLength(BUYER_ORDERS_PAGE_SIZE);
    expect(first.items[0].id).toBe(created[created.length - 1]);
    const second = await list(x.token, first.nextCursor!);
    expect(second.items.map((order) => order.id)).toEqual([created[0]]);
    expect(second.nextCursor).toBeNull();
  });

  it('requires a signed-in user', async () => {
    await request(server()).get('/api/v1/buyer/orders').expect(401);
  });
});
```

`created[created.length - 1]` being first assumes distinct `createdAt` values; if two inserts share
a millisecond, the `id desc` tie-break decides. Should that make the assertion flaky, assert set
equality of page one with the 20 newest by `(createdAt, id)` read from `testPrisma` instead — record
the change in the defect table; do not drop the ordering assertion.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api exec jest src/orders/repositories && pnpm --filter api test:e2e -- buyer-orders`
Expected: FAIL — `ENOENT … buyer-orders.repository.ts`; the e2e gets 404 for the route.

- [ ] **Step 3: Implement**

Append to `apps/api/src/orders/orders.constants.ts`:

```ts
export const BUYER_ORDER_SUMMARY_SELECT = {
  id: true,
  checkoutId: true,
  status: true,
  totalMinor: true,
  currency: true,
  createdAt: true,
  organization: { select: { name: true, slug: true } },
  _count: { select: { items: true } },
} as const;

export const BUYER_ORDER_DETAIL_SELECT = {
  id: true,
  checkoutId: true,
  status: true,
  totalMinor: true,
  currency: true,
  createdAt: true,
  organization: { select: { name: true, slug: true } },
  items: { select: ORDER_ITEM_SELECT, orderBy: { productId: 'asc' } },
} as const;
```

`apps/api/src/orders/interfaces/buyer-order.interface.ts`:

```ts
import type { CurrencyCode, OrderStatus } from '@app/contracts';
import type { OrderItemRecord } from './checkout.interface';

interface BuyerOrderFields {
  id: string;
  checkoutId: string;
  status: OrderStatus;
  totalMinor: number;
  currency: CurrencyCode;
  createdAt: Date;
  organization: { name: string; slug: string };
}

export interface BuyerOrderSummaryRow extends BuyerOrderFields {
  _count: { items: number };
}

export interface BuyerOrderRow extends BuyerOrderFields {
  items: OrderItemRecord[];
}
```

`apps/api/src/orders/repositories/buyer-orders.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { buyerScope, type BuyerContext } from '@app/domain';
import { PrismaService } from '@app/runtime';
import { NEWEST_FIRST } from '../../common/pagination/pagination.constants';
import type { BuyerOrderRow, BuyerOrderSummaryRow } from '../interfaces/buyer-order.interface';
import { BUYER_ORDER_DETAIL_SELECT, BUYER_ORDER_SUMMARY_SELECT } from '../orders.constants';

/**
 * The buyer's path to an order (ADR 010 amendment): by buyer id only, composed
 * from buyerScope, never from tenantScope (RULE-BORD-001). The seller's path to
 * the same rows arrives with the seller orders screen and uses tenantScope.
 */
@Injectable()
export class BuyerOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(buyer: BuyerContext, cursor: string | undefined, size: number): Promise<BuyerOrderSummaryRow[]> {
    return this.prisma.order.findMany({
      where: buyerScope(buyer),
      select: BUYER_ORDER_SUMMARY_SELECT,
      orderBy: [...NEWEST_FIRST],
      take: size + 1,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    });
  }

  findById(buyer: BuyerContext, id: string): Promise<BuyerOrderRow | null> {
    return this.prisma.order.findFirst({
      where: { id, ...buyerScope(buyer) },
      select: BUYER_ORDER_DETAIL_SELECT,
    });
  }
}
```

`apps/api/src/orders/buyer-order.mapper.ts`:

```ts
import {
  BuyerOrderSchema,
  BuyerOrderSummarySchema,
  type BuyerOrder,
  type BuyerOrderSummary,
} from '@app/contracts';
import type { BuyerOrderRow, BuyerOrderSummaryRow } from './interfaces/buyer-order.interface';

const common = (row: BuyerOrderRow | BuyerOrderSummaryRow) => ({
  id: row.id,
  checkoutId: row.checkoutId,
  status: row.status,
  totalMinor: row.totalMinor,
  currency: row.currency,
  createdAt: row.createdAt.toISOString(),
  seller: { name: row.organization.name, slug: row.organization.slug },
});

export function toBuyerOrderSummary(row: BuyerOrderSummaryRow): BuyerOrderSummary {
  return BuyerOrderSummarySchema.parse({ ...common(row), itemCount: row._count.items });
}

export function toBuyerOrder(row: BuyerOrderRow): BuyerOrder {
  return BuyerOrderSchema.parse({
    ...common(row),
    items: row.items.map((item) => ({
      productId: item.productId,
      name: item.productName,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
    })),
  });
}
```

`apps/api/src/orders/buyer-orders.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { BUYER_ORDERS_PAGE_SIZE, type BuyerOrder, type BuyerOrderPage } from '@app/contracts';
import type { BuyerContext } from '@app/domain';
import { toPage } from '../common/pagination/page';
import { toBuyerOrder, toBuyerOrderSummary } from './buyer-order.mapper';
import { BuyerOrderMessages } from './orders.constants';
import { BuyerOrdersRepository } from './repositories/buyer-orders.repository';

@Injectable()
export class BuyerOrdersService {
  constructor(private readonly buyerOrdersRepository: BuyerOrdersRepository) {}

  async list(buyer: BuyerContext, cursor: string | undefined): Promise<BuyerOrderPage> {
    const rows = await this.buyerOrdersRepository.list(buyer, cursor, BUYER_ORDERS_PAGE_SIZE);
    return toPage(rows, BUYER_ORDERS_PAGE_SIZE, toBuyerOrderSummary);
  }

  /** Another buyer's order and an unknown id answer alike (INV-12). */
  async findOne(buyer: BuyerContext, id: string): Promise<BuyerOrder> {
    const row = await this.buyerOrdersRepository.findById(buyer, id);
    if (row === null) throw new NotFoundException(BuyerOrderMessages.NOT_FOUND);
    return toBuyerOrder(row);
  }
}
```

`apps/api/src/orders/dto/orders.dto.ts` — add `BuyerOrderPageSchema, BuyerOrderSchema` to the
import and:

```ts
export class BuyerOrderPageDto extends createZodDto(BuyerOrderPageSchema) {}
export class BuyerOrderDto extends createZodDto(BuyerOrderSchema) {}
```

`apps/api/src/orders/buyer-orders.controller.ts`:

```ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import type { BuyerOrder, BuyerOrderPage } from '@app/contracts';
import type { BuyerContext } from '@app/domain';
import { Buyer } from '../security/decorators/buyer.decorator';
import { TenantFree } from '../security/decorators/tenant-free.decorator';
import { PageQueryDto } from '../storefront/dto/storefront.dto';
import { BuyerOrdersService } from './buyer-orders.service';
import { BuyerOrderDto, BuyerOrderPageDto } from './dto/orders.dto';

@Controller('buyer/orders')
export class BuyerOrdersController {
  constructor(private readonly buyerOrdersService: BuyerOrdersService) {}

  @Get()
  @TenantFree()
  @ApiOkResponse({ type: BuyerOrderPageDto })
  list(@Buyer() buyer: BuyerContext, @Query() query: PageQueryDto): Promise<BuyerOrderPage> {
    return this.buyerOrdersService.list(buyer, query.cursor);
  }

  @Get(':id')
  @TenantFree()
  @ApiOkResponse({ type: BuyerOrderDto })
  findOne(@Buyer() buyer: BuyerContext, @Param('id') id: string): Promise<BuyerOrder> {
    return this.buyerOrdersService.findOne(buyer, id);
  }
}
```

`PageQueryDto` is imported from the storefront module's `dto/`. If the reviewer prefers it shared,
move it to `apps/api/src/common/pagination/page-query.dto.ts` in this task and update both imports —
either is inside the folder rules; two copies of the class are not.

`apps/api/src/orders/orders.module.ts` — add `BuyerOrdersController` to `controllers` and
`BuyerOrdersRepository`, `BuyerOrdersService` to `providers`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter api exec jest && pnpm --filter api test:e2e`
Expected: PASS — 2 structural cases; `buyer-orders.e2e-spec` 4 cases.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/orders apps/api/test/buyer-orders.e2e-spec.ts apps/api/test/support/marketplace.ts
git commit -m "feat(orders): buyer order history and detail through buyerScope"
```

---
### Task 17: `apps/worker` — scaffold, environment, scheduler, and `check-db-env.mjs`

**Files:**
- Create: `apps/worker/package.json`, `tsconfig.json`, `tsconfig.build.json`, `eslint.config.mjs`,
  `vitest.config.ts`, `vitest.integration.config.ts`, `.env.example`, `src/worker.constants.ts`,
  `src/interfaces/scheduler.interface.ts`, `src/scheduler.ts`, `src/scheduler.spec.ts`,
  `src/config/worker-env.ts`, `src/config/worker-env.spec.ts`, `test/check-db-env.spec.ts`
- Modify: `packages/runtime/src/config/env.ts`, `packages/runtime/src/config/env.spec.ts`,
  `scripts/check-db-env.mjs` (`.gitignore` needs nothing: its `.env` rule already covers
  `apps/worker/.env` — `git check-ignore -v apps/worker/.env` → `.gitignore:16:.env`)

**Interfaces:**
- Consumes: `AUTO_CANCEL_INTERVAL_MS`, `CHECKOUT_PAYMENT_WINDOW_MS` (Task 2).
- Produces (runtime): `DatabaseEnvSchema` (`APP_NAME`, `DATABASE_URL`) and
  `parseEnv<S extends z.ZodType>(schema: S, source?): z.output<S>`; `validateEnv` unchanged in
  behaviour.
- Produces (worker): `WorkerEnvSchema` / `WorkerEnv` / `validateWorkerEnv(source?)` with
  `AUTO_CANCEL_INTERVAL_MS` and `CHECKOUT_PAYMENT_WINDOW_MS` defaulting to D79/D70 (D87);
  `startInterval(job: () => Promise<void>, intervalMs: number, options?: { timers?: Timers; onError?: (error: unknown) => void }): StopScheduler`.
- Produces (root): `check-db-env.mjs` compares three files and honours `DB_ENV_ROOT` for its test.

**Three facts at `3633695` this task answers.**

1. **`validateEnv` is API-shaped (finding 12).** It requires `JWT_SECRET`, `PORT` and `WEB_URL`, so
   a worker calling it would refuse to boot without a signing secret it never uses. The shared part
   becomes `DatabaseEnvSchema`; each process extends it.
2. **`check-db-env.mjs` would stop comparing when it gains a third file (finding 13).** It exits 0
   when `found.length < targets.length`, i.e. when *any* file is missing. Adding
   `apps/worker/.env` as a third target therefore silently disables the API-vs-database comparison for
   every developer who has not created the worker's file — the silent failure the script exists to
   prevent (ADR 0001 amendment, obligation 1). The condition becomes `found.length < 2`.
3. **The worker is a plain Node process (ADR 0001 amendment).** No Nest container, no Redis. It
   uses `PrismaClient` from `@app/database` directly rather than `PrismaService`, which is a Nest
   provider; `@app/runtime` still supplies the logger, the env base and the log event names.

- [ ] **Step 1: Write the failing tests**

Append to `packages/runtime/src/config/env.spec.ts` (add `DatabaseEnvSchema, parseEnv` to its import
from `./env`):

```ts
describe('DatabaseEnvSchema and parseEnv', () => {
  const database = { DATABASE_URL: 'postgresql://app:app@localhost:5432/app' };

  it('needs only what a database-only process needs — no signing secret', () => {
    expect(parseEnv(DatabaseEnvSchema, database)).toEqual({ ...database, APP_NAME: 'app' });
  });

  it('lists every problem at once, by path', () => {
    expect(() => parseEnv(DatabaseEnvSchema, {})).toThrow(/DATABASE_URL/);
  });

  it('leaves validateEnv as strict as it was: the API still needs JWT_SECRET', () => {
    expect(() => validateEnv(database)).toThrow(/JWT_SECRET/);
  });
});
```

`apps/worker/src/config/worker-env.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AUTO_CANCEL_INTERVAL_MS, CHECKOUT_PAYMENT_WINDOW_MS } from '@app/domain';
import { validateWorkerEnv } from './worker-env';

const base = { DATABASE_URL: 'postgresql://app:app@localhost:5432/app' };

describe('validateWorkerEnv (D87)', () => {
  it('defaults to D79 and D70 and needs no JWT secret', () => {
    expect(validateWorkerEnv(base)).toMatchObject({
      AUTO_CANCEL_INTERVAL_MS,
      CHECKOUT_PAYMENT_WINDOW_MS,
    });
  });

  it('accepts a shorter window and interval, as the behavioural stack sets them', () => {
    expect(
      validateWorkerEnv({ ...base, AUTO_CANCEL_INTERVAL_MS: '1000', CHECKOUT_PAYMENT_WINDOW_MS: '20000' }),
    ).toMatchObject({ AUTO_CANCEL_INTERVAL_MS: 1000, CHECKOUT_PAYMENT_WINDOW_MS: 20000 });
  });

  it('refuses an interval so small it would spin, and a missing database', () => {
    expect(() => validateWorkerEnv({ ...base, AUTO_CANCEL_INTERVAL_MS: '10' })).toThrow(/AUTO_CANCEL_INTERVAL_MS/);
    expect(() => validateWorkerEnv({})).toThrow(/DATABASE_URL/);
  });
});
```

`apps/worker/src/scheduler.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startInterval } from './scheduler';

describe('startInterval', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs once immediately, so a restarted worker catches up at once (failure-scenarios: worker down)', async () => {
    const job = vi.fn(async () => undefined);
    const stop = startInterval(job, 60_000);

    expect(job).toHaveBeenCalledTimes(1);
    await stop();
  });

  it('never overlaps runs: the next starts an interval after the previous finished', async () => {
    let finish!: () => void;
    const job = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)))
      .mockResolvedValue(undefined);
    const stop = startInterval(job, 1_000);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(job).toHaveBeenCalledTimes(1); // the first run is still going

    finish();
    await vi.advanceTimersByTimeAsync(999);
    expect(job).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(job).toHaveBeenCalledTimes(2);
    await stop();
  });

  it('stop waits for the run in flight and schedules nothing after it', async () => {
    let finish!: () => void;
    const job = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const stop = startInterval(job, 1_000);

    const stopped = stop();
    finish();
    await stopped;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(job).toHaveBeenCalledTimes(1);
  });

  it('reports a failed run and keeps going', async () => {
    const onError = vi.fn();
    const job = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined);
    const stop = startInterval(job, 1_000, { onError });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'db down' }));
    expect(job).toHaveBeenCalledTimes(2);
    await stop();
  });
});
```

`apps/worker/test/check-db-env.spec.ts`:

```ts
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The guard ADR 0001 obliges phase 4 to extend. Run as a real process against a
 * temporary tree, because what matters is its exit code.
 */
const SCRIPT = resolve(__dirname, '../../../scripts/check-db-env.mjs');
const URL_A = 'postgresql://app:app@localhost:5432/app';
const URL_B = 'postgresql://app:app@localhost:5432/other';

function tree(files: Partial<Record<'database' | 'api' | 'worker', string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'db-env-'));
  const paths = { database: 'packages/database', api: 'apps/api', worker: 'apps/worker' };
  for (const [key, url] of Object.entries(files)) {
    const directory = join(root, paths[key as keyof typeof paths]);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, '.env'), `DATABASE_URL=${url}\n`);
  }
  return root;
}

const run = (root: string) =>
  spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, DB_ENV_ROOT: root }, encoding: 'utf8' }).status;

describe('scripts/check-db-env.mjs', () => {
  it('passes when all three agree', () => {
    expect(run(tree({ database: URL_A, api: URL_A, worker: URL_A }))).toBe(0);
  });

  it("refuses when the worker's DATABASE_URL disagrees", () => {
    expect(run(tree({ database: URL_A, api: URL_A, worker: URL_B }))).toBe(1);
  });

  it('still compares the other two when the worker file is absent (finding 13)', () => {
    expect(run(tree({ database: URL_A, api: URL_B }))).toBe(1);
  });

  it('passes with fewer than two files: nothing to compare', () => {
    expect(run(tree({ api: URL_A }))).toBe(0);
  });
});
```

- [ ] **Step 2: Create the package so the tests can run**

`apps/worker/package.json`:

```json
{
  "name": "worker",
  "version": "0.0.1",
  "private": true,
  "license": "UNLICENSED",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/main.js",
    "dev": "tsx watch src/main.ts",
    "lint": "eslint \"{src,test}/**/*.ts\"",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@app/contracts": "workspace:*",
    "@app/database": "workspace:*",
    "@app/domain": "workspace:*",
    "@app/runtime": "workspace:*",
    "dotenv": "^18.0.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@app/config": "workspace:*",
    "@app/eslint-config": "workspace:*",
    "@types/node": "^24.0.0",
    "@vitest/coverage-v8": "^2.1",
    "eslint": "^9.18.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.3",
    "typescript-eslint": "^8.20.0",
    "vitest": "^2.1.0"
  }
}
```

`apps/worker/tsconfig.json` (the runtime package's base — CommonJS, like the API):

```json
{
  "extends": "@app/config/tsconfig/nest.json",
  "compilerOptions": { "outDir": "./dist", "composite": false, "types": ["node"] },
  "include": ["src", "test"]
}
```

`apps/worker/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "rootDir": "src" },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.spec.ts"]
}
```

`apps/worker/eslint.config.mjs` — the element type only has to start with `app-` for
`packages/eslint-config` to treat it as an app (`type.startsWith('app-')`), which is what puts the
worker under `{ from: 'app', allow: ['package'] }`:

```js
import tseslint from 'typescript-eslint';
import { defineConfig } from '@app/eslint-config';

export default tseslint.config(
  { ignores: ['eslint.config.mjs', 'vitest*.config.ts', 'dist/**', 'coverage/**'] },
  ...tseslint.configs.recommended,
  ...defineConfig({ type: 'app-worker', tsconfigRootDir: import.meta.dirname }),
);
```

`apps/worker/vitest.config.ts` — workspace packages resolve to source, mirroring the API's jest
`moduleNameMapper` and `packages/runtime/vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (name: string) =>
  fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url));

export const workspaceAliases = {
  '@app/contracts': source('contracts'),
  '@app/database': source('database'),
  '@app/domain': source('domain'),
  '@app/runtime': source('runtime'),
};

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    coverage: { provider: 'v8', reporter: ['text-summary', 'lcov'] },
  },
  resolve: { alias: workspaceAliases },
});
```

`apps/worker/vitest.integration.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { workspaceAliases } from './vitest.config';

/** Real PostgreSQL, one file at a time — the suites share the developer database. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.integration-spec.ts'],
    setupFiles: ['dotenv/config'],
    fileParallelism: false,
    testTimeout: 60_000,
  },
  resolve: { alias: workspaceAliases },
});
```

`apps/worker/.env.example`:

```bash
# Copy to .env. Must match DATABASE_URL in apps/api/.env and packages/database/.env —
# scripts/check-db-env.mjs fails the migrate commands when any two disagree.
APP_NAME=marketcore
DATABASE_URL=postgresql://app:app@localhost:5432/app

# Optional, test stacks only (D87). Defaults: 60000 (D79) and 1800000 (D70).
# AUTO_CANCEL_INTERVAL_MS=60000
# CHECKOUT_PAYMENT_WINDOW_MS=1800000
```

Run: `pnpm install`
Expected: the lockfile gains the `worker` importer; `pnpm --filter worker exec vitest --version`
prints a 2.x version.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @app/runtime test -- env && pnpm --filter worker exec vitest run`
Expected: FAIL — `DatabaseEnvSchema is not exported`; `Failed to resolve import "./worker-env"` and
`"./scheduler"`; `check-db-env` cases 2 and 3 fail (the script ignores `DB_ENV_ROOT` and does not know
the worker file).

- [ ] **Step 4: Implement**

`packages/runtime/src/config/env.ts` — replace the schema block and `validateEnv` with:

```ts
/**
 * What every process that touches the database needs. The API and the worker
 * each extend it (ADR 0001): the worker must not need a JWT secret to boot.
 */
export const DatabaseEnvSchema = z.object({
  APP_NAME: z.string().min(1).default('app'),
  DATABASE_URL: z.string().url(),
});

const EnvSchema = DatabaseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3001),
  WEB_URL: z.string().default('http://localhost:3000'),
  // Signs access tokens. A minimum length is enforced here because a short secret
  // is a forgery risk that no downstream check can repair.
  JWT_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof EnvSchema>;

/** Validates `source` against `schema`, failing with every problem listed by path. */
export function parseEnv<S extends z.ZodType>(schema: S, source: NodeJS.ProcessEnv = process.env): z.output<S> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment:\n${parsed.error.issues
        .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
        .join('\n')}`,
    );
  }
  return parsed.data;
}

export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return parseEnv(EnvSchema, source);
}
```

`apps/worker/src/worker.constants.ts`:

```ts
/** The logger context every worker line carries. */
export const WORKER_LOGGER_CONTEXT = 'worker';

export const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

/** Floors for the D87 overrides: below these a misconfiguration would spin the database. */
export const MIN_AUTO_CANCEL_INTERVAL_MS = 500;
export const MIN_PAYMENT_WINDOW_MS = 1_000;

/** One run's transaction: at most 100 checkouts (D79), so seconds, not minutes. */
export const AUTO_CANCEL_TRANSACTION_TIMEOUT_MS = 30_000;
```

`apps/worker/src/config/worker-env.ts`:

```ts
import { z } from 'zod';
import { AUTO_CANCEL_INTERVAL_MS, CHECKOUT_PAYMENT_WINDOW_MS } from '@app/domain';
import { DatabaseEnvSchema, parseEnv } from '@app/runtime';
import { MIN_AUTO_CANCEL_INTERVAL_MS, MIN_PAYMENT_WINDOW_MS } from '../worker.constants';

/**
 * D87: the cadence and the window default to D79 and D70 and may be shortened
 * only by the environment — the behavioural stack cannot wait thirty minutes.
 * Nothing in the code path changes with them; only the clock arithmetic does.
 */
export const WorkerEnvSchema = DatabaseEnvSchema.extend({
  AUTO_CANCEL_INTERVAL_MS: z.coerce.number().int().min(MIN_AUTO_CANCEL_INTERVAL_MS).default(AUTO_CANCEL_INTERVAL_MS),
  CHECKOUT_PAYMENT_WINDOW_MS: z.coerce.number().int().min(MIN_PAYMENT_WINDOW_MS).default(CHECKOUT_PAYMENT_WINDOW_MS),
});
export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export function validateWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  return parseEnv(WorkerEnvSchema, source);
}
```

`apps/worker/src/interfaces/scheduler.interface.ts`:

```ts
/** The two timer calls the scheduler makes, so a test can drive them. */
export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SchedulerOptions {
  timers?: Timers;
  onError?: (error: unknown) => void;
}

/** Stops scheduling and resolves once the run in flight, if any, has finished. */
export type StopScheduler = () => Promise<void>;
```

`apps/worker/src/scheduler.ts`:

```ts
import type { SchedulerOptions, StopScheduler, Timers } from './interfaces/scheduler.interface';

const systemTimers: Timers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

/**
 * Runs `job` now, then `intervalMs` after each run *finishes* — a setTimeout
 * chain, not setInterval, so a slow run can never overlap the next one in this
 * process. Overlap across processes is the database's job (SKIP LOCKED).
 */
export function startInterval(
  job: () => Promise<void>,
  intervalMs: number,
  { timers = systemTimers, onError = () => undefined }: SchedulerOptions = {},
): StopScheduler {
  let stopped = false;
  let handle: unknown;
  let inFlight: Promise<void> = Promise.resolve();

  const tick = (): void => {
    inFlight = job()
      .catch(onError)
      .finally(() => {
        if (!stopped) handle = timers.setTimeout(tick, intervalMs);
      });
  };

  tick();

  return async () => {
    stopped = true;
    if (handle !== undefined) timers.clearTimeout(handle);
    await inFlight;
  };
}
```

`scripts/check-db-env.mjs` — three edits:

```js
// DB_ENV_ROOT exists for apps/worker/test/check-db-env.spec.ts, which runs this
// script against a temporary tree. Nothing else sets it.
const root = process.env.DB_ENV_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  { name: 'packages/database/.env', path: resolve(root, 'packages/database/.env') },
  { name: 'apps/api/.env', path: resolve(root, 'apps/api/.env') },
  // ADR 0001 amendment, obligation 1: the worker reads the same database from phase 4.
  { name: 'apps/worker/.env', path: resolve(root, 'apps/worker/.env') },
];
```

and replace the early exit:

```js
// Fewer than two files means there is nothing to compare. Not `< targets.length`:
// that skipped the comparison whenever any one file was missing, so adding a third
// target would have silently stopped comparing the other two.
if (found.length < 2) process.exit(0);
```

Update the header comment's first line to "DATABASE_URL lives in three places: packages/database/.env
(migrations), apps/api/.env and apps/worker/.env (runtime)."

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @app/runtime test && pnpm --filter worker exec vitest run && pnpm --filter worker lint && pnpm --filter worker typecheck && pnpm --filter worker build`
Expected: PASS — runtime +3; worker env 3, scheduler 4, check-db-env 4; lint, typecheck and build
clean. The integration config exists but is not wired into `test` until Task 18 gives it a file —
vitest exits 1 on "No test files found", and `--passWithNoTests` would let a deleted suite pass.

- [ ] **Step 6: Prove the boundary bites for the new app**

Temporarily add `import '../../api/src/app.module';` to `apps/worker/src/scheduler.ts`, run
`pnpm --filter worker lint`, confirm `boundaries/element-types` fails, revert.

- [ ] **Step 7: Commit**

```bash
git add apps/worker packages/runtime/src/config scripts/check-db-env.mjs pnpm-lock.yaml
git commit -m "feat(worker): scaffold apps/worker on packages/runtime; check-db-env covers its .env"
```

---

### Task 18: The auto-cancel job — cancel once, restore once

**Files:**
- Create: `apps/worker/src/interfaces/auto-cancel.interface.ts`,
  `apps/worker/src/auto-cancel/auto-cancel.repository.ts`, `apps/worker/src/auto-cancel/auto-cancel.job.ts`,
  `apps/worker/src/auto-cancel/auto-cancel.job.spec.ts`, `apps/worker/src/main.ts`,
  `apps/worker/test/support/fixtures.ts`, `apps/worker/test/support/logger.ts`,
  `apps/worker/test/auto-cancel.integration-spec.ts`
- Modify: `packages/runtime/src/constants.ts`, `packages/runtime/src/logging/logger.interface.ts`,
  `apps/worker/vitest.config.ts` (coverage thresholds), `apps/worker/package.json` (scripts)

**Interfaces:**
- Consumes: Task 17 (`startInterval`, `validateWorkerEnv`, constants); `byLockOrder`,
  `AUTO_CANCEL_BATCH_SIZE`, `CHECKOUT_PAYMENT_WINDOW_MS` (domain); Task 6's tables.
- Produces: `AutoCancelRepository.cancelExpired(cutoff: Date, batchSize: number): Promise<AutoCancelResult>`;
  `AutoCancelJob.run(): Promise<AutoCancelResult>` (never rejects); `AutoCancelResult { cancelled: number; restoredUnits: number }`;
  `LogEvents.CHECKOUT_AUTOCANCEL_RUN = 'checkout.autocancel.run'`,
  `CHECKOUT_AUTOCANCEL_FAILED = 'checkout.autocancel.failed'`, `WORKER_STARTED = 'worker.started'`,
  `WORKER_STOPPED = 'worker.stopped'`; the runnable `node apps/worker/dist/main.js`.

**The transaction (SRS-FR-CXL-001 … 003, INV-15).** The SRS writes the statement against
`checkout` / `placed_at`; the real table and column are `checkouts` / `"placedAt"` (finding 10).

```sql
UPDATE checkouts SET status = 'CANCELLED'
WHERE id IN (SELECT id FROM checkouts
             WHERE status = 'PENDING_PAYMENT' AND "placedAt" < $cutoff
             ORDER BY "placedAt" LIMIT $batch
             FOR UPDATE SKIP LOCKED)
  AND status = 'PENDING_PAYMENT'
RETURNING id
```

Only the returned ids are cancelled and restocked, in the same transaction: their orders move to
`CANCELLED`, and each product's ordered quantity is added back after locking the inventory rows in
the same `productId COLLATE "C"` order checkout uses. A checkout another run holds is skipped, not
waited on; a checkout no longer `PENDING_PAYMENT` is never returned. That is where "exactly once"
comes from — no queue, no flag, one conditional update (D70).

- [ ] **Step 1: Write the failing tests**

`apps/worker/test/support/logger.ts`:

```ts
import type { Logger } from '@app/runtime';

export interface CapturedLine {
  level: string;
  event: unknown;
  fields: Record<string, unknown>;
}

/** The API's capturing logger, repeated: apps never import apps (ADR 0001). */
export function captureLogger(): Logger & { lines: CapturedLine[] } {
  const lines: CapturedLine[] = [];
  const at =
    (level: string) =>
    (message: unknown, ...params: unknown[]) =>
      lines.push({
        level,
        event: message,
        fields: Object.assign({}, ...params.filter((p) => p !== null && typeof p === 'object')) as Record<string, unknown>,
      });
  return { lines, log: at('log'), error: at('error'), warn: at('warn'), debug: at('debug'), verbose: at('verbose') };
}
```

`Logger` is a type alias Step 3 adds to `@app/runtime`: at `3633695` `createLogger` returns Nest's
`LoggerService`, which the runtime package does not re-export, and the worker should not take a
dependency on `@nestjs/common` for one type.

`apps/worker/test/support/fixtures.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { CurrencyCodes, ProductStatuses, type CurrencyCode } from '@app/contracts';
import { PrismaClient } from '@app/database';

export const prisma = new PrismaClient();

export interface ProductFixture {
  id: string;
  organizationId: string;
  name: string;
  priceMinor: number;
  currency: CurrencyCode;
}

const suffix = () => randomUUID().slice(0, 8);

export async function stockedProduct(available: number, organizationId?: string): Promise<ProductFixture> {
  const orgId =
    organizationId ??
    (await prisma.organization.create({ data: { name: 'Worker seller', slug: `wk-${suffix()}` } })).id;
  return prisma.product.create({
    data: {
      organizationId: orgId,
      name: `Worker item ${suffix()}`,
      priceMinor: 1000,
      currency: CurrencyCodes.EGP,
      status: ProductStatuses.PUBLISHED,
      inventory: { create: { available } },
    },
    select: { id: true, organizationId: true, name: true, priceMinor: true, currency: true },
  });
}

/**
 * What a successful POST /checkouts commits, written directly: stock already
 * taken, one checkout, one order per seller. The worker suite cannot call the
 * API (apps never import apps), so it reproduces the committed state.
 */
export async function placedCheckout(
  placedAt: Date,
  lines: { product: ProductFixture; quantity: number }[],
): Promise<{ checkoutId: string }> {
  const buyer = await prisma.user.create({
    data: { email: `wk-${randomUUID()}@marketcore.test`, passwordHash: 'x' },
  });
  for (const line of lines) {
    await prisma.inventory.update({
      where: { productId: line.product.id },
      data: { available: { decrement: line.quantity } },
    });
  }
  const total = lines.reduce((sum, line) => sum + line.quantity * line.product.priceMinor, 0);
  const checkout = await prisma.checkout.create({
    data: { buyerId: buyer.id, totalMinor: total, currency: CurrencyCodes.EGP, placedAt },
  });
  const bySeller = new Map<string, typeof lines>();
  for (const line of lines) {
    bySeller.set(line.product.organizationId, [...(bySeller.get(line.product.organizationId) ?? []), line]);
  }
  for (const [organizationId, sellerLines] of bySeller) {
    await prisma.order.create({
      data: {
        checkoutId: checkout.id,
        organizationId,
        buyerId: buyer.id,
        totalMinor: sellerLines.reduce((sum, line) => sum + line.quantity * line.product.priceMinor, 0),
        currency: CurrencyCodes.EGP,
        items: {
          create: sellerLines.map((line) => ({
            productId: line.product.id,
            productName: line.product.name,
            quantity: line.quantity,
            unitPriceMinor: line.product.priceMinor,
          })),
        },
      },
    });
  }
  return { checkoutId: checkout.id };
}

export const availableOf = async (productId: string): Promise<number> =>
  (await prisma.inventory.findUniqueOrThrow({ where: { productId } })).available;

/** Long-expired: sorts ahead of any real backlog the shared database holds. */
export const LONG_AGO = (offsetMs: number) => new Date(Date.UTC(2000, 0, 1) + offsetMs);
```

`apps/worker/src/auto-cancel/auto-cancel.job.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { LogEvents } from '@app/runtime';
import { captureLogger } from '../../test/support/logger';
import { AutoCancelJob } from './auto-cancel.job';

const policy = { windowMs: 30 * 60_000, batchSize: 100 };
const now = new Date('2026-10-16T12:00:00.000Z');

describe('AutoCancelJob', () => {
  it('asks for checkouts placed before now − window, at most a batch (SRS-FR-CXL-001)', async () => {
    const cancelExpired = vi.fn().mockResolvedValue({ cancelled: 0, restoredUnits: 0 });
    await new AutoCancelJob({ cancelExpired }, captureLogger(), policy, () => now).run();

    expect(cancelExpired).toHaveBeenCalledWith(new Date('2026-10-16T11:30:00.000Z'), 100);
  });

  it('logs exactly one JSON line per run with event, cancelled and durationMs (SRS-FR-CXL-004)', async () => {
    const logger = captureLogger();
    const cancelExpired = vi.fn().mockResolvedValue({ cancelled: 3, restoredUnits: 7 });

    await new AutoCancelJob({ cancelExpired }, logger, policy, () => now).run();

    expect(logger.lines).toHaveLength(1);
    expect(logger.lines[0]).toMatchObject({
      event: LogEvents.CHECKOUT_AUTOCANCEL_RUN,
      fields: { cancelled: 3, restoredUnits: 7, durationMs: expect.any(Number) },
    });
  });

  it('never rejects: a failed run is one error line, and the next run tries again', async () => {
    const logger = captureLogger();
    const cancelExpired = vi.fn().mockRejectedValue(new Error('connection refused'));

    await expect(new AutoCancelJob({ cancelExpired }, logger, policy, () => now).run()).resolves.toEqual({
      cancelled: 0,
      restoredUnits: 0,
    });
    expect(logger.lines).toEqual([
      expect.objectContaining({ level: 'error', event: LogEvents.CHECKOUT_AUTOCANCEL_FAILED }),
    ]);
  });
});
```

`apps/worker/test/auto-cancel.integration-spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CheckoutStatuses, OrderStatuses } from '@app/contracts';
import { PrismaClient } from '@app/database';
import { AUTO_CANCEL_BATCH_SIZE, CHECKOUT_PAYMENT_WINDOW_MS } from '@app/domain';
import { AutoCancelJob } from '../src/auto-cancel/auto-cancel.job';
import { AutoCancelRepository } from '../src/auto-cancel/auto-cancel.repository';
import { LONG_AGO, availableOf, placedCheckout, prisma, stockedProduct, type ProductFixture } from './support/fixtures';
import { captureLogger } from './support/logger';

const policy = { windowMs: CHECKOUT_PAYMENT_WINDOW_MS, batchSize: AUTO_CANCEL_BATCH_SIZE };
const MINUTE = 60_000;

// Two clients, two pools: the "two workers" of INV-15 are two processes' worth of connections.
const prismaA = new PrismaClient();
const prismaB = new PrismaClient();
const jobOn = (client: PrismaClient, batchSize = policy.batchSize) =>
  new AutoCancelJob(new AutoCancelRepository(client), captureLogger(), { ...policy, batchSize });

async function drain(): Promise<void> {
  // The database is shared with the API suites, which leave PENDING_PAYMENT
  // checkouts behind. Clear the due backlog so each case reasons about its own rows.
  const job = jobOn(prisma);
  while ((await job.run()).cancelled > 0) {
    /* keep going until nothing is due */
  }
}

async function tenExpiredCheckouts() {
  const p1 = await stockedProduct(100);
  const p2 = await stockedProduct(100);
  const p3 = await stockedProduct(100, p1.organizationId);
  const ordered = new Map<string, number>([[p1.id, 0], [p2.id, 0], [p3.id, 0]]);
  const checkoutIds: string[] = [];

  for (let i = 0; i < 10; i++) {
    const lines: { product: ProductFixture; quantity: number }[] = [
      { product: p1, quantity: 1 + (i % 3) },
      { product: p2, quantity: 1 },
      ...(i % 2 === 0 ? [{ product: p3, quantity: 2 }] : []),
    ];
    for (const line of lines) ordered.set(line.product.id, (ordered.get(line.product.id) ?? 0) + line.quantity);
    checkoutIds.push((await placedCheckout(LONG_AGO(i), lines)).checkoutId);
  }

  const before = new Map<string, number>();
  for (const id of ordered.keys()) before.set(id, await availableOf(id));
  return { checkoutIds, ordered, before };
}

async function expectCancelledAndRestoredOnce(fixture: Awaited<ReturnType<typeof tenExpiredCheckouts>>) {
  const checkouts = await prisma.checkout.findMany({
    where: { id: { in: fixture.checkoutIds } },
    include: { orders: true },
  });
  expect(checkouts.every((c) => c.status === CheckoutStatuses.CANCELLED)).toBe(true);
  expect(checkouts.flatMap((c) => c.orders).every((o) => o.status === OrderStatuses.CANCELLED)).toBe(true);
  for (const [productId, quantity] of fixture.ordered) {
    expect({ productId, available: await availableOf(productId) }).toEqual({
      productId,
      available: (fixture.before.get(productId) ?? 0) + quantity,
    });
  }
}

beforeAll(drain);

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), prismaA.$disconnect(), prismaB.$disconnect()]);
});

describe('auto-cancel (worker integration)', () => {
  it('two runs in parallel over 10 expired checkouts restore each product exactly once (SRS-NFR-REL-003, INV-15)', async () => {
    const fixture = await tenExpiredCheckouts();

    const [a, b] = await Promise.all([jobOn(prismaA).run(), jobOn(prismaB).run()]);

    expect(a.cancelled + b.cancelled).toBeGreaterThanOrEqual(10);
    await expectCancelledAndRestoredOnce(fixture);

    // A third run finds nothing of ours and changes nothing.
    await jobOn(prismaA).run();
    await expectCancelledAndRestoredOnce(fixture);
  });

  it('interleaved one-at-a-time runs in parallel still restore exactly once (SKIP LOCKED under contention)', async () => {
    const fixture = await tenExpiredCheckouts();
    const loop = async (client: PrismaClient) => {
      const job = jobOn(client, 1);
      while ((await job.run()).cancelled > 0) {
        /* one checkout per run, racing the other loop */
      }
    };

    await Promise.all([loop(prismaA), loop(prismaB)]);

    await expectCancelledAndRestoredOnce(fixture);
  });

  it('cancels at 31 minutes and leaves 29 minutes alone (D70)', async () => {
    const product = await stockedProduct(10);
    const due = await placedCheckout(new Date(Date.now() - 31 * MINUTE), [{ product, quantity: 1 }]);
    const notYet = await placedCheckout(new Date(Date.now() - 29 * MINUTE), [{ product, quantity: 2 }]);

    await jobOn(prisma).run();

    expect((await prisma.checkout.findUniqueOrThrow({ where: { id: due.checkoutId } })).status).toBe(CheckoutStatuses.CANCELLED);
    expect((await prisma.checkout.findUniqueOrThrow({ where: { id: notYet.checkoutId } })).status).toBe(
      CheckoutStatuses.PENDING_PAYMENT,
    );
    expect(await availableOf(product.id)).toBe(10 - 2); // the due unit came back; the pending two did not
  });

  it('never touches a checkout that is no longer PENDING_PAYMENT (SRS-FR-CXL-003)', async () => {
    const product = await stockedProduct(10);
    const { checkoutId } = await placedCheckout(LONG_AGO(100), [{ product, quantity: 3 }]);
    // Stand-in for "a payment won the race": phase 6 makes this PAID; today the only
    // other state is CANCELLED, already restocked by whoever cancelled it.
    await prisma.checkout.update({ where: { id: checkoutId }, data: { status: CheckoutStatuses.CANCELLED } });

    await jobOn(prisma).run();

    expect(await availableOf(product.id)).toBe(7);
  });

  it('skips a checkout another transaction holds, without waiting for it, and cancels it on the next run', async () => {
    const product = await stockedProduct(10);
    const { checkoutId } = await placedCheckout(LONG_AGO(200), [{ product, quantity: 1 }]);

    let release!: () => void;
    let locked!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const holder = prismaB.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM checkouts WHERE id = ${checkoutId} FOR UPDATE`;
        locked();
        await held;
      },
      { timeout: 20_000 },
    );

    try {
      await isLocked;
      const started = Date.now();
      await jobOn(prismaA).run();
      expect(Date.now() - started).toBeLessThan(5_000); // skipped, not waited on
      expect((await prisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } })).status).toBe(
        CheckoutStatuses.PENDING_PAYMENT,
      );
    } finally {
      release();
      await holder;
    }

    await jobOn(prismaA).run();
    expect((await prisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } })).status).toBe(CheckoutStatuses.CANCELLED);
    expect(await availableOf(product.id)).toBe(10);
  });

  it('a worker that was down for hours cancels the backlog on its first run (failure-scenarios: worker down)', async () => {
    const product = await stockedProduct(10);
    const { checkoutId } = await placedCheckout(new Date(Date.now() - 6 * 60 * MINUTE), [{ product, quantity: 4 }]);

    // A freshly constructed job is a restarted worker; startInterval runs it at once (Task 17).
    await jobOn(prisma).run();

    expect((await prisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } })).status).toBe(CheckoutStatuses.CANCELLED);
    expect(await availableOf(product.id)).toBe(10);
  });
});
```

`apps/worker/package.json` — wire the integration suite in, now that it has a file:

```json
"test": "vitest run && vitest run -c vitest.integration.config.ts",
"test:coverage": "vitest run --coverage && vitest run -c vitest.integration.config.ts",
"test:integration": "vitest run -c vitest.integration.config.ts",
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter worker test`
Expected: FAIL — `Failed to resolve import "./auto-cancel.job"` and
`"../src/auto-cancel/auto-cancel.repository"`.

- [ ] **Step 3: Implement**

Append to `LogEvents` in `packages/runtime/src/constants.ts`:

```ts
  /** SRS-FR-CXL-004: one line per auto-cancel run. */
  CHECKOUT_AUTOCANCEL_RUN: 'checkout.autocancel.run',
  CHECKOUT_AUTOCANCEL_FAILED: 'checkout.autocancel.failed',
  WORKER_STARTED: 'worker.started',
  WORKER_STOPPED: 'worker.stopped',
```

`apps/worker/src/interfaces/auto-cancel.interface.ts`:

```ts
export interface AutoCancelResult {
  cancelled: number;
  restoredUnits: number;
}

export interface AutoCancelPolicy {
  windowMs: number;
  batchSize: number;
}

/** The one call the job makes, so the job can be tested without a database. */
export interface AutoCancelStore {
  cancelExpired(cutoff: Date, batchSize: number): Promise<AutoCancelResult>;
}
```

`apps/worker/src/auto-cancel/auto-cancel.repository.ts`:

```ts
import { CheckoutStatuses, OrderStatuses } from '@app/contracts';
import { Prisma, type PrismaClient } from '@app/database';
import { byLockOrder } from '@app/domain';
import type { AutoCancelResult, AutoCancelStore } from '../interfaces/auto-cancel.interface';
import { AUTO_CANCEL_TRANSACTION_TIMEOUT_MS } from '../worker.constants';

/**
 * Cancels unpaid checkouts and restores their stock exactly once (D70, INV-15).
 *
 * The UPDATE is conditional on PENDING_PAYMENT and its subquery takes row locks
 * with SKIP LOCKED, so two runs — in this process or another — divide the due
 * checkouts between them instead of both claiming one; only the ids an UPDATE
 * actually returned are restocked. Inventory is locked in the order checkout
 * locks it, so this transaction and a checkout can never deadlock.
 */
export class AutoCancelRepository implements AutoCancelStore {
  constructor(private readonly prisma: PrismaClient) {}

  cancelExpired(cutoff: Date, batchSize: number): Promise<AutoCancelResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const cancelled = await tx.$queryRaw<{ id: string }[]>`
          UPDATE checkouts SET status = ${CheckoutStatuses.CANCELLED}::"CheckoutStatus"
          WHERE id IN (
            SELECT id FROM checkouts
            WHERE status = ${CheckoutStatuses.PENDING_PAYMENT}::"CheckoutStatus"
              AND "placedAt" < ${cutoff}
            ORDER BY "placedAt"
            LIMIT ${batchSize}
            FOR UPDATE SKIP LOCKED)
          AND status = ${CheckoutStatuses.PENDING_PAYMENT}::"CheckoutStatus"
          RETURNING id`;
        if (cancelled.length === 0) return { cancelled: 0, restoredUnits: 0 };

        const checkoutIds = cancelled.map((row) => row.id);
        // Every order of a checkout moves with it (domain-model §5).
        await tx.order.updateMany({
          where: { checkoutId: { in: checkoutIds }, status: OrderStatuses.PENDING_PAYMENT },
          data: { status: OrderStatuses.CANCELLED },
        });

        const restock = await tx.orderItem.groupBy({
          by: ['productId'],
          where: { order: { checkoutId: { in: checkoutIds } } },
          _sum: { quantity: true },
        });
        const units = new Map(restock.map((row) => [row.productId, row._sum.quantity ?? 0]));
        const productIds = [...units.keys()].sort(byLockOrder);

        await tx.$queryRaw`
          SELECT 1 FROM inventory WHERE "productId" IN (${Prisma.join(productIds)})
          ORDER BY "productId" COLLATE "C" FOR UPDATE`;

        let restoredUnits = 0;
        for (const productId of productIds) {
          const quantity = units.get(productId) ?? 0;
          await tx.inventory.update({ where: { productId }, data: { available: { increment: quantity } } });
          restoredUnits += quantity;
        }
        return { cancelled: checkoutIds.length, restoredUnits };
      },
      { timeout: AUTO_CANCEL_TRANSACTION_TIMEOUT_MS },
    );
  }
}
```

`apps/worker/src/auto-cancel/auto-cancel.job.ts`:

```ts
import { LogEvents, type Logger } from '@app/runtime';
import type { AutoCancelPolicy, AutoCancelResult, AutoCancelStore } from '../interfaces/auto-cancel.interface';

const NOTHING: AutoCancelResult = { cancelled: 0, restoredUnits: 0 };
const elapsedMs = (started: number) => Math.round((performance.now() - started) * 1000) / 1000;

/**
 * One run: work out the cutoff from the clock, cancel what is due, log one line
 * (SRS-FR-CXL-004). It never rejects — a failed run is logged and the scheduler
 * tries again an interval later, which is all a retry could do.
 */
export class AutoCancelJob {
  constructor(
    private readonly store: AutoCancelStore,
    private readonly logger: Logger,
    private readonly policy: AutoCancelPolicy,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async run(): Promise<AutoCancelResult> {
    const started = performance.now();
    const cutoff = new Date(this.clock().getTime() - this.policy.windowMs);

    try {
      const result = await this.store.cancelExpired(cutoff, this.policy.batchSize);
      this.logger.log(LogEvents.CHECKOUT_AUTOCANCEL_RUN, {
        cancelled: result.cancelled,
        restoredUnits: result.restoredUnits,
        durationMs: elapsedMs(started),
      });
      return result;
    } catch (error) {
      this.logger.error(LogEvents.CHECKOUT_AUTOCANCEL_FAILED, {
        message: error instanceof Error ? error.message : String(error),
        durationMs: elapsedMs(started),
      });
      return NOTHING;
    }
  }
}
```

`packages/runtime/src/logging/logger.interface.ts` — add the alias the worker types against:

```ts
/**
 * What `createLogger` returns, under a name the worker can import without
 * depending on @nestjs/common itself.
 */
export type { LoggerService as Logger } from '@nestjs/common';
```

`apps/worker/src/main.ts`:

```ts
import 'dotenv/config';
import { PrismaClient } from '@app/database';
import { AUTO_CANCEL_BATCH_SIZE } from '@app/domain';
import { LogEvents, createLogger } from '@app/runtime';
import { AutoCancelJob } from './auto-cancel/auto-cancel.job';
import { AutoCancelRepository } from './auto-cancel/auto-cancel.repository';
import { validateWorkerEnv } from './config/worker-env';
import { startInterval } from './scheduler';
import { SHUTDOWN_SIGNALS, WORKER_LOGGER_CONTEXT } from './worker.constants';

/**
 * The worker process (ADR 0001, amended): one job, on an interval, against
 * PostgreSQL only. Validates its environment before touching anything, so a bad
 * deploy fails at boot with a list of what is wrong.
 */
function main(): void {
  const env = validateWorkerEnv();
  const logger = createLogger(WORKER_LOGGER_CONTEXT);
  const prisma = new PrismaClient();
  const job = new AutoCancelJob(new AutoCancelRepository(prisma), logger, {
    windowMs: env.CHECKOUT_PAYMENT_WINDOW_MS,
    batchSize: AUTO_CANCEL_BATCH_SIZE,
  });

  const stop = startInterval(
    async () => {
      await job.run();
    },
    env.AUTO_CANCEL_INTERVAL_MS,
  );
  logger.log(LogEvents.WORKER_STARTED, {
    intervalMs: env.AUTO_CANCEL_INTERVAL_MS,
    windowMs: env.CHECKOUT_PAYMENT_WINDOW_MS,
    batchSize: AUTO_CANCEL_BATCH_SIZE,
  });

  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      void stop()
        .then(() => prisma.$disconnect())
        .then(() => {
          logger.log(LogEvents.WORKER_STOPPED, { signal });
          process.exit(0);
        });
    });
  }
}

main();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @app/runtime build && pnpm --filter worker test`
Expected: PASS — unit: job 3 + Task 17's 11; integration: 6 cases. The interleaved case is the slow
one (one checkout per transaction, ~10 round trips per loop).

- [ ] **Step 5: Prove the exactly-once test bites**

The mutation that matters is to stop trusting the conditional UPDATE: replace the
`UPDATE … RETURNING id` with a plain, unlocked
`SELECT id FROM checkouts WHERE status = 'PENDING_PAYMENT' AND "placedAt" < $cutoff ORDER BY "placedAt" LIMIT $batch`
followed by an unconditional `tx.checkout.updateMany({ where: { id: { in: ids } }, data: { status: CANCELLED } })`
— the read-then-write shape a first draft would write. Run `pnpm --filter worker test:integration`.
Expected: FAIL in the first two cases — both runs read the same ids and both restock, so `available`
exceeds `before + ordered`. Revert, and record the observed over-restock for STATUS.md.

- [ ] **Step 6: Set the coverage floor and run the process once by hand**

Run `pnpm --filter worker exec vitest run --coverage`, then set
`coverage.thresholds` in `apps/worker/vitest.config.ts` to five points below each measured value
(the precedent in `packages/domain/vitest.config.ts`), with the measured numbers in a comment.

```bash
pnpm --filter worker build
cp apps/worker/.env.example apps/worker/.env
AUTO_CANCEL_INTERVAL_MS=1000 node apps/worker/dist/main.js & WORKER=$!; sleep 3; kill -TERM $WORKER; wait $WORKER; echo "exit $?"
```

Expected: one `{"level":"log","event":"worker.started",…}` line, then about three
`{"level":"log","event":"checkout.autocancel.run","context":"worker","cancelled":0,"restoredUnits":0,"durationMs":…}`
lines, then `worker.stopped` with `"signal":"SIGTERM"`, and `exit 0`. Paste the lines into the
task's commit message.

- [ ] **Step 7: Commit**

```bash
git add apps/worker packages/runtime/src/constants.ts
git commit -m "feat(worker): auto-cancel unpaid checkouts once, restoring stock once (D70, INV-15)"
```

---

### Task 19: The worker in the image, the compose stack, turbo and CI

**Files:**
- Create: `apps/worker/Dockerfile`
- Modify: `docker-compose.e2e.yml`, `.github/workflows/ci.yml`, `apps/e2e/support/compose.ts`,
  `README.md` (quick start)

**Interfaces:**
- Consumes: Task 18's `node apps/worker/dist/main.js`; D87's env overrides.
- Produces: compose service `worker` (image `marketcore-e2e-worker`) with
  `AUTO_CANCEL_INTERVAL_MS=1000`, `CHECKOUT_PAYMENT_WINDOW_MS=20000`; `serviceLogs(service)` in
  `apps/e2e/support/compose.ts` (`apiLogs()` becomes `serviceLogs('api')`); CI uploads worker logs on
  failure.

**Release plan §7, and what it needs no change for.** turbo discovers `apps/worker` as a workspace;
its `lint`, `typecheck`, `test`, `test:coverage` and `build` scripts join the existing pipeline, and
`turbo.json`'s `test` task already declares `DATABASE_URL`, the only variable the worker's suites
read. `REDIS_URL` joins in phase 10, not now (ADR 0001 amendment, obligation 2). CI's `ci` job runs
`turbo run … test:coverage`, which now includes the worker's integration suite against the job's
Postgres service — no new step is needed for it.

- [ ] **Step 1: Prove the pipeline sees the worker**

Run: `pnpm turbo run lint typecheck test build --filter worker --dry=json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).tasks.map(t=>t.taskId).sort().join('\n')))"`
Expected: `worker#build`, `worker#lint`, `worker#test`, `worker#typecheck` among the listed tasks, and
`worker#test`'s `environmentVariables.specified.env` includes `DATABASE_URL`.

- [ ] **Step 2: Write the image**

`apps/worker/Dockerfile` — the API image's structure and reasoning, for the worker:

```dockerfile
# The built worker, for the behavioural harness. Same shape as apps/api/Dockerfile
# and for the same reasons: the context is the repository root because the worker
# depends on workspace packages, and openssl is installed before `pnpm install`
# so `prisma generate` picks an engine that loads on this image.
FROM node:22-slim AS build
RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@9.15.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# `worker...` builds the worker and its workspace dependencies.
RUN pnpm --filter "worker..." run build

FROM node:22-slim AS runtime
RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build --chown=node:node /repo /repo
USER node
CMD ["node", "apps/worker/dist/main.js"]
```

- [ ] **Step 3: Add the worker to the behavioural stack**

`docker-compose.e2e.yml` — a new service after `api`:

```yaml
  # The worker, as a separate process against the same database (ADR 0001). Its
  # window is 20 seconds here instead of D70's 30 minutes (D87), so the behavioural
  # suite can watch an abandoned checkout restock; the code path is the same.
  worker:
    image: marketcore-e2e-worker
    build: { context: ., dockerfile: apps/worker/Dockerfile }
    environment:
      APP_NAME: marketcore
      DATABASE_URL: postgresql://app:app@db:5432/app_e2e
      AUTO_CANCEL_INTERVAL_MS: 1000
      CHECKOUT_PAYMENT_WINDOW_MS: 20000
    depends_on:
      migrate: { condition: service_completed_successfully }
```

`apps/e2e/support/compose.ts` — generalise `apiLogs` without changing its callers:

```ts
export function serviceLogs(service: 'api' | 'worker'): string {
  return execFileSync(
    'docker',
    ['compose', '-f', join(repositoryRoot(), 'docker-compose.e2e.yml'), 'logs', '--no-log-prefix', service],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
}

export function apiLogs(): string {
  return serviceLogs('api');
}
```

`.github/workflows/ci.yml` — in the `behavioural` job, after the "API logs" step:

```yaml
      - name: Worker logs
        if: failure()
        run: docker compose -f docker-compose.e2e.yml logs --no-log-prefix worker
```

and in the `ci` job, after `db:seed`, so the concurrency suite's timing is visible in the log on
its own line rather than buried in the coverage run:

```yaml
      # The flagship race (SRS-NFR-REL-001) also runs inside test:coverage below; run it
      # first on its own so its 20 runs report separately.
      - run: pnpm --filter api test:concurrency
```

`README.md` — in the quick start, beside the existing `cp apps/api/.env.example apps/api/.env`, add
`cp apps/worker/.env.example apps/worker/.env`, and under "run it" add
`pnpm --filter worker dev   # auto-cancels unpaid checkouts every 60 s`.

- [ ] **Step 4: Bring the stack up and watch the worker run**

```bash
docker compose -f docker-compose.e2e.yml up -d --build --wait
docker compose -f docker-compose.e2e.yml logs --no-log-prefix worker | grep -c '"event":"checkout.autocancel.run"'
pnpm --filter e2e test:behavioural
docker compose -f docker-compose.e2e.yml down -v
```

Expected: `--wait` returns once the API is healthy (the worker has no healthcheck; `running` is its
ready state); the `grep -c` prints a number ≥ 1; the existing behavioural suite passes unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/Dockerfile docker-compose.e2e.yml .github/workflows/ci.yml apps/e2e/support/compose.ts README.md
git commit -m "build(worker): image, behavioural stack service, CI logs and the race on its own step"
```

---
### Task 20: Web — the shop shell, the buyer BFF, money and product URLs

**Files:**
- Create: `apps/web/src/app/(shop)/layout.tsx`, `apps/web/src/app/(shop)/store-frame.tsx`,
  `apps/web/src/app/(shop)/store-frame.test.tsx`, `apps/web/src/lib/http/buyer-route.ts`,
  `apps/web/src/lib/money.ts`, `apps/web/src/lib/money.test.ts`,
  `apps/web/src/lib/storefront/product-path.ts`, `apps/web/src/lib/storefront/product-path.test.ts`,
  `apps/web/src/lib/storefront/client.ts`, `apps/web/src/lib/storefront/client.test.ts`;
  BFF routes `apps/web/src/app/api/storefront/products/route.ts`,
  `apps/web/src/app/api/storefront/products/[id]/route.ts`, `apps/web/src/app/api/cart/route.ts`,
  `apps/web/src/app/api/cart/items/[productId]/route.ts`, `apps/web/src/app/api/checkouts/route.ts`,
  `apps/web/src/app/api/checkouts/[id]/route.ts`, `apps/web/src/app/api/buyer/orders/route.ts`,
  `apps/web/src/app/api/buyer/orders/[id]/route.ts`
- Modify: `apps/web/src/lib/auth/resources.ts`, `apps/web/src/lib/session/routing.ts`,
  `apps/web/src/lib/session/routing.test.ts`, `apps/web/src/middleware.ts`,
  `apps/web/src/app/(dash)/products/page.tsx` (use `formatMoney`)

**Interfaces:**
- Consumes: every buyer route of Tasks 10–16; the contracts of Tasks 4–5.
- Produces: `formatMoney(amountMinor: number, currency: CurrencyCode): string`;
  `productPath(product: { id: string; name: string }): string` and
  `productIdFromSlug(slug: string): string` (D76); `storefront` — the browser-side client
  (`products`, `product`, `cart`, `setLine`, `removeLine`, `placeCheckout`, `checkout`, `orders`,
  `order`) throwing `StorefrontError { status, code, message, details }`; `asBuyer(run)` for every
  buyer BFF route; `StoreFrame` — the storefront chrome, and **the seam T-002 restyles**.

**The T-002 dependency.** The release plan makes T-021 depend on T-002 (the shell re-skin). The shop
does not render inside the operator shell — a buyer has no organization, and `DashboardChrome`
answers that with onboarding (finding 20) — so its only shared chrome is `StoreFrame`'s top bar.
This task builds `StoreFrame` from the existing Quartz tokens (`bg-panel`, `border-rule`,
`text-ink`, `text-ink-muted`) and the Stitch 057 top-bar layout; when T-002 lands its breadcrumb top
bar and user chip, `StoreFrame` adopts them in that task, and nothing else in Tasks 21–24 changes.

**Routing.** Storefront pages live under a new `(shop)` route group at the root (`/browse`, `/p/…`,
`/cart`, `/checkout`, `/orders/…`, `/account/…`) as PRD §7.4 lists them. The operator UI stays at
`/dashboard` and `/products` — architecture.md's `/admin` prefix is not what the code has (finding 23),
and these paths do not collide with it either way.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/money.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatMoney } from './money';

describe('formatMoney', () => {
  it('formats integer minor units in the currency', () => {
    expect(formatMoney(24_900, 'EGP')).toMatch(/249\.00/);
    expect(formatMoney(1, 'USD')).toBe('$0.01');
  });
});
```

`apps/web/src/lib/storefront/product-path.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { productIdFromSlug, productPath } from './product-path';

const id = '66666666-6666-4666-8666-666666666666';

describe('product URLs (D76)', () => {
  it('is /p/{name-slug}-{id}', () => {
    expect(productPath({ id, name: 'Nile Cotton Shirt' })).toBe(`/p/nile-cotton-shirt-${id}`);
  });

  it('reads only the id: a renamed product keeps working at its old URL', () => {
    expect(productIdFromSlug(`nile-cotton-shirt-${id}`)).toBe(id);
    expect(productIdFromSlug(`anything-else-${id}`)).toBe(id);
  });

  it('survives a name with nothing sluggable in it', () => {
    expect(productPath({ id, name: '★★★' })).toBe(`/p/${id}`);
    expect(productIdFromSlug(id)).toBe(id);
  });
});
```

`apps/web/src/lib/storefront/client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { storefront, StorefrontError } from './client';

afterEach(() => vi.unstubAllGlobals());

const respond = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe('storefront client', () => {
  it('keeps the typed 409 details the cart and review step branch on (SRS §8)', async () => {
    const details = { lines: [{ productId: 'p1', reason: 'SOLD_OUT', available: 0, currentUnitPriceMinor: 100 }] };
    respond(409, { error: { code: 'CONFLICT', message: 'Some lines…', requestId: 'r', details } });

    const error = await storefront.placeCheckout({ lines: [{ productId: 'p1', quantity: 1, unitPriceMinor: 100 }] }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(StorefrontError);
    expect(error).toMatchObject({ status: 409, code: 'CONFLICT', details });
  });

  it('refuses a response that does not match the contract rather than rendering it', async () => {
    respond(200, { sellers: [], id: 'leak' });
    await expect(storefront.cart()).rejects.toThrow();
  });
});
```

`apps/web/src/lib/session/routing.test.ts` — append:

```ts
describe('storefront routes are signed-in only (SRS §5)', () => {
  it.each(['/browse', '/p/shirt-66666666-6666-4666-8666-666666666666', '/cart', '/checkout', '/orders/k1/placed', '/account/orders'])(
    '%s sends an anonymous visitor to sign in, and back',
    (path) => {
      expect(decideRoute(path, false)).toEqual({
        kind: 'redirect',
        to: `/login?next=${encodeURIComponent(path)}`,
      });
    },
  );

  it('does not catch routes that merely share a prefix', () => {
    expect(isProtected('/products')).toBe(false);
    expect(isProtected('/pricing')).toBe(false);
  });
});
```

`apps/web/src/app/(shop)/store-frame.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), pathname: vi.fn(() => '/browse') }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => mocks.pathname(),
}));

import { SessionProvider } from '@/lib/session/client';
import { StoreFrame } from './store-frame';

const BUYER = { user: { id: 'u1', email: 'buyer@marketcore.test' }, organizations: [], activeOrganizationId: null };

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.replace.mockReset();
});

const renderFrame = (sessionStatus: number, body: unknown) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: sessionStatus })));
  render(
    <SessionProvider>
      <StoreFrame appName="marketcore">
        <p>page body</p>
      </StoreFrame>
    </SessionProvider>,
  );
};

describe('StoreFrame', () => {
  it('serves a buyer with no organization — no onboarding gate (D53)', async () => {
    renderFrame(200, BUYER);

    expect(await screen.findByText('page body')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cart' }).getAttribute('href')).toBe('/cart');
    expect(screen.getByRole('link', { name: 'My orders' }).getAttribute('href')).toBe('/account/orders');
    expect(screen.queryByText(/create an organization/i)).toBeNull();
  });

  it('sends an anonymous visitor to sign in and back to this page', async () => {
    renderFrame(401, { error: { code: 'UNAUTHORIZED', message: 'No session', requestId: 'r' } });

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?next=%2Fbrowse'));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test`
Expected: FAIL — `Failed to resolve import "./money"`, `"./product-path"`, `"./client"`,
`"./store-frame"`; the routing cases fail because `/browse` is not protected.

- [ ] **Step 3: Implement**

`apps/web/src/lib/money.ts`:

```ts
import type { CurrencyCode } from '@app/contracts';

const LOCALES: Record<CurrencyCode, string> = { EGP: 'en-EG', USD: 'en-US', EUR: 'en-IE' };

/** Minor units per major unit. Every currency in the closed set has two decimals. */
const MINOR_PER_MAJOR: Record<CurrencyCode, number> = { EGP: 100, USD: 100, EUR: 100 };

/**
 * The one place in the repository that divides money — for display only, after
 * every calculation has been done in integers (platform D9).
 */
export function formatMoney(amountMinor: number, currency: CurrencyCode): string {
  return new Intl.NumberFormat(LOCALES[currency], {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(amountMinor / MINOR_PER_MAJOR[currency]);
}
```

`apps/web/src/app/(dash)/products/page.tsx` — delete its local `LOCALES` and `money`, import
`formatMoney` from `@/lib/money`, and replace each `money(x, product.currency)` call with
`formatMoney(x, product.currency)`. The products page renders the same text; its behavioural test is
the regression check.

`apps/web/src/lib/storefront/product-path.ts`:

```ts
/** A product id is a v4 UUID, 36 characters (Prisma `@default(uuid())`). */
const PRODUCT_ID_LENGTH = 36;

/**
 * `/p/{name-slug}-{id}` (D76). The slug is cosmetic: only the trailing id is read,
 * so a renamed product's old links keep working and Product needs no slug column.
 */
export function productPath(product: { id: string; name: string }): string {
  const slug = product.name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `/p/${slug.length > 0 ? `${slug}-` : ''}${product.id}`;
}

export function productIdFromSlug(slug: string): string {
  return slug.slice(-PRODUCT_ID_LENGTH);
}
```

`apps/web/src/lib/auth/resources.ts` — add to the contracts import `BuyerOrderPageSchema,
BuyerOrderSchema, CartSchema, CheckoutSchema, PublicProductPageSchema, PublicProductSchema` and the
types `BuyerOrder, BuyerOrderPage, Cart, Checkout, CreateCheckoutRequest, PublicProduct,
PublicProductPage, SetCartLineRequest`, then add to the returned object:

```ts
    // Buyer routes (D75): tenant-free, so no x-organization-id — the API resolves
    // the buyer from the token alone.
    storefrontProducts: (cursor?: string): Promise<PublicProductPage> =>
      client.get(withCursor('/storefront/products', cursor), PublicProductPageSchema),

    storefrontProduct: (id: string): Promise<PublicProduct> =>
      client.get(`/storefront/products/${encodeURIComponent(id)}`, PublicProductSchema),

    cart: (): Promise<Cart> => client.get('/cart', CartSchema),

    setCartLine: (productId: string, body: SetCartLineRequest): Promise<Cart> =>
      client.put(`/cart/items/${encodeURIComponent(productId)}`, CartSchema, { body }),

    removeCartLine: (productId: string): Promise<Cart> =>
      client.delete(`/cart/items/${encodeURIComponent(productId)}`, CartSchema),

    placeCheckout: (body: CreateCheckoutRequest): Promise<Checkout> =>
      client.post('/checkouts', CheckoutSchema, { body }),

    checkout: (id: string): Promise<Checkout> =>
      client.get(`/checkouts/${encodeURIComponent(id)}`, CheckoutSchema),

    buyerOrders: (cursor?: string): Promise<BuyerOrderPage> =>
      client.get(withCursor('/buyer/orders', cursor), BuyerOrderPageSchema),

    buyerOrder: (id: string): Promise<BuyerOrder> =>
      client.get(`/buyer/orders/${encodeURIComponent(id)}`, BuyerOrderSchema),
```

and, above `createResources`:

```ts
const withCursor = (path: string, cursor: string | undefined): string =>
  cursor === undefined ? path : `${path}?cursor=${encodeURIComponent(cursor)}`;
```

`apps/web/src/lib/http/buyer-route.ts`:

```ts
import { createResources } from '@/lib/auth/resources';
import { currentAccessToken, loadCurrentSession } from '@/lib/session/server';
import { newRequestId } from './request-id';
import { failure, noSession } from './responses';

type Resources = ReturnType<typeof createResources>;

/**
 * The shape of every buyer BFF route: load the session first (which is what
 * rotates a stale token), then call the API as that buyer. Unlike the tenant
 * routes it adds no organization header — a buyer route is tenant-free (D75), and
 * the API never trusts a buyer id from the request anyway.
 */
export async function asBuyer(
  run: (resources: Resources, requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = newRequestId();
  try {
    const session = await loadCurrentSession();
    if (session === null) return noSession(requestId);
    return await run(createResources(await currentAccessToken()), requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}
```

The eight BFF route files — each re-parses the API's answer with the contract on the way out, the
rule `app/api/products/route.ts` states:

`apps/web/src/app/api/storefront/products/route.ts`:

```ts
import { PublicProductPageSchema } from '@app/contracts';
import { asBuyer } from '@/lib/http/buyer-route';

export function GET(request: Request): Promise<Response> {
  const cursor = new URL(request.url).searchParams.get('cursor') ?? undefined;
  return asBuyer(async (api) => Response.json(PublicProductPageSchema.parse(await api.storefrontProducts(cursor))));
}
```

`apps/web/src/app/api/storefront/products/[id]/route.ts`:

```ts
import { PublicProductSchema } from '@app/contracts';
import { asBuyer } from '@/lib/http/buyer-route';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return asBuyer(async (api) => Response.json(PublicProductSchema.parse(await api.storefrontProduct(id))));
}
```

`apps/web/src/app/api/cart/route.ts`:

```ts
import { CartSchema } from '@app/contracts';
import { asBuyer } from '@/lib/http/buyer-route';

export function GET(): Promise<Response> {
  return asBuyer(async (api) => Response.json(CartSchema.parse(await api.cart())));
}
```

`apps/web/src/app/api/cart/items/[productId]/route.ts`:

```ts
import { CartSchema, SetCartLineRequestSchema } from '@app/contracts';
import { parseBody, readJson } from '@/lib/http/body';
import { asBuyer } from '@/lib/http/buyer-route';
import { respondTo } from '@/lib/http/responses';

type Context = { params: Promise<{ productId: string }> };

export async function PUT(request: Request, { params }: Context): Promise<Response> {
  const { productId } = await params;
  return asBuyer(async (api, requestId) => {
    // Refused here with the API's own envelope, so an 11th unit never leaves the BFF.
    const body = parseBody(SetCartLineRequestSchema, await readJson(request), requestId);
    if (!body.ok) return respondTo(body.failure);
    return Response.json(CartSchema.parse(await api.setCartLine(productId, body.value)));
  });
}

export async function DELETE(_request: Request, { params }: Context): Promise<Response> {
  const { productId } = await params;
  return asBuyer(async (api) => Response.json(CartSchema.parse(await api.removeCartLine(productId))));
}
```

`apps/web/src/app/api/checkouts/route.ts`:

```ts
import { CheckoutSchema, CreateCheckoutRequestSchema } from '@app/contracts';
import { parseBody, readJson } from '@/lib/http/body';
import { asBuyer } from '@/lib/http/buyer-route';
import { respondTo } from '@/lib/http/responses';

export function POST(request: Request): Promise<Response> {
  return asBuyer(async (api, requestId) => {
    const body = parseBody(CreateCheckoutRequestSchema, await readJson(request), requestId);
    if (!body.ok) return respondTo(body.failure);
    // A 409 keeps its typed details through `failure` (envelope.ts copies them).
    return Response.json(CheckoutSchema.parse(await api.placeCheckout(body.value)), { status: 201 });
  });
}
```

`apps/web/src/app/api/checkouts/[id]/route.ts`:

```ts
import { CheckoutSchema } from '@app/contracts';
import { asBuyer } from '@/lib/http/buyer-route';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return asBuyer(async (api) => Response.json(CheckoutSchema.parse(await api.checkout(id))));
}
```

`apps/web/src/app/api/buyer/orders/route.ts`:

```ts
import { BuyerOrderPageSchema } from '@app/contracts';
import { asBuyer } from '@/lib/http/buyer-route';

export function GET(request: Request): Promise<Response> {
  const cursor = new URL(request.url).searchParams.get('cursor') ?? undefined;
  return asBuyer(async (api) => Response.json(BuyerOrderPageSchema.parse(await api.buyerOrders(cursor))));
}
```

`apps/web/src/app/api/buyer/orders/[id]/route.ts`:

```ts
import { BuyerOrderSchema } from '@app/contracts';
import { asBuyer } from '@/lib/http/buyer-route';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return asBuyer(async (api) => Response.json(BuyerOrderSchema.parse(await api.buyerOrder(id))));
}
```

`apps/web/src/lib/storefront/client.ts`:

```ts
import { z } from 'zod';
import {
  BuyerOrderPageSchema,
  BuyerOrderSchema,
  CartSchema,
  CheckoutSchema,
  ErrorCodes,
  ErrorEnvelopeSchema,
  PublicProductPageSchema,
  PublicProductSchema,
  type CreateCheckoutRequest,
} from '@app/contracts';

/** A refusal from the BFF, with the API's code and typed details intact. */
export class StorefrontError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'StorefrontError';
  }
}

async function call<T>(input: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = ErrorEnvelopeSchema.safeParse(body);
    throw envelope.success
      ? new StorefrontError(response.status, envelope.data.error.code, envelope.data.error.message, envelope.data.error.details)
      : new StorefrontError(response.status, ErrorCodes.INTERNAL, `Unexpected response (${response.status})`);
  }
  return schema.parse(body);
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const cursorQuery = (cursor?: string) => (cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`);
const segment = encodeURIComponent;

/** The browser's only way to the buyer API: through this app's BFF, never the API directly. */
export const storefront = {
  products: (cursor?: string) => call(`/api/storefront/products${cursorQuery(cursor)}`, PublicProductPageSchema),
  product: (id: string) => call(`/api/storefront/products/${segment(id)}`, PublicProductSchema),
  cart: () => call('/api/cart', CartSchema),
  setLine: (productId: string, quantity: number) =>
    call(`/api/cart/items/${segment(productId)}`, CartSchema, json('PUT', { quantity })),
  removeLine: (productId: string) => call(`/api/cart/items/${segment(productId)}`, CartSchema, { method: 'DELETE' }),
  placeCheckout: (body: CreateCheckoutRequest) => call('/api/checkouts', CheckoutSchema, json('POST', body)),
  checkout: (id: string) => call(`/api/checkouts/${segment(id)}`, CheckoutSchema),
  orders: (cursor?: string) => call(`/api/buyer/orders${cursorQuery(cursor)}`, BuyerOrderPageSchema),
  order: (id: string) => call(`/api/buyer/orders/${segment(id)}`, BuyerOrderSchema),
};
```

`apps/web/src/lib/session/routing.ts` — protect the storefront:

```ts
/** Storefront routes (PRD §7.4). Signed-in only (SRS §5), but no organization needed. */
export const STOREFRONT_PREFIXES = ['/browse', '/p', '/cart', '/checkout', '/orders', '/account'] as const;

const PROTECTED_PREFIXES = [DASHBOARD_PATH, ...STOREFRONT_PREFIXES];

export function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
```

`apps/web/src/middleware.ts` — extend the matcher:

```ts
  matcher: [
    '/dashboard/:path*',
    '/login',
    '/register',
    '/browse',
    '/p/:path*',
    '/cart',
    '/checkout',
    '/orders/:path*',
    '/account/:path*',
  ],
```

`apps/web/src/app/(shop)/store-frame.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Alert } from '@app/ui';
import { LOGIN_PATH } from '@/lib/session/routing';
import { useSession } from '@/lib/session/client';

const NAV = [
  { href: '/browse', label: 'Browse' },
  { href: '/cart', label: 'Cart' },
  { href: '/account/orders', label: 'My orders' },
] as const;

/**
 * The storefront's chrome (Stitch 057's top bar). Unlike DashboardChrome it
 * admits a user with no organization — a buyer is exactly that (D53). Only links
 * whose feature exists render (PRD §7.4): no search, wishlist or account menu.
 * T-002 restyles this component; nothing below it depends on its markup.
 */
export function StoreFrame({ appName, children }: { appName: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { state } = useSession();

  useEffect(() => {
    if (state.status === 'anonymous') router.replace(`${LOGIN_PATH}?next=${encodeURIComponent(pathname)}`);
  }, [state.status, router, pathname]);

  if (state.status === 'loading') {
    return (
      <main role="status" aria-live="polite" className="p-10 text-sm text-ink-muted">
        Loading…
      </main>
    );
  }
  if (state.status === 'anonymous') return null;
  if (state.status === 'failed') {
    return (
      <main className="mx-auto max-w-2xl p-10">
        <Alert>{state.message}</Alert>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-rule bg-panel">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/browse" className="text-sm font-semibold">
            {appName}
          </Link>
          <nav aria-label="Shop" className="flex gap-4 text-sm">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? 'page' : undefined}
                className={pathname === href ? 'font-semibold' : 'text-ink-muted hover:text-ink'}
              >
                {label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto text-sm text-ink-muted">{state.session.user.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
```

`apps/web/src/app/(shop)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { SessionProvider } from '@/lib/session/client';
import { StoreFrame } from './store-frame';

export default function ShopLayout({ children }: { children: ReactNode }) {
  const appName = process.env.APP_NAME ?? 'app';
  return (
    <SessionProvider>
      <StoreFrame appName={appName}>{children}</StoreFrame>
    </SessionProvider>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test && pnpm --filter web lint && pnpm --filter web typecheck`
Expected: PASS — money 1, product-path 3, client 2, routing +7, store frame 2; lint and `next typegen`
typecheck clean (typegen validates the eight route handlers' `params` shapes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): the shop frame, the buyer BFF routes and the storefront client"
```

---

### Task 21: Web — browse and the product page (Stitch 057, 077)

**Files:**
- Create: `apps/web/src/lib/storefront/availability.ts`, `availability.test.ts`;
  `apps/web/src/app/(shop)/browse/page.tsx`, `apps/web/src/app/(shop)/browse/product-card.tsx`;
  `apps/web/src/app/(shop)/p/[slug]/page.tsx`, `apps/web/src/app/(shop)/p/[slug]/product-view.tsx`,
  `apps/web/src/app/(shop)/p/[slug]/product-view.test.tsx`

**Interfaces:**
- Consumes: Task 20 (`storefront`, `formatMoney`, `productPath`, `productIdFromSlug`, `StoreFrame`).
- Produces: `stockLabel(available: number): string` (`'Sold out'`, `'1 left'`, `'N in stock'`) and
  `lineAvailabilityLabel(line: CartLine): string | null` (`'Sold out'`, `'Only N left'`, `null`) —
  shared with Task 22; `ProductView` (presentational: product, onAdd, adding, added).

The page components are thin: they fetch through `storefront` and render a presentational component
that takes plain props. The presentational components are what the unit tests render; the pages are
covered by the behavioural journeys (Task 25), the same split the web app's coverage note records.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/storefront/availability.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lineAvailabilityLabel, stockLabel } from './availability';

describe('stockLabel (AC-US-CAT-002-1, D61)', () => {
  it('states the exact count', () => {
    expect(stockLabel(1)).toBe('1 left');
    expect(stockLabel(7)).toBe('7 in stock');
    expect(stockLabel(0)).toBe('Sold out');
  });
});

describe('lineAvailabilityLabel (PRD-FR-CART-003)', () => {
  const line = { availability: 'OK', available: 5 } as const;
  it('says nothing when the line is fine', () => {
    expect(lineAvailabilityLabel(line)).toBeNull();
  });
  it('says "Only N left" when short', () => {
    expect(lineAvailabilityLabel({ availability: 'SHORT', available: 1 })).toBe('Only 1 left');
  });
  it('says "Sold out" at zero or when no longer sold', () => {
    expect(lineAvailabilityLabel({ availability: 'SOLD_OUT', available: 0 })).toBe('Sold out');
  });
});
```

`apps/web/src/app/(shop)/p/[slug]/product-view.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProductView } from './product-view';

const product = {
  id: 'p1',
  name: 'Nile Cotton Shirt',
  priceMinor: 24_900,
  currency: 'EGP' as const,
  available: 1,
  seller: { name: 'Nile Traders', slug: 'nile-traders' },
};

describe('ProductView (Stitch 077)', () => {
  it('shows "1 left" and the seller name (AC-US-CAT-002-1)', () => {
    render(<ProductView product={product} onAdd={vi.fn()} adding={false} added={false} />);

    expect(screen.getByRole('heading', { name: 'Nile Cotton Shirt' })).toBeTruthy();
    expect(screen.getByText('1 left')).toBeTruthy();
    expect(screen.getByText(/Nile Traders/)).toBeTruthy();
    expect(screen.getByText(/249\.00/)).toBeTruthy();
  });

  it('offers no more than stock allows, and never more than 10 (D72)', () => {
    render(<ProductView product={{ ...product, available: 40 }} onAdd={vi.fn()} adding={false} added={false} />);
    expect(screen.getByLabelText('Quantity').querySelectorAll('option')).toHaveLength(10);
  });

  it('adds the chosen quantity', () => {
    const onAdd = vi.fn();
    render(<ProductView product={{ ...product, available: 3 }} onAdd={onAdd} adding={false} added={false} />);

    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(onAdd).toHaveBeenCalledWith(2);
  });

  it('cannot add a sold-out product', () => {
    render(<ProductView product={{ ...product, available: 0 }} onAdd={vi.fn()} adding={false} added={false} />);
    expect(screen.getByText('Sold out')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Add to cart' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test -- availability product-view`
Expected: FAIL — `Failed to resolve import "./availability"` and `"./product-view"`.

- [ ] **Step 3: Implement**

`apps/web/src/lib/storefront/availability.ts`:

```ts
import { CartLineAvailabilities, type CartLine } from '@app/contracts';

/** The product page's stock line: the exact count is public (D61). */
export function stockLabel(available: number): string {
  if (available === 0) return 'Sold out';
  if (available === 1) return '1 left';
  return `${available} in stock`;
}

/** A cart line's flag (PRD-FR-CART-003); null when there is nothing to say. */
export function lineAvailabilityLabel(line: Pick<CartLine, 'availability' | 'available'>): string | null {
  switch (line.availability) {
    case CartLineAvailabilities.SOLD_OUT:
      return 'Sold out';
    case CartLineAvailabilities.SHORT:
      return `Only ${line.available} left`;
    default:
      return null;
  }
}
```

`apps/web/src/app/(shop)/p/[slug]/product-view.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CART_LINE_MAX_QUANTITY, type PublicProduct } from '@app/contracts';
import { Button } from '@app/ui';
import { formatMoney } from '@/lib/money';
import { stockLabel } from '@/lib/storefront/availability';

export interface ProductViewProps {
  product: PublicProduct;
  onAdd: (quantity: number) => void;
  adding: boolean;
  added: boolean;
}

/** Stitch 077 minus the chrome no feature backs (reviews, wishlist, related items). */
export function ProductView({ product, onAdd, adding, added }: ProductViewProps) {
  const [quantity, setQuantity] = useState(1);
  const choices = Math.min(product.available, CART_LINE_MAX_QUANTITY);

  return (
    <article className="grid gap-6 rounded-brand border border-rule bg-panel p-6 md:grid-cols-2">
      <div className="space-y-2">
        <p className="text-sm text-ink-muted">Sold by {product.seller.name}</p>
        <h1 className="text-2xl font-semibold">{product.name}</h1>
        <p className="text-xl">{formatMoney(product.priceMinor, product.currency)}</p>
        <p className="text-sm">{stockLabel(product.available)}</p>
      </div>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd(quantity);
        }}
      >
        <label className="block text-sm" htmlFor="quantity">
          Quantity
        </label>
        <select
          id="quantity"
          className="rounded-brand border border-rule bg-panel px-2 py-1"
          value={quantity}
          disabled={choices === 0}
          onChange={(event) => setQuantity(Number(event.target.value))}
        >
          {Array.from({ length: choices }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={choices === 0 || adding}>
          Add to cart
        </Button>
        {added ? (
          <p role="status" className="text-sm">
            Added. <Link href="/cart">View cart</Link>
          </p>
        ) : null}
      </form>
    </article>
  );
}
```

`apps/web/src/app/(shop)/p/[slug]/page.tsx`:

```tsx
'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PublicProduct } from '@app/contracts';
import { Alert } from '@app/ui';
import { productIdFromSlug } from '@/lib/storefront/product-path';
import { storefront } from '@/lib/storefront/client';
import { ProductView } from './product-view';

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    storefront
      .product(productIdFromSlug(slug))
      .then(setProduct)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the product'));
  }, [slug]);

  if (error !== null) return <Alert>{error}</Alert>;
  if (product === null) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <ProductView
      product={product}
      adding={adding}
      added={added}
      onAdd={(quantity) => {
        setAdding(true);
        storefront
          .setLine(product.id, quantity)
          .then(() => setAdded(true))
          .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not add to cart'))
          .finally(() => setAdding(false));
      }}
    />
  );
}
```

`apps/web/src/app/(shop)/browse/product-card.tsx`:

```tsx
import Link from 'next/link';
import type { PublicProduct } from '@app/contracts';
import { formatMoney } from '@/lib/money';
import { stockLabel } from '@/lib/storefront/availability';
import { productPath } from '@/lib/storefront/product-path';

/** One Stitch 057 card: name, seller, price, exact stock. */
export function ProductCard({ product }: { product: PublicProduct }) {
  return (
    <li className="rounded-brand border border-rule bg-panel p-4">
      <Link href={productPath(product)} className="font-semibold">
        {product.name}
      </Link>
      <p className="text-sm text-ink-muted">{product.seller.name}</p>
      <p className="mt-2">{formatMoney(product.priceMinor, product.currency)}</p>
      <p className="text-sm">{stockLabel(product.available)}</p>
    </li>
  );
}
```

`apps/web/src/app/(shop)/browse/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PublicProduct } from '@app/contracts';
import { Alert, Button } from '@app/ui';
import { storefront } from '@/lib/storefront/client';
import { ProductCard } from './product-card';

export default function BrowsePage() {
  const [items, setItems] = useState<PublicProduct[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (after?: string) => {
    setLoading(true);
    try {
      const page = await storefront.products(after);
      setItems((current) => (after === undefined ? page.items : [...current, ...page.items]));
      setCursor(page.nextCursor);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Browse</h1>
      {error !== null ? <Alert>{error}</Alert> : null}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </ul>
      {cursor !== null ? (
        <Button variant="secondary" disabled={loading} onClick={() => void load(cursor)}>
          Load more
        </Button>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test && pnpm --filter web build`
Expected: PASS — availability 4, product view 4; `next build` compiles `/browse` and `/p/[slug]`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): browse and product page with exact public stock (Stitch 057, 077)"
```

---

### Task 22: Web — the cart (Stitch 056)

**Files:**
- Create: `apps/web/src/app/(shop)/cart/page.tsx`, `apps/web/src/app/(shop)/cart/cart-view.tsx`,
  `apps/web/src/app/(shop)/cart/cart-view.test.tsx`, `apps/web/src/lib/storefront/routes.ts`

**Interfaces:**
- Consumes: `storefront.cart/setLine/removeLine`, `lineAvailabilityLabel`, `formatMoney`.
- Produces: `CartView` (presentational: `cart`, `conflict: boolean`, `onQuantity(productId, n)`,
  `onRemove(productId)`); the page reads `?conflict=lines`, which Task 23 sets when a checkout is
  refused (D59).

**"Returns to the cart with the failing lines flagged" (D59, PRD-FR-CHK-004).** The flags are the
cart's own live data — `availability` and `addedUnitPriceMinor` vs `currentUnitPriceMinor` — not a
copy of the 409 carried across pages. After a refusal the cart is re-read, so what it flags is what
is true now; the `conflict` banner says why the buyer is here.

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/(shop)/cart/cart-view.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Cart } from '@app/contracts';
import { CartView } from './cart-view';

const line = (overrides: Partial<Cart['sellers'][number]['lines'][number]> = {}) => ({
  productId: 'p1',
  name: 'Shirt',
  quantity: 2,
  currency: 'EGP' as const,
  addedUnitPriceMinor: 24_900,
  currentUnitPriceMinor: 24_900,
  available: 5,
  availability: 'OK' as const,
  ...overrides,
});

const cart = (lines: ReturnType<typeof line>[][]): Cart => ({
  sellers: lines.map((group, i) => ({ seller: { name: `Seller ${i}`, slug: `s${i}` }, lines: group })),
});

const noop = { onQuantity: vi.fn(), onRemove: vi.fn() };

describe('CartView (Stitch 056)', () => {
  it('groups lines under each seller (AC-US-CART-001-1)', () => {
    render(<CartView cart={cart([[line()], [line({ productId: 'p2', name: 'Oil' })]])} conflict={false} {...noop} />);
    expect(screen.getAllByRole('region').map((region) => within(region).getByRole('heading').textContent)).toEqual([
      'Seller 0',
      'Seller 1',
    ]);
  });

  it('flags "Only 1 left" (AC-US-CART-002-1) and "Sold out"', () => {
    render(
      <CartView
        cart={cart([[line({ availability: 'SHORT', available: 1 }), line({ productId: 'p2', availability: 'SOLD_OUT', available: 0, currentUnitPriceMinor: null })]])}
        conflict={false}
        {...noop}
      />,
    );
    expect(screen.getByText('Only 1 left')).toBeTruthy();
    expect(screen.getByText('Sold out')).toBeTruthy();
  });

  it('shows the old and the new price when it moved (D82)', () => {
    render(<CartView cart={cart([[line({ currentUnitPriceMinor: 26_000 })]])} conflict={false} {...noop} />);
    expect(screen.getByText(/249\.00/)).toBeTruthy();
    expect(screen.getByText(/260\.00/)).toBeTruthy();
  });

  it('explains why the buyer is back after a refused checkout (D59)', () => {
    render(<CartView cart={cart([[line({ availability: 'SOLD_OUT', available: 0, currentUnitPriceMinor: null })]])} conflict {...noop} />);
    expect(screen.getByRole('alert').textContent).toMatch(/changed/i);
  });

  it('changes a quantity and removes a line', () => {
    const onQuantity = vi.fn();
    const onRemove = vi.fn();
    render(<CartView cart={cart([[line()]])} conflict={false} onQuantity={onQuantity} onRemove={onRemove} />);

    fireEvent.change(screen.getByLabelText('Quantity of Shirt'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Shirt' }));
    expect(onQuantity).toHaveBeenCalledWith('p1', 3);
    expect(onRemove).toHaveBeenCalledWith('p1');
  });

  it('links to the review step only when there is something to review', () => {
    const { rerender } = render(<CartView cart={cart([[line()]])} conflict={false} {...noop} />);
    expect(screen.getByRole('link', { name: 'Review order' }).getAttribute('href')).toBe('/checkout');

    rerender(<CartView cart={{ sellers: [] }} conflict={false} {...noop} />);
    expect(screen.queryByRole('link', { name: 'Review order' })).toBeNull();
    expect(screen.getByText(/your cart is empty/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- cart-view`
Expected: FAIL — `Failed to resolve import "./cart-view"`.

- [ ] **Step 3: Implement**

`apps/web/src/app/(shop)/cart/cart-view.tsx`:

```tsx
import Link from 'next/link';
import { CART_LINE_MAX_QUANTITY, type Cart, type CartLine } from '@app/contracts';
import { Alert, Button } from '@app/ui';
import { formatMoney } from '@/lib/money';
import { lineAvailabilityLabel } from '@/lib/storefront/availability';

export interface CartViewProps {
  cart: Cart;
  conflict: boolean;
  onQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

function Price({ line }: { line: CartLine }) {
  const current = line.currentUnitPriceMinor;
  if (current === null || current === line.addedUnitPriceMinor) {
    return <span>{formatMoney(line.addedUnitPriceMinor, line.currency)}</span>;
  }
  return (
    <span>
      <s className="text-ink-muted">{formatMoney(line.addedUnitPriceMinor, line.currency)}</s>{' '}
      <strong>{formatMoney(current, line.currency)}</strong>
    </span>
  );
}

/** Stitch 056: one panel per seller (SRS-FR-CART-006), live flags per line (PRD-FR-CART-003). */
export function CartView({ cart, conflict, onQuantity, onRemove }: CartViewProps) {
  if (cart.sellers.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Your cart is empty. <Link href="/browse">Browse products</Link>
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Cart</h1>
      {conflict ? (
        <Alert role="alert">Some items changed since you reviewed your order. Fix the flagged lines, then review again.</Alert>
      ) : null}
      {cart.sellers.map((group) => (
        <section
          key={group.seller.slug}
          aria-labelledby={`seller-${group.seller.slug}`}
          className="rounded-brand border border-rule bg-panel p-4"
        >
          <h2 id={`seller-${group.seller.slug}`} className="font-semibold">
            {group.seller.name}
          </h2>
          <ul className="divide-y divide-rule">
            {group.lines.map((line) => {
              const flag = lineAvailabilityLabel(line);
              return (
                <li key={line.productId} className="flex items-center gap-4 py-3">
                  <span className="flex-1">{line.name}</span>
                  {flag !== null ? <span className="text-sm font-semibold">{flag}</span> : null}
                  <Price line={line} />
                  <select
                    aria-label={`Quantity of ${line.name}`}
                    value={line.quantity}
                    onChange={(event) => onQuantity(line.productId, Number(event.target.value))}
                    className="rounded-brand border border-rule bg-panel px-2 py-1"
                  >
                    {Array.from({ length: CART_LINE_MAX_QUANTITY }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <Button variant="quiet" size="sm" aria-label={`Remove ${line.name}`} onClick={() => onRemove(line.productId)}>
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <Link href="/checkout" className="inline-block rounded-brand bg-action px-4 py-2 text-ink-on-action">
        Review order
      </Link>
    </div>
  );
}
```

`<section aria-labelledby>` gives each seller group the `region` role the test queries.

`apps/web/src/app/(shop)/cart/page.tsx`:

```tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { Cart } from '@app/contracts';
import { Alert } from '@app/ui';
import { storefront } from '@/lib/storefront/client';
import { CONFLICT_QUERY } from '@/lib/storefront/routes';
import { CartView } from './cart-view';

function CartPageBody() {
  const params = useSearchParams();
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = (pending: Promise<Cart>) =>
    pending.then(setCart).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the cart'));

  useEffect(() => {
    void apply(storefront.cart());
  }, []);

  if (error !== null) return <Alert>{error}</Alert>;
  if (cart === null) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <CartView
      cart={cart}
      conflict={params.get(CONFLICT_QUERY) !== null}
      onQuantity={(productId, quantity) => void apply(storefront.setLine(productId, quantity))}
      onRemove={(productId) => void apply(storefront.removeLine(productId))}
    />
  );
}

export default function CartPage() {
  // useSearchParams needs a Suspense boundary, as in (auth)/login/page.tsx.
  return (
    <Suspense fallback={null}>
      <CartPageBody />
    </Suspense>
  );
}
```

`apps/web/src/lib/storefront/routes.ts` — the storefront's paths, defined once (a Next.js page module
may export only the page, so constants cannot live beside it):

```ts
export const CART_PATH = '/cart';
export const CHECKOUT_PATH = '/checkout';
export const MY_ORDERS_PATH = '/account/orders';

/** Set on /cart when a checkout was refused for its lines (D59). */
export const CONFLICT_QUERY = 'conflict';
export const CONFLICT_LINES = 'lines';

/** PRD §7.4's `/orders/:id/placed`; the id is the checkout's (D88). */
export const placedPath = (checkoutId: string): string => `/orders/${encodeURIComponent(checkoutId)}/placed`;
export const orderPath = (orderId: string): string => `${MY_ORDERS_PATH}/${encodeURIComponent(orderId)}`;
```

In `cart-view.tsx`, use `CHECKOUT_PATH` for the "Review order" link instead of the literal.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test && pnpm --filter web build`
Expected: PASS — cart view 6 cases; `/cart` builds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): the cart grouped by seller with live availability flags (Stitch 056)"
```

---

### Task 23: Web — the review step and the placed screen (Stitch 028, 063)

**Files:**
- Create: `apps/web/src/lib/storefront/review.ts`, `apps/web/src/lib/storefront/review.test.ts`,
  `apps/web/src/lib/storefront/status.ts`, `apps/web/src/app/(shop)/checkout/page.tsx`,
  `apps/web/src/app/(shop)/checkout/review-view.tsx`, `apps/web/src/app/(shop)/checkout/review-view.test.tsx`,
  `apps/web/src/app/(shop)/orders/[id]/placed/page.tsx`

**Interfaces:**
- Consumes: `storefront.cart/placeCheckout/checkout`, `StorefrontError`,
  `CheckoutConflictDetailsSchema`, `CHECKOUT_PAYMENT_WINDOW_MINUTES`.
- Produces: `reviewCart(cart: Cart): Review` and `canPlaceOrder(review: Review, priceChangesAccepted: boolean): boolean`
  where `Review = { lines; priceChanges: { productId; name; fromMinor; toMinor; currency }[]; stockProblems: { productId; name; label }[]; mixedCurrency: boolean; currency: CurrencyCode | null; totalMinor: number; confirmedLines: CheckoutLineRequest[] }`;
  `statusLabel(status: OrderStatus): string` (its test lands in Task 24).

**The rules (D60, D71, D77, PRD-FR-CHK-001/-002).** The review lists every line whose current price
differs from the price it was added at, and every line short of stock. "Place order" is disabled
while any line is short or sold out (fix it in the cart), while the cart mixes currencies, and — when
any price moved — until the buyer ticks one confirmation. What is posted is `confirmedLines`: each
line at its **current** price, which is exactly what D77 then re-checks under lock. A 409 with
`details.lines` sends the buyer to `/cart?conflict=lines`; a 409 `CART_CHANGED` reloads the review with
a notice. The placed screen route is `/orders/[id]/placed` per PRD §7.4, and its `id` is the
**checkout** id (D88).

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/storefront/review.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Cart } from '@app/contracts';
import { canPlaceOrder, reviewCart } from './review';

const line = (overrides: Partial<Cart['sellers'][number]['lines'][number]> = {}) => ({
  productId: 'p1',
  name: 'Shirt',
  quantity: 1,
  currency: 'EGP' as const,
  addedUnitPriceMinor: 1000,
  currentUnitPriceMinor: 1000,
  available: 5,
  availability: 'OK' as const,
  ...overrides,
});
const cartOf = (...lines: ReturnType<typeof line>[]): Cart => ({
  sellers: [{ seller: { name: 'S', slug: 's' }, lines }],
});

describe('reviewCart', () => {
  it('lists a risen price with the old and the new (AC-US-CHK-001-1)', () => {
    const review = reviewCart(cartOf(line({ currentUnitPriceMinor: 1200 })));
    expect(review.priceChanges).toEqual([{ productId: 'p1', name: 'Shirt', fromMinor: 1000, toMinor: 1200, currency: 'EGP' }]);
  });

  it('confirms every line at its current price (D77)', () => {
    const review = reviewCart(cartOf(line({ quantity: 2, currentUnitPriceMinor: 1200 })));
    expect(review.confirmedLines).toEqual([{ productId: 'p1', quantity: 2, unitPriceMinor: 1200 }]);
    expect(review.totalMinor).toBe(2400);
  });

  it('flags a mixed-currency cart (AC-US-CHK-002-5, D71)', () => {
    const review = reviewCart(cartOf(line(), line({ productId: 'p2', currency: 'USD' })));
    expect(review.mixedCurrency).toBe(true);
    expect(review.currency).toBeNull();
  });
});

describe('canPlaceOrder (PRD-FR-CHK-002)', () => {
  it('is disabled until a price change is confirmed', () => {
    const review = reviewCart(cartOf(line({ currentUnitPriceMinor: 1200 })));
    expect(canPlaceOrder(review, false)).toBe(false);
    expect(canPlaceOrder(review, true)).toBe(true);
  });

  it('is disabled for a mixed-currency cart, confirmed or not', () => {
    const review = reviewCart(cartOf(line(), line({ productId: 'p2', currency: 'USD' })));
    expect(canPlaceOrder(review, true)).toBe(false);
  });

  it('is disabled while any line is short or sold out', () => {
    expect(canPlaceOrder(reviewCart(cartOf(line({ availability: 'SHORT', available: 0, quantity: 2 }))), true)).toBe(false);
    expect(
      canPlaceOrder(reviewCart(cartOf(line({ availability: 'SOLD_OUT', available: 0, currentUnitPriceMinor: null }))), true),
    ).toBe(false);
  });

  it('is disabled for an empty cart', () => {
    expect(canPlaceOrder(reviewCart({ sellers: [] }), true)).toBe(false);
  });
});
```

`apps/web/src/app/(shop)/checkout/review-view.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Cart } from '@app/contracts';
import { ReviewView } from './review-view';

const cart = (current: number, currency: 'EGP' | 'USD' = 'EGP'): Cart => ({
  sellers: [
    {
      seller: { name: 'Nile', slug: 'nile' },
      lines: [
        { productId: 'p1', name: 'Shirt', quantity: 1, currency: 'EGP', addedUnitPriceMinor: 24_900, currentUnitPriceMinor: current, available: 5, availability: 'OK' },
      ],
    },
    {
      seller: { name: 'Delta', slug: 'delta' },
      lines: [
        { productId: 'p2', name: 'Oil', quantity: 1, currency, addedUnitPriceMinor: 18_900, currentUnitPriceMinor: 18_900, available: 5, availability: 'OK' },
      ],
    },
  ],
});

const placeButton = () => screen.getByRole('button', { name: 'Place order' }) as HTMLButtonElement;

describe('ReviewView (Stitch 028)', () => {
  it('shows the old and new price and keeps "Place order" disabled until confirmed (AC-US-CHK-001-1)', () => {
    const onPlace = vi.fn();
    render(<ReviewView cart={cart(26_000)} notice={null} placing={false} onPlace={onPlace} />);

    // The old price appears once (struck through); the new one in the change list and on the line.
    expect(screen.getAllByText(/249\.00/)).toHaveLength(1);
    expect(screen.getAllByText(/260\.00/).length).toBeGreaterThanOrEqual(1);
    expect(placeButton().disabled).toBe(true);

    fireEvent.click(screen.getByLabelText(/accept the new prices/i));
    expect(placeButton().disabled).toBe(false);
    fireEvent.click(placeButton());
    expect(onPlace).toHaveBeenCalledWith([
      { productId: 'p1', quantity: 1, unitPriceMinor: 26_000 },
      { productId: 'p2', quantity: 1, unitPriceMinor: 18_900 },
    ]);
  });

  it('disables "Place order" with a message for a mixed-currency cart (AC-US-CHK-002-5)', () => {
    render(<ReviewView cart={cart(24_900, 'USD')} notice={null} placing={false} onPlace={vi.fn()} />);
    expect(screen.getByText(/one currency/i)).toBeTruthy();
    expect(placeButton().disabled).toBe(true);
  });

  it('says payment is not collected yet and when an unpaid order is cancelled (D62, D70)', () => {
    render(<ReviewView cart={cart(24_900)} notice={null} placing={false} onPlace={vi.fn()} />);
    expect(screen.getByText(/payment is not collected yet/i).textContent).toMatch(/30 minutes/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test -- review`
Expected: FAIL — `Failed to resolve import "./review"` and `"./review-view"`.

- [ ] **Step 3: Implement**

`apps/web/src/lib/storefront/review.ts`:

```ts
import {
  CartLineAvailabilities,
  type Cart,
  type CartLine,
  type CheckoutLineRequest,
  type CurrencyCode,
} from '@app/contracts';
import { lineAvailabilityLabel } from './availability';

export interface PriceChange {
  productId: string;
  name: string;
  fromMinor: number;
  toMinor: number;
  currency: CurrencyCode;
}

export interface StockProblem {
  productId: string;
  name: string;
  label: string;
}

export interface Review {
  lines: CartLine[];
  priceChanges: PriceChange[];
  stockProblems: StockProblem[];
  mixedCurrency: boolean;
  currency: CurrencyCode | null;
  totalMinor: number;
  confirmedLines: CheckoutLineRequest[];
}

/** Everything the review step shows and posts, derived from the live cart (D60). */
export function reviewCart(cart: Cart): Review {
  const lines = cart.sellers.flatMap((group) => group.lines);
  const currencies = new Set(lines.map((line) => line.currency));

  const priceChanges = lines.flatMap((line) =>
    line.currentUnitPriceMinor !== null && line.currentUnitPriceMinor !== line.addedUnitPriceMinor
      ? [{ productId: line.productId, name: line.name, fromMinor: line.addedUnitPriceMinor, toMinor: line.currentUnitPriceMinor, currency: line.currency }]
      : [],
  );
  const stockProblems = lines.flatMap((line) => {
    const label = lineAvailabilityLabel(line);
    return line.availability !== CartLineAvailabilities.OK && label !== null
      ? [{ productId: line.productId, name: line.name, label }]
      : [];
  });
  const confirmedLines = lines.flatMap((line) =>
    line.currentUnitPriceMinor === null
      ? []
      : [{ productId: line.productId, quantity: line.quantity, unitPriceMinor: line.currentUnitPriceMinor }],
  );

  return {
    lines,
    priceChanges,
    stockProblems,
    mixedCurrency: currencies.size > 1,
    currency: currencies.size === 1 ? [...currencies][0] : null,
    totalMinor: confirmedLines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0),
    confirmedLines,
  };
}

export function canPlaceOrder(review: Review, priceChangesAccepted: boolean): boolean {
  return (
    review.lines.length > 0 &&
    !review.mixedCurrency &&
    review.stockProblems.length === 0 &&
    (review.priceChanges.length === 0 || priceChangesAccepted)
  );
}
```

`apps/web/src/app/(shop)/checkout/review-view.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CHECKOUT_PAYMENT_WINDOW_MINUTES, type Cart, type CheckoutLineRequest } from '@app/contracts';
import { Alert, Button } from '@app/ui';
import { formatMoney } from '@/lib/money';
import { canPlaceOrder, reviewCart } from '@/lib/storefront/review';
import { CART_PATH } from '@/lib/storefront/routes';

export interface ReviewViewProps {
  cart: Cart;
  notice: string | null;
  placing: boolean;
  onPlace: (lines: CheckoutLineRequest[]) => void;
}

/** Stitch 028, without the payment column — payment arrives in phases 6–7 (D62). */
export function ReviewView({ cart, notice, placing, onPlace }: ReviewViewProps) {
  const review = reviewCart(cart);
  const [accepted, setAccepted] = useState(false);
  const allowed = canPlaceOrder(review, accepted) && !placing;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Review your order</h1>
      {notice !== null ? <Alert role="alert">{notice}</Alert> : null}

      {review.mixedCurrency ? (
        <Alert>An order holds one currency. Remove the items in other currencies to continue.</Alert>
      ) : null}

      {review.stockProblems.length > 0 ? (
        <Alert>
          Some items are short of stock: {review.stockProblems.map((p) => `${p.name} (${p.label})`).join(', ')}.{' '}
          <Link href={CART_PATH}>Fix them in your cart</Link>.
        </Alert>
      ) : null}

      {review.priceChanges.length > 0 ? (
        <div className="space-y-2 rounded-brand border border-rule bg-panel p-4">
          <p className="font-semibold">Prices changed since you added these:</p>
          <ul>
            {review.priceChanges.map((change) => (
              <li key={change.productId}>
                {change.name}: <s>{formatMoney(change.fromMinor, change.currency)}</s> →{' '}
                <strong>{formatMoney(change.toMinor, change.currency)}</strong>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
            I accept the new prices
          </label>
        </div>
      ) : null}

      {cart.sellers.map((group) => (
        <div key={group.seller.slug} className="rounded-brand border border-rule bg-panel p-4">
          <h2 className="font-semibold">{group.seller.name}</h2>
          <ul>
            {group.lines.map((line) => (
              <li key={line.productId} className="flex justify-between py-1 text-sm">
                <span>
                  {line.quantity} × {line.name}
                </span>
                <span>{formatMoney(line.currentUnitPriceMinor ?? line.addedUnitPriceMinor, line.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {review.currency !== null ? (
        <p className="text-lg font-semibold">Total {formatMoney(review.totalMinor, review.currency)}</p>
      ) : null}
      <p className="text-sm text-ink-muted">
        Payment is not collected yet. An order left unpaid is cancelled after {CHECKOUT_PAYMENT_WINDOW_MINUTES} minutes.
      </p>
      <Button disabled={!allowed} onClick={() => onPlace(review.confirmedLines)}>
        Place order
      </Button>
    </section>
  );
}
```

`apps/web/src/app/(shop)/checkout/page.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CheckoutConflictDetailsSchema, ErrorCodes, type Cart, type CheckoutLineRequest } from '@app/contracts';
import { Alert } from '@app/ui';
import { StorefrontError, storefront } from '@/lib/storefront/client';
import { CART_PATH, CONFLICT_LINES, CONFLICT_QUERY, placedPath } from '@/lib/storefront/routes';
import { ReviewView } from './review-view';

const CART_CHANGED_NOTICE = 'Your cart changed while you were reviewing it. Check it again.';

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  const load = useCallback(() => {
    storefront.cart().then(setCart).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the cart'));
  }, []);
  useEffect(load, [load]);

  const place = async (lines: CheckoutLineRequest[]) => {
    setPlacing(true);
    try {
      const checkout = await storefront.placeCheckout({ lines });
      router.push(placedPath(checkout.id));
    } catch (e: unknown) {
      // Branch on code and details, never on message (SRS §8).
      if (e instanceof StorefrontError && e.code === ErrorCodes.CONFLICT) {
        const details = CheckoutConflictDetailsSchema.safeParse(e.details);
        if (details.success && 'lines' in details.data) {
          router.push(`${CART_PATH}?${CONFLICT_QUERY}=${CONFLICT_LINES}`);
          return;
        }
        setNotice(CART_CHANGED_NOTICE);
        load();
      } else {
        setError(e instanceof Error ? e.message : 'Could not place the order');
      }
    } finally {
      setPlacing(false);
    }
  };

  if (error !== null) return <Alert>{error}</Alert>;
  if (cart === null) return <p className="text-sm text-ink-muted">Loading…</p>;
  return <ReviewView cart={cart} notice={notice} placing={placing} onPlace={(lines) => void place(lines)} />;
}
```

`apps/web/src/app/(shop)/orders/[id]/placed/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CHECKOUT_PAYMENT_WINDOW_MINUTES, type Checkout } from '@app/contracts';
import { Alert } from '@app/ui';
import { formatMoney } from '@/lib/money';
import { storefront } from '@/lib/storefront/client';
import { MY_ORDERS_PATH, orderPath } from '@/lib/storefront/routes';
import { statusLabel } from '@/lib/storefront/status';

/** Stitch 063: one checkout, one order per seller (D56), payment not yet collected (D62). */
export default function PlacedPage() {
  const { id } = useParams<{ id: string }>();
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    storefront.checkout(id).then(setCheckout).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the order'));
  }, [id]);

  if (error !== null) return <Alert>{error}</Alert>;
  if (checkout === null) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Order placed</h1>
      <p className="text-sm text-ink-muted">
        {checkout.orders.length} {checkout.orders.length === 1 ? 'order' : 'orders'} in one checkout. Payment is not
        collected yet; unpaid orders are cancelled after {CHECKOUT_PAYMENT_WINDOW_MINUTES} minutes.
      </p>
      {checkout.orders.map((order) => (
        <div key={order.id} className="rounded-brand border border-rule bg-panel p-4">
          <h2 className="font-semibold">
            <Link href={orderPath(order.id)}>{order.seller.name}</Link>
          </h2>
          <p className="text-sm">{statusLabel(order.status)}</p>
          <p>{formatMoney(order.totalMinor, order.currency)}</p>
        </div>
      ))}
      <p className="text-lg font-semibold">Total {formatMoney(checkout.totalMinor, checkout.currency)}</p>
      <Link href={MY_ORDERS_PATH}>My orders</Link>
    </section>
  );
}
```

`apps/web/src/lib/storefront/status.ts` — created here because the placed screen is its first
consumer; Task 24 adds its test:

```ts
import { OrderStatuses, type OrderStatus } from '@app/contracts';

/** A mapping, not a conditional, so a new state is a compile error here (Record exhaustiveness). */
const LABELS: Record<OrderStatus, string> = {
  [OrderStatuses.PENDING_PAYMENT]: 'Pending payment',
  [OrderStatuses.CANCELLED]: 'Cancelled',
};

export function statusLabel(status: OrderStatus): string {
  return LABELS[status];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test && pnpm --filter web build`
Expected: PASS — review 7, review view 3; `/checkout` and `/orders/[id]/placed` build.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): the review step and the placed screen (Stitch 028, 063)"
```

---

### Task 24: Web — my orders and the buyer order detail (Stitch 017, 003)

**Files:**
- Create: `apps/web/src/lib/storefront/status.test.ts`, `apps/web/src/app/(shop)/account/orders/page.tsx`,
  `apps/web/src/app/(shop)/account/orders/orders-view.tsx`,
  `apps/web/src/app/(shop)/account/orders/orders-view.test.tsx`,
  `apps/web/src/app/(shop)/account/orders/[id]/page.tsx`,
  `apps/web/src/app/(shop)/account/orders/[id]/order-view.tsx`,
  `apps/web/src/app/(shop)/account/orders/[id]/order-view.test.tsx`
- (`apps/web/src/lib/storefront/status.ts` was created in Task 23.)

**Interfaces:**
- Consumes: `storefront.orders/order`, `formatMoney`, `orderPath`.
- Produces: `statusLabel(status: OrderStatus): string`; `OrdersView`, `OrderView` (presentational).

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/storefront/status.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { OrderStatuses, wireValues } from '@app/contracts';
import { statusLabel } from './status';

describe('statusLabel', () => {
  it('names every order state, so a new one fails here first', () => {
    expect(wireValues(OrderStatuses).map(statusLabel)).toEqual(
      wireValues(OrderStatuses).map((status) => (status === 'PENDING_PAYMENT' ? 'Pending payment' : 'Cancelled')),
    );
  });
});
```

`apps/web/src/app/(shop)/account/orders/orders-view.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrdersView } from './orders-view';

const order = (id: string, seller: string) => ({
  id,
  checkoutId: 'k1',
  status: 'PENDING_PAYMENT' as const,
  totalMinor: 24_900,
  currency: 'EGP' as const,
  createdAt: '2026-10-16T10:00:00.000Z',
  seller: { name: seller, slug: seller.toLowerCase() },
  itemCount: 1,
});

describe('OrdersView (Stitch 017)', () => {
  it('lists each order with seller, status, total and a link to its detail', () => {
    render(<OrdersView orders={[order('o1', 'Nile'), order('o2', 'Delta')]} hasMore={false} onMore={vi.fn()} />);

    expect(screen.getAllByText('Pending payment')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Nile/ }).getAttribute('href')).toBe('/account/orders/o1');
    expect(screen.getAllByText(/249\.00/)).toHaveLength(2);
  });

  it('says so when there are none', () => {
    render(<OrdersView orders={[]} hasMore={false} onMore={vi.fn()} />);
    expect(screen.getByText(/no orders yet/i)).toBeTruthy();
  });
});
```

`apps/web/src/app/(shop)/account/orders/[id]/order-view.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderView } from './order-view';

describe('OrderView (Stitch 003, PRD-FR-BORD-002)', () => {
  it('shows items, unit prices, total, seller, status and the checkout', () => {
    render(
      <OrderView
        order={{
          id: 'o1',
          checkoutId: 'k-123',
          status: 'CANCELLED',
          totalMinor: 37_800,
          currency: 'EGP',
          createdAt: '2026-10-16T10:00:00.000Z',
          seller: { name: 'Delta Goods', slug: 'delta-goods' },
          items: [{ productId: 'p1', name: 'Delta Olive Oil', quantity: 2, unitPriceMinor: 18_900 }],
        }}
      />,
    );

    expect(screen.getByText('Delta Goods')).toBeTruthy();
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.getByText(/2 × Delta Olive Oil/)).toBeTruthy();
    expect(screen.getByText(/189\.00/)).toBeTruthy();
    expect(screen.getByText(/378\.00/)).toBeTruthy();
    expect(screen.getByText(/k-123/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test -- status orders-view order-view`
Expected: `status.test.ts` PASSES already (Task 23 created `status.ts`) — that is expected and is the
reason it is written first: it is a guard for later states, not new behaviour. The two view tests
FAIL — `Failed to resolve import "./orders-view"` / `"./order-view"`.

- [ ] **Step 3: Implement**

`apps/web/src/app/(shop)/account/orders/orders-view.tsx`:

```tsx
import Link from 'next/link';
import type { BuyerOrderSummary } from '@app/contracts';
import { Button } from '@app/ui';
import { formatMoney } from '@/lib/money';
import { orderPath } from '@/lib/storefront/routes';
import { statusLabel } from '@/lib/storefront/status';

export function OrdersView({ orders, hasMore, onMore }: { orders: BuyerOrderSummary[]; hasMore: boolean; onMore: () => void }) {
  if (orders.length === 0) return <p className="text-sm text-ink-muted">No orders yet.</p>;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">My orders</h1>
      <ul className="divide-y divide-rule rounded-brand border border-rule bg-panel">
        {orders.map((order) => (
          <li key={order.id} className="flex items-center gap-4 p-4">
            <Link href={orderPath(order.id)} className="flex-1 font-semibold">
              {order.seller.name}
            </Link>
            <span className="text-sm">{statusLabel(order.status)}</span>
            <span>{formatMoney(order.totalMinor, order.currency)}</span>
            <time className="text-sm text-ink-muted" dateTime={order.createdAt}>
              {new Date(order.createdAt).toLocaleDateString()}
            </time>
          </li>
        ))}
      </ul>
      {hasMore ? (
        <Button variant="secondary" onClick={onMore}>
          Load more
        </Button>
      ) : null}
    </section>
  );
}
```

`apps/web/src/app/(shop)/account/orders/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BuyerOrderSummary } from '@app/contracts';
import { Alert } from '@app/ui';
import { storefront } from '@/lib/storefront/client';
import { OrdersView } from './orders-view';

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<BuyerOrderSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (after?: string) => {
    try {
      const page = await storefront.orders(after);
      setOrders((current) => (after === undefined || current === null ? page.items : [...current, ...page.items]));
      setCursor(page.nextCursor);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load your orders');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error !== null) return <Alert>{error}</Alert>;
  if (orders === null) return <p className="text-sm text-ink-muted">Loading…</p>;
  return <OrdersView orders={orders} hasMore={cursor !== null} onMore={() => void load(cursor ?? undefined)} />;
}
```

`apps/web/src/app/(shop)/account/orders/[id]/order-view.tsx`:

```tsx
import type { BuyerOrder } from '@app/contracts';
import { formatMoney } from '@/lib/money';
import { statusLabel } from '@/lib/storefront/status';

export function OrderView({ order }: { order: BuyerOrder }) {
  return (
    <article className="space-y-4 rounded-brand border border-rule bg-panel p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{order.seller.name}</h1>
        <p className="text-sm">{statusLabel(order.status)}</p>
        <p className="text-sm text-ink-muted">Checkout {order.checkoutId}</p>
      </header>
      <ul>
        {order.items.map((item) => (
          <li key={item.productId} className="flex justify-between py-1">
            <span>
              {item.quantity} × {item.name}
            </span>
            <span>{formatMoney(item.unitPriceMinor, order.currency)}</span>
          </li>
        ))}
      </ul>
      <p className="text-lg font-semibold">Total {formatMoney(order.totalMinor, order.currency)}</p>
    </article>
  );
}
```

`apps/web/src/app/(shop)/account/orders/[id]/page.tsx`:

```tsx
'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { BuyerOrder } from '@app/contracts';
import { Alert } from '@app/ui';
import { storefront } from '@/lib/storefront/client';
import { OrderView } from './order-view';

export default function BuyerOrderPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<BuyerOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    storefront.order(id).then(setOrder).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the order'));
  }, [id]);

  if (error !== null) return <Alert>{error}</Alert>;
  if (order === null) return <p className="text-sm text-ink-muted">Loading…</p>;
  return <OrderView order={order} />;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test && pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS — status 1, orders view 2, order view 1; build lists every `(shop)` route. Then run
`pnpm --filter @app/ui test` — `tokens.spec.ts` still passes, since no token changed
(SRS-NFR-A11Y-001).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): my orders and the buyer order detail (Stitch 017, 003)"
```

---
### Task 25: Behavioural journeys 1 and 2, and the abandoned checkout through the real worker

**Files:**
- Create: `apps/e2e/tests/storefront.spec.ts`
- Modify: `apps/e2e/support/fixtures.ts`

**Interfaces:**
- Consumes: the whole stack from Task 19 (`docker-compose.e2e.yml` with the worker at a 20 s window,
  D87); `serviceLogs('worker')`; the seeded sellers `owner@marketcore.test` (Nile Traders) and
  `outsider@marketcore.test` (Delta Goods); Task 9's `PUT /products/:id/inventory`.
- Produces: the behavioural evidence for PRD §6 journeys 1 and 2 (release plan §6's last row) and for
  D70 against a separately running worker process.

**The auth budget.** `AUTH_THROTTLE_LIMIT` is 20 requests per minute per endpoint per client, and
the behavioural stack is one long-lived API behind one proxy, so every spec in the run shares that
budget. This spec logs the two seeded sellers in **once** (`beforeAll`) and registers only the buyers
it needs (four). If a 429 appears, reduce calls further — do not raise the limit for a test.

**Product URLs.** `apps/e2e` cannot import `apps/web` (apps never import apps), so it navigates to
`/p/{id}`: D76 reads only the trailing id, which makes a bare id a valid product URL.

- [ ] **Step 1: Write the behavioural tests**

Append to `apps/e2e/support/fixtures.ts`:

```ts
/** The deterministic seed's two sellers (packages/database/prisma/seed.constants.ts). */
export const SEEDED_SELLERS = {
  NILE: { email: 'owner@marketcore.test', name: 'Nile Traders' },
  DELTA: { email: 'outsider@marketcore.test', name: 'Delta Goods' },
} as const;

export const bearer = (accessToken: string): Record<string, string> => ({
  authorization: `Bearer ${accessToken}`,
});
```

`apps/e2e/tests/storefront.spec.ts`:

```ts
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { OrganizationSchema, TokenPairSchema } from '@app/contracts';
import { serviceLogs } from '../support/compose';
import {
  SEEDED_SELLERS,
  TEST_PASSWORD,
  bearer,
  credentials,
  productPayload,
  tenantHeaders,
  unique,
} from '../support/fixtures';

const API = '/api/v1';
const WEB = 'https://web.marketcore.test:8443';

interface Seller {
  accessToken: string;
  organizationId: string;
}

async function login(request: APIRequestContext, email: string, password = TEST_PASSWORD): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(res.status()).toBe(200);
  return TokenPairSchema.parse(await res.json()).accessToken;
}

async function seller(request: APIRequestContext, email: string): Promise<Seller> {
  const accessToken = await login(request, email);
  const orgs = await request.get(`${API}/organizations`, { headers: bearer(accessToken) });
  const [organization] = OrganizationSchema.array().parse(await orgs.json());
  return { accessToken, organizationId: organization.id };
}

async function stockedProduct(
  request: APIRequestContext,
  owner: Seller,
  { priceMinor, available }: { priceMinor: number; available: number },
): Promise<{ id: string; name: string }> {
  const headers = tenantHeaders(owner.accessToken, owner.organizationId);
  const name = unique('Storefront item');
  const created = await request.post(`${API}/products`, { headers, data: productPayload({ name, priceMinor }) });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  expect((await request.put(`${API}/products/${id}/inventory`, { headers, data: { available } })).status()).toBe(200);
  expect((await request.post(`${API}/products/${id}/publish`, { headers })).status()).toBe(204);
  return { id, name };
}

async function availableOf(request: APIRequestContext, owner: Seller, productId: string): Promise<number> {
  const res = await request.get(`${API}/products/${productId}/inventory`, {
    headers: tenantHeaders(owner.accessToken, owner.organizationId),
  });
  return ((await res.json()) as { available: number }).available;
}

async function newBuyer(request: APIRequestContext): Promise<string> {
  const email = `${unique('shopper')}@marketcore.test`;
  expect((await request.post(`${API}/auth/register`, { data: credentials(email) })).status()).toBe(201);
  return email;
}

async function signInTo(page: Page, email: string, next: string): Promise<void> {
  await page.goto(`${WEB}/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(next.replace(/[/?]/g, '\\$&')));
}

async function addToCart(page: Page, productId: string): Promise<void> {
  await page.goto(`${WEB}/p/${productId}`);
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByRole('status')).toContainText('Added');
}

async function buyerPage(browser: Browser): Promise<Page> {
  // A context of its own per buyer: separate cookie jars, separate sessions.
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  return context.newPage();
}

test.describe('storefront: a buyer in a real browser', () => {
  let nile: Seller;
  let delta: Seller;

  test.beforeAll(async ({ request }) => {
    nile = await seller(request, SEEDED_SELLERS.NILE.email);
    delta = await seller(request, SEEDED_SELLERS.DELTA.email);
  });

  test('Journey 1: buys from two sellers in one checkout and sees both orders', async ({ page, request }) => {
    const shirt = await stockedProduct(request, nile, { priceMinor: 24_900, available: 5 });
    const oil = await stockedProduct(request, delta, { priceMinor: 18_900, available: 5 });
    await signInTo(page, await newBuyer(request), '/browse');

    await expect(page.getByRole('link', { name: shirt.name })).toBeVisible();
    await addToCart(page, shirt.id);
    await addToCart(page, oil.id);

    await page.goto(`${WEB}/cart`);
    await expect(page.getByRole('region', { name: SEEDED_SELLERS.NILE.name })).toBeVisible();
    await expect(page.getByRole('region', { name: SEEDED_SELLERS.DELTA.name })).toBeVisible();

    await page.getByRole('link', { name: 'Review order' }).click();
    await expect(page.getByText(/Total .*438\.00/)).toBeVisible();
    await page.getByRole('button', { name: 'Place order' }).click();

    await expect(page).toHaveURL(/\/orders\/[^/]+\/placed$/);
    await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible();
    await expect(page.getByText(/2 orders in one checkout/)).toBeVisible();

    await page.goto(`${WEB}/account/orders`);
    await expect(page.getByRole('link', { name: SEEDED_SELLERS.NILE.name })).toBeVisible();
    await expect(page.getByRole('link', { name: SEEDED_SELLERS.DELTA.name })).toBeVisible();
    expect(await availableOf(request, nile, shirt.id)).toBe(4);
  });

  test('Journey 2: two buyers want the last unit — one wins, the other is back at the cart, flagged', async ({
    browser,
    request,
  }) => {
    const lamp = await stockedProduct(request, nile, { priceMinor: 9_900, available: 1 });
    const first = await buyerPage(browser);
    const second = await buyerPage(browser);
    await signInTo(first, await newBuyer(request), '/browse');
    await signInTo(second, await newBuyer(request), '/browse');

    for (const page of [first, second]) {
      await addToCart(page, lamp.id);
      await page.goto(`${WEB}/checkout`);
      await expect(page.getByRole('button', { name: 'Place order' })).toBeEnabled();
    }

    await first.getByRole('button', { name: 'Place order' }).click();
    await expect(first).toHaveURL(/\/placed$/);

    await second.getByRole('button', { name: 'Place order' }).click();
    await expect(second).toHaveURL(/\/cart\?conflict=lines$/);
    await expect(second.getByRole('alert')).toContainText(/changed/i);
    await expect(second.getByText('Sold out')).toBeVisible();

    // Nothing was created for the loser (D57).
    await second.goto(`${WEB}/account/orders`);
    await expect(second.getByText(/no orders yet/i)).toBeVisible();
    expect(await availableOf(request, nile, lamp.id)).toBe(0);
  });

  test('an abandoned checkout is cancelled by the worker process and restocked exactly once (D70)', async ({
    request,
  }) => {
    test.setTimeout(90_000);
    const kettle = await stockedProduct(request, nile, { priceMinor: 5_000, available: 2 });
    const email = await newBuyer(request);
    const token = await login(request, email);

    expect((await request.put(`${API}/cart/items/${kettle.id}`, { headers: bearer(token), data: { quantity: 2 } })).status()).toBe(200);
    const placed = await request.post(`${API}/checkouts`, {
      headers: bearer(token),
      data: { lines: [{ productId: kettle.id, quantity: 2, unitPriceMinor: 5_000 }] },
    });
    expect(placed.status()).toBe(201);
    const orderId = ((await placed.json()) as { orders: { id: string }[] }).orders[0].id;
    expect(await availableOf(request, nile, kettle.id)).toBe(0);

    // The stack's window is 20 s and its interval 1 s (D87): cancelled well inside 60 s.
    await expect
      .poll(
        async () =>
          ((await (await request.get(`${API}/buyer/orders/${orderId}`, { headers: bearer(token) })).json()) as { status: string })
            .status,
        { timeout: 60_000, intervals: [1_000] },
      )
      .toBe('CANCELLED');
    expect(await availableOf(request, nile, kettle.id)).toBe(2);

    // Several more runs pass; the stock must not rise again (INV-15).
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    expect(await availableOf(request, nile, kettle.id)).toBe(2);

    // And it was the worker process that did it, in its own log.
    const runs = serviceLogs('worker')
      .split('\n')
      .filter((line) => line.includes('"event":"checkout.autocancel.run"'))
      .map((line) => JSON.parse(line) as { cancelled: number });
    expect(runs.some((run) => run.cancelled >= 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run them against the stack**

```bash
pnpm --filter "e2e..." run build
docker compose -f docker-compose.e2e.yml up -d --build --wait
pnpm --filter e2e test:behavioural
docker compose -f docker-compose.e2e.yml down -v
```

Expected: every existing behavioural test plus `storefront.spec.ts` 3 — all pass. Journey 1 must
finish its assertions inside the 20 s window; it takes a few seconds, and if CI ever reports the
orders as `Cancelled` on the My orders step, raise `CHECKOUT_PAYMENT_WINDOW_MS` in compose to 45 s and
the abandoned test's poll timeout with it — never lower the assertion.

- [ ] **Step 3: Commit**

```bash
git add apps/e2e
git commit -m "test(e2e): journeys 1 and 2 in a real browser, and the worker restocking an abandoned checkout"
```

---

### Task 26: The M1 gate — evidence, documents, STATUS

**Files:**
- Modify: `README.md` (flagship table, quick start, honest limitations), `docs/architecture.md`,
  `docs/adr/010-tenant-isolation-in-the-query-layer.md`, `docs/domain-model.md`,
  `docs/failure-scenarios.md`, `docs/superpowers/STATUS.md`,
  `docs/superpowers/plans/2026-10-16-marketcore-release-1.md` (tick T-010 … T-061, M1)

**Interfaces:**
- Consumes: everything.
- Produces: the M1 STATUS entry and a pull request.

- [ ] **Step 1: Run every gate command from a clean database and keep the output**

```bash
docker compose up -d
pnpm --filter @app/database db:reset
pnpm turbo run lint typecheck test build
pnpm --filter api test:concurrency
pnpm --filter api test:integration
pnpm --filter api test:e2e
pnpm --filter worker test:integration
pnpm --filter web test
pnpm --filter @app/ui test
docker compose -f docker-compose.e2e.yml up -d --build --wait && pnpm --filter e2e test:behavioural; docker compose -f docker-compose.e2e.yml down -v
```

Expected, line by line:

| Command | Expected |
|---|---|
| `db:reset` | exit 0; `seed: 2 organization(s), 3 membership(s), 2 product(s)` |
| `turbo run lint typecheck test build` | every task successful, `worker#*` among them; 0 failed |
| `api test:concurrency` | `last-unit` 1 passed (20 runs × 100), `overlapping-carts` 2 passed |
| `api test:integration` | `phase-4-constraints` 12, `enum-drift` 7, `deadlock` 2, `checkout` 7, and the existing suites |
| `api test:e2e` | `inventory` 6, `storefront` 7, `cart` 13, `checkout` 13, `buyer-orders` 4, and the existing suites, including `tenancy` 8/8 unchanged |
| `worker test:integration` | `auto-cancel` 6 passed |
| `web test` | every previous case plus the Tasks 20–24 cases |
| `@app/ui test` | unchanged count — no token touched (SRS-NFR-A11Y-001) |
| behavioural | previous count + 3 (`storefront.spec.ts`) |

Copy the real counts and durations; an expectation above that does not match is either a plan
defect (record it at the end of this document) or a code defect (fix the code).

- [ ] **Step 2: Demonstrate M1 by hand once**

With `docker compose up -d`, `pnpm --filter api dev`, `pnpm --filter worker dev`, `pnpm --filter web dev`:
register a new user, open `/browse`, add **Nile Cotton Shirt** and **Delta Olive Oil** (seeded, stock 10
each), place the order, confirm the placed screen shows **2 orders**, **E£438.00**, and the API log
carries one `checkout.placed` line with the request id. Then
`psql postgresql://app:app@localhost:5432/app -c "UPDATE checkouts SET \"placedAt\" = now() - interval '31 minutes' WHERE id = '<id>'"`
and within a minute the worker logs `checkout.autocancel.run` with `"cancelled":1`; both orders read
`Cancelled` on My orders and both stocks are back at 10. This is M1's claim in one sitting a
reviewer can repeat.

- [ ] **Step 3: Prove the quick start from a clean clone**

```bash
git clone "$PWD" "$TMPDIR/mc-p4" && cd "$TMPDIR/mc-p4"
cp .env.example .env && cp apps/api/.env.example apps/api/.env && cp apps/worker/.env.example apps/worker/.env && cp packages/database/.env.example packages/database/.env
docker compose up -d && corepack enable && pnpm install
pnpm --filter @app/database db:deploy && pnpm --filter @app/database db:seed
pnpm turbo run lint typecheck test build
```

Expected: every command succeeds with no edits. (Use the session scratchpad if `$TMPDIR` is not
writable.)

- [ ] **Step 4: Bring the documents level with the code**

Edit only what this phase made true or false — each line cites its decision:

- `README.md` — flagship table: *Last-item race*, *All-or-nothing checkout*, *Cross-buyer isolation*
  and *Abandoned checkout* move from `phase 4` to **proven**, with the repetition count actually used
  (20) per failure-scenarios §4; quick start gains the worker `.env` and `dev` lines (Task 19 did the
  quick start — check, do not duplicate); limitations gain "orders stay `Pending payment` until
  phase 6" and "no idempotency key until phase 5".
- `docs/adr/010-…` — the amendment says the public catalog is "the one repository method allowed to
  read products without a TenantContext". Cart and checkout also read products and inventory by id
  across tenants (finding 15). Replace with: "Buyer-side repositories — storefront, cart, checkout —
  read products only through `PUBLIC_PRODUCT_WHERE`, and only their public fields leave the server."
- `docs/architecture.md` — under *Architecture rules*, rule 4 gains: "Exception, recorded: the
  checkout transaction writes `inventory` and `cart_items` from the Orders module, because atomicity
  across them is INV-11 (finding 16)." Under *Runtime shape*, the operator UI is at `/dashboard` and
  `/products` today; `/admin` is a T-002 decision (finding 23).
- `docs/domain-model.md` — Order state table: a note that phase 4 ships `Pending payment` and
  `Cancelled` only (D84); entity table: `CartItem` gains `addedUnitPriceMinor` (D82), `OrderItem`
  gains `productName` (D90), `Order` has unique `(checkoutId, organizationId)`.
- `docs/failure-scenarios.md` — the phase-4 rows' "Proven by" cells name the actual spec files.
- `docs/superpowers/STATUS.md` — remove the stray merge marker `||||||| f8b285e` above the Stitch
  re-skin entry (finding 22), then add the entry in Step 5.

The PRD and SRS are **not** edited here. D81–D90 and the findings below are recorded in this plan and
in STATUS; amending the baselined requirements is the owner's call (CR-002 if any changes scope).

- [ ] **Step 5: Write the STATUS entry**

Append to `docs/superpowers/STATUS.md`, in the file's existing shape:

```markdown
## Phase 4 — cart, all-or-nothing checkout, the first worker job — <date> (M1)

**Exit gate (M1):** a buyer fills a two-seller cart and places one checkout; the stock-1 race passes
20 runs in a row; a short line creates nothing; an abandoned checkout restocks once.
**Branch:** `feat/phase-4-cart-checkout`
**Plan:** `docs/superpowers/plans/2026-10-16-marketcore-phase-4-cart-checkout.md` (26 tasks, D81–D90)

### Proven

| Check | Command | Result |
|---|---|---|
| **Stock-1 race ×20** (AC-US-CHK-002-3, SRS-NFR-REL-001) | `pnpm --filter api test:concurrency` | <paste: 20/20 runs 1×201 + 99×409 SOLD_OUT, available 0, 1 checkout; duration> |
| …and it bites | `FOR UPDATE` removed | <paste: failed on run N with …> |
| **Overlapping carts** (SRS-NFR-REL-002) | same | 50/50 × 201, 0 retries; stock 20 → 20×201, 30×409, 0 × 5xx |
| …and it bites | per-line locks in request order, retries 0 | <paste> |
| **All or nothing, 3 sellers** (AC-US-CHK-002-1/-2, INV-11) | `pnpm --filter api test:integration` | 3 orders / 1 checkout; short line → 0 orders, stocks and cart unchanged |
| …and it bites | decrement moved above the decision | <paste> |
| A real deadlock is classified retryable | same | victim carried <Prisma code / meta> |
| **Auto-cancel restores once** (AC-US-CHK-002-4, SRS-NFR-REL-003, INV-15) | `pnpm --filter worker test:integration` | 2 parallel runs and 2 interleaved loops: each product +ordered exactly |
| …and it bites | read-then-write instead of conditional UPDATE | <paste: over-restock by …> |
| 29 min stays, 31 min cancels; SKIP LOCKED skips; restart catches up | same | 6/6 |
| **Cross-buyer isolation** (INV-12, SRS-NFR-SEC-002) | `pnpm --filter api test:e2e` | cart, checkout, order list and detail: 404 / absent, each with its control |
| **Public catalog** (AC-US-CAT-001-1/-2, SRS-NFR-SEC-001) | same + `pnpm --filter @app/contracts test` | drafts 404 and absent; exact public keys; `.strict()` property refuses any extra key |
| Mixed currency refused before any lock (AC-US-CHK-002-5) | `pnpm --filter api test:e2e` | 400 while an inventory row is held locked elsewhere |
| Price changed → 409 with old and new (AC-US-CHK-001-1) | e2e + `pnpm --filter web test` | `details.lines[].currentUnitPriceMinor`; review disables Place order until confirmed |
| Journeys 1 and 2, abandoned checkout via the real worker | `pnpm --filter e2e test:behavioural` | <paste count> |
| check-db-env covers the worker and still compares when it is absent | `pnpm --filter worker test` | 4/4 |
| Whole repo | `pnpm turbo run lint typecheck test build` | <paste N/N> |

### Not proven / deferred

- **No idempotency key** (SRS-FR-CHK-008, AC-US-CHK-003-1) — phase 5. A double submit is safe today
  only because the cart lock (D83) makes the second request a `409 CART_CHANGED`; a retried request
  does **not** get the original 201 back.
- **No payment.** Every order stays `PENDING_PAYMENT` until the worker cancels it; `PAID` is not in
  the schema (D84). Capture-after-cancel (SRS-FR-PAY-004) and the payment that would race auto-cancel
  are phases 6–7.
- **No ledger split.** `splitPlatformFee` is proven as a pure rule (INV-13's arithmetic); nothing posts
  it until phase 8. Refunds are phase 9.
- **SRS-NFR-PERF-001 is unmeasured** — phase 13.
- **The seller's view of orders does not exist**, so there is no cross-tenant test on orders yet; it
  lands with the route that reads orders through `tenantScope`.
- **The 30-minute boundary is proven at integration level only** (29 vs 31 minutes). The behavioural
  stack runs the same code at a 20-second window (D87).
- **The worker has no liveness probe**; compose treats `running` as ready.
- **The concurrency suite shares the developer database**; a dedicated database name is still not
  built (week 2 deferred it too).
- **The shell is not re-skinned** (T-002); the shop's `StoreFrame` is on Quartz tokens and the
  Stitch 057 layout, and no visual check is automated.
- **RLS is still deferred** (ADR 010 review date).

### Findings

<the plan's findings that executing confirmed or overturned, and any new ones, numbered>

### Deviations from the plan

<from the defect table at the end of the plan>
```

- [ ] **Step 6: Commit, push, open the pull request**

```bash
git add README.md docs
git commit -m "docs: M1 — phase 4 evidence, ADR 010 and architecture brought level with the code"
git fetch origin --prune
git push -u origin feat/phase-4-cart-checkout
gh pr create --base main --head feat/phase-4-cart-checkout \
  --title "Phase 4 — cart, all-or-nothing checkout, auto-cancel worker (M1)" \
  --body-file "<scratchpad>/phase-4-pr.md"
```

Expected: CI green on both jobs — `ci` (including `test:concurrency` on its own step and the worker's
integration suite inside `test:coverage`) and `behavioural`.

---

## Decisions added by this plan

Numbered after the SRS, which ends at D80. Each answers a finding below; none widens scope.

| ID | Decision | Finding |
|---|---|---|
| D81 | A seller sets a product's stock with `PUT /products/:id/inventory { available }` — absolute, tenant-scoped, idempotent. | 2 |
| D82 | A cart line snapshots `addedUnitPriceMinor` when first added; quantity changes never update it. The review step compares it with the current price. | 3 |
| D83 | Every cart write and the checkout transaction lock the buyer's cart row first; checkout then locks inventory by `productId COLLATE "C"`. A concurrent second checkout of the same cart sees it empty and gets `409 CART_CHANGED`. | 9 |
| D84 | Phase 4's `CheckoutStatus` and `OrderStatus` are `PENDING_PAYMENT` and `CANCELLED` only; `PAID` is added (additively) by the phase that first writes it. | 6 |
| D85 | A refused checkout line carries one reason, in the order `SOLD_OUT` > `SHORT` > `PRICE_CHANGED`; the current price rides on every conflict. | 7 |
| D86 | A line whose product is no longer public reports `available: 0` and `currentUnitPriceMinor: null`, in the cart and in a 409. | 8 |
| D87 | The worker's interval and payment window default to D79 and D70 and may be shortened only through `AUTO_CANCEL_INTERVAL_MS` / `CHECKOUT_PAYMENT_WINDOW_MS`, with floors; the behavioural stack uses 1 s / 20 s. | 11 |
| D88 | The placed screen keeps PRD §7.4's path `/orders/:id/placed`; its `id` is the checkout id. | 17 |
| D89 | Cursor pages order by `(createdAt desc, id desc)` with the last id as an opaque cursor; buyer order history pages by 20. | 18 |
| D90 | `OrderItem` snapshots `productName` beside `unitPriceMinor`. | 21 |

## Plan findings

Places where the SRS, the PRD, the release plan or the architecture turned out wrong or
underspecified against the code at `3633695`, each with the resolution this plan adopts. Where the
resolution is a decision it is numbered above; the cost of being wrong is stated so a reviewer can
overrule it cheaply.

1. **The error envelope drops `details` from an `HttpException`.** `ErrorEnvelopeFilter.map` forwards
   `details` only for `ZodValidationException`, so SRS §8's typed 409 could not reach a client.
   *Resolution:* Task 7 forwards `details` from any `HttpException` built with them. *If wrong:* none
   found — no existing exception carries the key.
2. **No way to stock a product.** `Inventory` is created at 0 and is read-only through the API; the
   seed stocks only its two products. Journeys, demos and the operator UI could sell nothing new.
   *Resolution:* D81 (Task 9). *If wrong:* one small tenant route to remove; the behavioural journeys
   would need DB access instead.
3. **"Price changed since added" is unobservable.** PRD-FR-CHK-001 and AC-US-CHK-001-1 ask the review
   step for the price "when it was added", but SRS §6's `CartItem` stores no price. *Resolution:* D82,
   one additive column. *If wrong:* the review shows only current prices and AC-US-CHK-001-1's "old
   price" exists only after a 409.
4. **AC-US-CART-002-2 names "buyer X's cart id", but no route takes a cart id** (`GET /cart` is the
   caller's own, SRS-FR-CART-001). *Resolution:* the cart id never goes on the wire (`CartSchema` is
   strict without it); INV-12 for the cart is proven by Y's reads and writes leaving X's cart intact,
   with X's own read as control. *Recommend:* reword the AC to that observable.
5. **RULE-CAT-001 (PRD) lists slug and status as public fields; SRS-FR-CAT-003's schema has neither,
   and D76 gives `Product` no slug.** *Resolution:* the SRS schema wins — it is the allowlist the code
   enforces. *Recommend:* amend RULE-CAT-001 to the SRS list.
6. **The domain model's order machine has states no phase-4 path reaches** (`PAID`, `FULFILLING`,
   `COMPLETED`), and week 2 set the precedent of not shipping unreachable states (`ARCHIVED`).
   *Resolution:* D84. *If wrong:* phase 6 adds an enum value either way; the only loss is that the
   drift test would have caught a missing value one phase earlier.
7. **SRS-FR-CHK-003 does not say what one line that fails two ways reports.** *Resolution:* D85.
8. **A non-public line would leak a draft's price and stock** through the cart (FR-CART-007 keeps the
   line) and the 409 (`available`, `currentUnitPriceMinor` per line), against INV-9 as narrowed.
   *Resolution:* D86; `currentUnitPriceMinor` is nullable on the wire.
9. **Before phase 5, nothing stops one buyer's double submit from creating two checkouts** when stock
   allows both. *Resolution:* D83 — the cart row lock serialises a buyer's checkouts and the second
   sees an empty cart. It makes the double submit harmless, not idempotent; phase 5 still owns
   returning the original 201.
10. **SRS-FR-CXL-001's SQL uses `checkout` / `placed_at`**; the schema convention is plural tables and
    quoted camelCase columns (`checkouts`, `"placedAt"`). *Resolution:* the plan uses the real names;
    the SRS text is illustrative.
11. **D70's 30 minutes cannot run inside a behavioural suite**, yet release plan §7 wants the worker in
    compose "so the behavioural suite runs the abandoned-checkout path against the real process".
    *Resolution:* D87. *If wrong:* the behavioural abandoned-checkout test is dropped and that path is
    proven at integration level only.
12. **`validateEnv` is API-shaped** — it requires `JWT_SECRET`, so the worker could not boot through it.
    *Resolution:* `DatabaseEnvSchema` + `parseEnv` in `@app/runtime`; each process extends the base.
13. **`check-db-env.mjs` exits 0 whenever any file is missing** (`found.length < targets.length`).
    Adding `apps/worker/.env` as ADR 0001 requires would silently stop the API↔database comparison for
    anyone without a worker `.env`. *Resolution:* `found.length < 2`, with a test of that exact case.
14. **The auth throttle (20/min/endpoint) makes 100 HTTP registrations impossible** for the race.
    *Resolution:* the concurrency suite creates users directly and signs tokens with the app's own
    `TokenService`, so the guard chain under test is still the real one. The behavioural suite budgets
    its auth calls (Task 25).
15. **ADR 010's amendment says the public catalog is "the one repository method allowed to read
    products without a TenantContext"**; cart and checkout must also read products and inventory by id
    across tenants. *Resolution:* reword in Task 26 around the shared `PUBLIC_PRODUCT_WHERE`.
16. **Architecture rule 4 (no module writes another's tables) vs INV-11.** Atomic checkout writes
    `inventory` and `cart_items` from Orders. *Resolution:* the transaction lives in
    `CheckoutRepository` and the exception is written into architecture.md; the alternative passes a
    Prisma transaction client through three services, which the layering rule calls a defect.
17. **The placed route `/orders/:id/placed` names an order, but the screen is a checkout of several
    orders.** *Resolution:* D88 keeps the PRD's path and reads it as the checkout id.
18. **SRS-FR-BORD-001 says "cursor-paginated" without a page size or cursor shape.** *Resolution:* D89.
    A cursor naming another buyer's order positions the page by that order's timestamp but returns
    only the caller's rows; nothing of the other order is disclosed.
19. **AC-US-CAT-001-1's "exactly the two published products appear" cannot hold in a shared test
    database**, where every suite's published products are public. *Resolution:* assert over the test's
    own sellers, plus "no draft anywhere in the page". *Recommend:* a dedicated database per suite
    (deferred since week 2) would let the AC be asserted literally.
20. **A buyer who signs in lands on `/dashboard`, which forces onboarding on a user with no
    organization** — the opposite of D53. *Resolution in this plan:* storefront routes are protected
    and `?next=` brings a buyer back to the shop (Task 20). *Recommend:* T-002 sends a user with no
    membership to `/browse` by default and offers "create an organization" as a choice, not a gate.
21. **The domain model snapshots an order item's price but not its name**, so renaming a product would
    rename its order history. *Resolution:* D90, one additive column.
22. **`docs/superpowers/STATUS.md` at `3633695` contains a leftover merge marker** (`||||||| f8b285e`)
    above the Stitch re-skin entry. *Resolution:* removed in Task 26.
23. **architecture.md places the operator UI under `/admin`; the code serves it at `/dashboard` and
    `/products`.** *Resolution:* storefront routes chosen so neither layout collides; the move is
    T-002's decision.
24. **How Prisma 6 reports a Postgres deadlock inside an interactive transaction is not a documented
    contract** (`P2034` vs `P2010` + `meta.code`). *Resolution:* the classifier accepts both and Task 12
    manufactures a real deadlock to pin which one occurs.
25. **SRS §6 ("Order: + checkoutId") and release plan §7 ("nullable `checkoutId` backfilled before it
    becomes required") assume `Order` already exists. It does not** — no order model exists at
    `3633695`. *Resolution:* five new tables, `checkoutId NOT NULL` from the first migration, nothing to
    backfill.

## What could not be grounded in the code

Recorded so an executor does not mistake a plan assumption for a repository fact:

- **Prisma `updateMany` / `groupBy` with relation filters** (`product: { organizationId }`,
  `order: { checkoutId: { in } }`) are used in Tasks 9 and 18 on the strength of Prisma 6's documented
  `WhereInput`; no existing code in the repository uses either shape. If either is rejected, use a
  `$queryRaw` with the same predicate and record it.
- **Prisma's `@default(now())` and a JS `Date` parameter compared in raw SQL** (Task 18) assume the
  database session runs in UTC, as the compose and CI Postgres images do. The 29-vs-31-minute case is
  the test that would catch a time-zone skew.
- **Next 15 route-handler `params` as a `Promise`** (Task 20) follows the framework's current
  signature; `next typegen` in `pnpm --filter web typecheck` is what verifies it.

## Defects found during execution, and how each was resolved

Written while executing, as week 2 did: a row per place where a step's code or expected output was
wrong, with the correction a later reader should apply instead of the snippet in the task body.

| # | Where | Defect | Resolution |
|---|---|---|---|
