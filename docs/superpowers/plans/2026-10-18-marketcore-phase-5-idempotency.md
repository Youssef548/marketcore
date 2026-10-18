# MarketCore Phase 5 — Retry-safe checkout: one key, one operation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. `superpowers:test-driven-development` applies to every task
> that writes code.

**Goal:** Deliver Release 1's phase-5 slice (T-070, milestone M2) — `POST /checkouts` carries an
`Idempotency-Key`; a repeat with the same body answers with the checkout it already placed; the same
key with a different body is refused `409 CONFLICT` with `details.reason: KEY_REUSED`; 20 requests
with one key leave one checkout and one set of orders — and close the landing change D91 left owed to
T-002, which phase 4 unblocked.

**Architecture:** The checkout transaction gains one statement at its head. A row in the new
`idempotency_keys` table is claimed with `INSERT … ON CONFLICT DO NOTHING` inside the same
`CheckoutRepository.place` transaction that already locks the cart row and every inventory row, so the
effect and its record commit together. The row is written with the id the placement is about to give
its checkout; the foreign key is `DEFERRABLE INITIALLY DEFERRED`, so a committed key must name a
checkout that exists and an in-flight duplicate blocks on the unique index without holding anything
else. The browser mints one key per placement attempt and the BFF forwards it as a header
(ADR 003, D94–D100).

**Tech Stack:** pnpm 9.15.0 workspaces + Turborepo 2; NestJS 11; Prisma 6 + PostgreSQL 16; zod 4
(`nestjs-zod` 5); Node 22; jest 30 + supertest (apps/api); vitest 2 (packages, apps/worker, apps/web);
Next.js 15.5 + React 19 (apps/web); Playwright 1.49 (apps/e2e); Docker Compose + Caddy.

**Spec:** `docs/superpowers/specs/2026-10-16-marketcore-storefront-srs.md` (SRS 1.0, `SRS-FR-CHK-008`,
§6 `IdempotencyKey`, §7 the header rule, §8 no new error codes).
**Read with it:** `docs/superpowers/specs/2026-10-16-marketcore-storefront-prd.md` (US-CHK-003,
AC-US-CHK-003-1, PRD-FR-CHK-006), `docs/superpowers/specs/2026-10-17-cr-002-phase-4-rulings.md`
(D81–D93), `docs/adr/003-request-scoped-idempotency.md` (this phase's ADR), ADRs `002`, `010`, `011`,
`docs/superpowers/plans/2026-10-16-marketcore-release-1.md` (task ids, §6 test map), the phase-4 plan
`docs/superpowers/plans/2026-10-16-marketcore-phase-4-cart-checkout.md` (the code this plan extends),
`docs/domain-model.md`, `docs/failure-scenarios.md`.

**This plan adds decisions D94–D100** — listed with the gap that forced each in *Decisions added by
this plan* at the end. None changes a requirement silently.

**Branch:** `feat/phase-5-idempotency`, from `dbfecb1` (the commit that closed phase 4, PR #87).
The API, contracts, domain, database and concurrency tasks (1, 2, 3, 4, 5, 6) are independent of the
web tasks (7, 8, 9) and of the gate (10); 5, 6 and 10 depend on 1–4.

---

## Global Constraints

Copied from the SRS, the platform spec and AGENTS.md. Every task's requirements implicitly include
this section.

- Node 22 (`.node-version`), pnpm 9.15.0 via Corepack. Workspace scope is `@app/*`.
- **Money is integer minor units. No floating point in logic** (platform D9).
- `packages/*` never imports `apps/*`; `apps/*` never imports `apps/*` (ADR 0001).
- `packages/domain` holds pure rules only — no Nest, no Prisma, no IO, and no Node built-ins (it is
  bundled by the browser). It may import `@app/contracts`.
- Contracts in `packages/contracts` are the wire source of truth. **No new `ErrorCode`** (SRS §8):
  a reused key is `409 CONFLICT` with a typed `details`, a missing or malformed key is
  `400 VALIDATION_ERROR`.
- Every route is guarded by default; `@Public()`, `@TenantFree()`, `@OwnerOnly()` remain the only
  opt-outs. `POST /checkouts` stays `@TenantFree()` per handler (D75).
- Buyer identity comes from the access token's `sub`, resolved by `BuyerGuard`. A controller reads no
  identity header.
- **Layering is `controller → service → repository → Prisma`.** A service importing `PrismaService`
  is a defect. A transaction is opened by a repository.
- **No literals in logic.** Wire values in `packages/contracts/src/constants.ts`; implementation values
  in a `*.constants.ts` beside the code that owns them; const-object enums with derived types.
- Interfaces and types live in `interfaces/*.interface.ts` (apps) or `<subject>.interface.ts`
  (packages), never beside logic.
- Feature modules: `dto/`, `repositories/`, `interfaces/` folders; controllers, services, mappers and
  the module file at the module root; shared non-module code in `apps/api/src/common/`.
- **Migrations are additive.** `idempotency_keys` is a new table; nothing existing is dropped or
  rewritten, and the two existing enum types are untouched.
- No Redis in phase 5 (SRS §10). The record is PostgreSQL.
- **Every test that touches data runs against real PostgreSQL** (failure-scenarios §4). Nothing in
  integration, e2e or concurrency suites mocks Prisma.
- Do not weaken a test to get green. If a test fails, decide whether the code or the expectation is
  wrong, and record a wrong expectation in the defect table at the end of this plan.
- Every task ends green on `pnpm turbo run lint typecheck test build`.

## Verification ladder used by this plan

| Claim | Lowest layer that can falsify it | Suite |
|---|---|---|
| The header's length and character rules, `KEY_REUSED` in the 409 details | contracts unit | `pnpm --filter @app/contracts test` |
| The canonical request ignores line order and nothing else | domain unit + property | `pnpm --filter @app/domain test` |
| A committed key must name a checkout; `(buyerId, key)` is unique; the key is bounded | integration, real Postgres | `pnpm --filter api test:integration` |
| Claim, replay, refuse-mismatch and release, against real rows | integration, real Postgres | `pnpm --filter api test:integration` |
| Status codes, the required header, envelopes, cross-buyer scoping, 20 repeats → one checkout (AC-US-CHK-003-1) | API e2e | `pnpm --filter api test:e2e` |
| 100 duplicates of one key, concurrently, leave one checkout (INV-2) | concurrency, real Postgres, real HTTP | `pnpm --filter api test:concurrency` |
| One key per attempt reaches the API through the BFF, and a retry is harmless in a real browser | behavioural Playwright | `pnpm --filter e2e test:behavioural` |
| The web pages and the landing decision | web unit | `pnpm --filter web test` |

## File Structure

New files:

| File | Responsibility |
|---|---|
| `packages/contracts/src/idempotency.ts` | the `Idempotency-Key` wire schema |
| `packages/contracts/test/idempotency.spec.ts` | its rules |
| `packages/domain/src/idempotency.ts` | the canonical request string |
| `packages/domain/test/idempotency.spec.ts` | order-insensitivity and distinctness |
| `packages/database/prisma/schema/IdempotencyKey.prisma` | the `idempotency_keys` model |
| `packages/database/prisma/migrations/<ts>_add_idempotency_keys/migration.sql` | the table, its uniques and the deferred foreign key |
| `apps/api/src/orders/repositories/idempotency.repository.ts` | claim, replay, release, inside the caller's transaction |
| `apps/api/src/orders/interfaces/idempotency.interface.ts` | `IdempotencyScope`, `IdempotencyClaim` |
| `apps/api/test/integration/idempotency.integration-spec.ts` | the table's constraints and the repository's outcomes |
| `apps/api/test/idempotency.e2e-spec.ts` | the wire behaviour, including AC-US-CHK-003-1 |
| `apps/api/test/concurrency/idempotency.concurrency-spec.ts` | 100 concurrent duplicates → one checkout |
| `apps/web/src/lib/storefront/attempt.ts` | `newAttemptKey()` — one key per attempt |
| `apps/web/src/lib/storefront/attempt.test.ts` | the key satisfies the contract's rule |

Changed files: `packages/contracts/src/constants.ts`, `checkout.ts`, `index.ts`;
`packages/domain/src/index.ts`; `packages/database/prisma/schema/User.prisma`, `Checkout.prisma`;
`apps/api/src/orders/checkout.controller.ts`, `checkout.service.ts`, `orders.constants.ts`,
`interfaces/checkout.interface.ts`, `repositories/checkout.repository.ts`, `checkout.service.spec.ts`,
`repositories/checkout.repository.spec.ts`; `apps/api/test/checkout.e2e-spec.ts`,
`test/integration/checkout.integration-spec.ts`, `test/concurrency/last-unit.concurrency-spec.ts`,
`test/concurrency/overlapping-carts.concurrency-spec.ts`; `apps/web/src/lib/storefront/client.ts`,
`client.test.ts`, `apps/web/src/app/api/checkouts/route.ts`, `apps/web/src/lib/auth/resources.ts`,
`apps/web/src/app/(shop)/checkout/page.tsx`, `apps/web/src/app/page.tsx`,
`apps/web/src/lib/session/routing.ts`, `apps/web/src/app/(auth)/login/page.tsx`,
`apps/web/src/app/(dash)/onboarding.tsx` and their tests; `apps/e2e/tests/storefront.spec.ts`;
the four documents Task 10 lists.

## Task map

| Task | Release-plan id | Deliverable | Proven by |
|---|---|---|---|
| 1 | T-070 | the header schema, `KEY_REUSED`, the 409 details | contracts unit |
| 2 | T-070 | the canonical request fingerprint | domain unit + property |
| 3 | T-070 | `idempotency_keys`, its uniques and the deferred FK | integration |
| 4 | T-070 | `IdempotencyRepository` — claim, replay, release | integration |
| 5 | T-070 | checkout routes require the header; replay, refusal and release wired | unit + e2e |
| 6 | T-070 | the race existing suites re-keyed, and 100 duplicates of one key | concurrency |
| 7 | T-070 | one key per attempt, through the BFF | web unit |
| 8 | T-070 | the retry a browser makes through its own session | behavioural |
| 9 | T-002 (D91) | a signed-in visitor lands on the storefront | web unit + behavioural |
| 10 | M2 | the gate: evidence, documents, STATUS | every suite |

Tasks 1 and 2 are independent. Task 3 needs 1 (the schema is unchanged by it, but the key length the
CHECK repeats comes from it). Tasks 4–6 need 1–3. Tasks 7–9 need nothing from 1–6 except the API's
new 400, so they may be dispatched in parallel with them.

---

### Task 1: Contracts — the header and `KEY_REUSED` (T-070)

**Goal:** one place that says what an idempotency key looks like and what a reused key answers.

**Files:**
- Create `packages/contracts/src/idempotency.ts`
- Create `packages/contracts/test/idempotency.spec.ts`
- Change `packages/contracts/src/constants.ts` (the header name, its bounds, `CheckoutRefusals`)
- Change `packages/contracts/src/checkout.ts` (the third 409 details member)
- Change `packages/contracts/src/index.ts` (`export * from './idempotency'`)
- Change `packages/contracts/test/checkout.spec.ts` (the union's new member)

**Interfaces:**

```ts
// constants.ts — beside the other wire values, never in logic
/** SRS §7: the one header this API requires. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENCY_KEY_MIN_LENGTH = 1;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 64;
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

/** A refusal about the request as a whole rather than one line (SRS-FR-CHK-006, -008). */
export const CheckoutRefusals = { CART_CHANGED: 'CART_CHANGED', KEY_REUSED: 'KEY_REUSED' } as const;
```

```ts
// idempotency.ts
/** SRS-FR-CHK-008. A client-chosen key, bounded and printable so it survives a header. */
export const IdempotencyKeySchema = z
  .string()
  .min(IDEMPOTENCY_KEY_MIN_LENGTH)
  .max(IDEMPOTENCY_KEY_MAX_LENGTH)
  .regex(IDEMPOTENCY_KEY_PATTERN)
  .meta({ id: 'IdempotencyKey' });
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;
```

```ts
// checkout.ts
/** `error.details` of a 409 refusing a key already used for a different body (ADR 003). */
export const CheckoutKeyReusedDetailsSchema = z
  .object({ reason: z.literal(CheckoutRefusals.KEY_REUSED) })
  .strict()
  .meta({ id: 'CheckoutKeyReusedDetails' });

export const CheckoutConflictDetailsSchema = z.union([
  CheckoutLineConflictDetailsSchema,
  CheckoutCartChangedDetailsSchema,
  CheckoutKeyReusedDetailsSchema,
]);
```

**Steps:**

- [ ] Write the failing tests in `packages/contracts/test/idempotency.spec.ts`: the schema accepts
  `'a'`, a 64-character key and `'buyer-1_attempt_2'`; it rejects `''`, a 65-character key,
  `'has space'`, `'has/slash'`, `'üm'` and `undefined`. In `checkout.spec.ts`: the conflict union
  parses `{ reason: 'KEY_REUSED' }`, still parses a `lines` payload and `CART_CHANGED`, and still
  rejects an unknown `reason` and an extra key under `KEY_REUSED` (`.strict()`).
- [ ] Run them and watch them fail: `pnpm --filter @app/contracts test` — the new file cannot import
  a module that does not exist.
- [ ] Add the constants, the schema, the details member and the index export.
- [ ] Run `pnpm --filter @app/contracts test` — green.
- [ ] `pnpm --filter @app/contracts typecheck && pnpm --filter @app/contracts lint`
- [ ] Commit: `feat(contracts): the Idempotency-Key rule and the KEY_REUSED refusal (T-070)`

---

### Task 2: Domain — the canonical request (T-070)

**Goal:** the body comparison SRS-FR-CHK-008 asks for, as a pure function of the request.

**Files:**
- Create `packages/domain/src/idempotency.ts`
- Create `packages/domain/test/idempotency.spec.ts`
- Change `packages/domain/src/index.ts` (`export * from './idempotency'`)

**Interface:**

```ts
/**
 * The request's fingerprint (ADR 003, D96): the confirmed lines, ordered bytewise by
 * `productId` and projected to exactly the three wire fields, so a re-submit that
 * only reorders the lines is the same request and a changed quantity, price or
 * product is a different one.
 *
 * Ordering uses `byLockOrder`, not `localeCompare`: the same bytewise order the
 * checkout locks rows in, so the fingerprint does not depend on the machine's locale.
 * No hashing — the string is the comparison, and a mismatch stays readable.
 */
export function checkoutRequestFingerprint(lines: readonly CheckoutLineRequest[]): string;
```

**Steps:**

- [ ] Write the failing tests in `packages/domain/test/idempotency.spec.ts`:
  - the same lines in two different orders produce one fingerprint;
  - a changed `quantity`, a changed `unitPriceMinor`, a different `productId`, a missing line and an
  extra line each produce a different one;
  - `[]` produces `{"lines":[]}`;
  - two calls with the same input are equal (no map iteration order leaks in);
  - a property test (fast-check) over arbitrary line arrays: shuffling the lines preserves the
  fingerprint, and the result parses as JSON with one object per line.
- [ ] Run `pnpm --filter @app/domain test` and watch it fail for want of the function.
- [ ] Implement it: sort a copy with `byLockOrder` on `productId`, project
  `{ productId, quantity, unitPriceMinor }` in that literal order, and return
  `JSON.stringify({ lines })`.
- [ ] Green on `pnpm --filter @app/domain test`.
- [ ] `pnpm --filter @app/domain typecheck` and lint.
- [ ] Commit.

### Task 3: Database — the table and the deferred foreign key (T-070)

**Goal:** the record's storage, with the invariant a bug cannot break.

**Files:**
- Create `packages/database/prisma/schema/IdempotencyKey.prisma`
- Change `packages/database/prisma/schema/User.prisma` (add `idempotencyKeys IdempotencyKey[]`)
- Change `packages/database/prisma/schema/Checkout.prisma` (add `idempotencyKey IdempotencyKey?`)
- Create the migration under `packages/database/prisma/migrations/`
- Create `apps/api/test/integration/idempotency.integration-spec.ts`

**Model:**

```prisma
// One claimed request key (ADR 003, D94–D99). The row is inserted with the id of the
// checkout the request will create, before that checkout exists; the foreign key is
// DEFERRABLE INITIALLY DEFERRED (added by hand in the migration), so the constraint
// holds at commit and an in-flight duplicate can block on the unique index.
model IdempotencyKey {
  id                 String   @id @default(uuid())
  buyerId            String
  key                String
  requestFingerprint String
  checkoutId         String   @unique
  createdAt          DateTime @default(now())

  buyer    User     @relation(fields: [buyerId], references: [id], onDelete: Restrict)
  checkout Checkout @relation(fields: [checkoutId], references: [id], onDelete: Restrict)

  @@unique([buyerId, key])
  @@map("idempotency_keys")
}
```

**Migration:** generate it, then append the two hand-written statements Prisma cannot express:

```sql
-- ADR 003 (D98): the claim is inserted before the checkout it names, so the foreign
-- key is deferred to commit. PostgreSQL defers REFERENCES; it cannot defer a CHECK.
ALTER TABLE "idempotency_keys" DROP CONSTRAINT "idempotency_keys_checkoutId_fkey";
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_checkoutId_fkey"
  FOREIGN KEY ("checkoutId") REFERENCES "checkouts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- The key is bounded by the wire rule (SRS §7) at the column too, so a write around
-- the API cannot store one the API would refuse.
ALTER TABLE "idempotency_keys"
  ADD CONSTRAINT "idempotency_keys_key_length"
  CHECK (char_length("key") BETWEEN 1 AND 64);
```

**Steps:**

- [ ] Write the failing integration tests first, in
  `apps/api/test/integration/idempotency.integration-spec.ts`, each naming the constraint it proves:
  - a key row naming a checkout that is never inserted fails when the transaction ends (the deferred
  FK is checked at commit — assert the throw, not its class);
  - the same `(buyerId, key)` twice is refused (`idempotency_keys_buyerId_key_key`);
  - the same key for two different buyers is accepted;
  - 65 characters, and an empty string, are refused by `idempotency_keys_key_length`;
  - a missing `checkoutId` is refused (NOT NULL);
  - `POST`-shape defaults: `createdAt` is set.
  Follow the shape of `apps/api/test/integration/phase-4-constraints.integration-spec.ts`, and use
  the existing `testPrisma` helper.
- [ ] Run `pnpm --filter api test:integration` and watch the constraint tests fail (the table does
  not exist).
- [ ] Write the model, the two back-relations, and the migration; apply it against the local
  PostgreSQL (`pnpm --filter @app/database db:migrate`).
- [ ] Green on `pnpm --filter api test:integration` — **including the two suites phase 4 left**.
- [ ] Commit.

### Task 4: The repository — claim, replay, release (T-070)

**Goal:** the three outcomes of ADR 003, as one method that runs in the caller's transaction.

**Files:**
- Create `apps/api/src/orders/repositories/idempotency.repository.ts`
- Create `apps/api/src/orders/interfaces/idempotency.interface.ts`
- Change `apps/api/src/orders/orders.constants.ts` (`IdempotencyClaimKinds`)
- Extend `apps/api/test/integration/idempotency.integration-spec.ts`

**Interfaces:**

```ts
// interfaces/idempotency.interface.ts
/** What one request claims. The checkout id is minted by the caller before the row exists. */
export interface IdempotencyScope {
  buyerId: string;
  key: string;
  requestFingerprint: string;
  checkoutId: string;
}

export type IdempotencyClaim =
  | { kind: typeof IdempotencyClaimKinds.CLAIMED }
  | { kind: typeof IdempotencyClaimKinds.REPLAY; checkoutId: string }
  | { kind: typeof IdempotencyClaimKinds.KEY_REUSED };
```

```ts
// repositories/idempotency.repository.ts
/**
 * The idempotency record, inside the transaction that produces the effect (ADR 003).
 * It is constructed by `CheckoutRepository` with the same `PrismaService`, the way the
 * cart and inventory repositories are, so all three share one transaction client.
 */
@Injectable()
export class IdempotencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** `INSERT … ON CONFLICT DO NOTHING` — the unique index is the arbiter (D97). */
  async claim(tx: Prisma.TransactionClient, scope: IdempotencyScope): Promise<IdempotencyClaim> {
    const { count } = await tx.idempotencyKey.createMany({ data: scope, skipDuplicates: true });
    if (count === 1) return { kind: IdempotencyClaimKinds.CLAIMED };

    const existing = await tx.idempotencyKey.findUniqueOrThrow({
      where: { buyerId_key: { buyerId: scope.buyerId, key: scope.key } },
      select: { requestFingerprint: true, checkoutId: true },
    });
    if (existing.requestFingerprint !== scope.requestFingerprint) {
      return { kind: IdempotencyClaimKinds.KEY_REUSED };
    }
    return { kind: IdempotencyClaimKinds.REPLAY, checkoutId: existing.checkoutId };
  }

  /** A refused placement leaves no claim (D98). With the FK deferred, this is also what keeps the transaction committable. */
  async release(tx: Prisma.TransactionClient, scope: Pick<IdempotencyScope, 'buyerId' | 'key'>): Promise<void> {
    await tx.idempotencyKey.deleteMany({ where: { buyerId: scope.buyerId, key: scope.key } });
  }
}
```

**Steps:**

- [ ] Write failing integration tests: a claim followed by the checkout it names commits and reads
  back; a claim followed by `release` leaves no row and lets a later claim with the same key succeed;
  a second claim with the same key and fingerprint answers `REPLAY` with the first `checkoutId`; a
  second claim with a different fingerprint answers `KEY_REUSED`; two buyers with the same key string
  each get `CLAIMED`.
- [ ] Red on `pnpm --filter api test:integration`.
- [ ] Implement the interface, the kinds and the repository.
- [ ] Green. Lint and typecheck `api`.
- [ ] Commit.

### Task 5: Checkout requires the header (T-070)

**Goal:** the wire behaviour — required header, replay, `KEY_REUSED`, and a released claim on every
refusal.

**Files:**
- Change `apps/api/src/orders/checkout.controller.ts`, `checkout.service.ts`,
  `repositories/checkout.repository.ts`, `orders.constants.ts`, `interfaces/checkout.interface.ts`
- Change `apps/api/src/orders/checkout.service.spec.ts`,
  `repositories/checkout.repository.spec.ts`
- Change `apps/api/test/integration/checkout.integration-spec.ts`
- Change `apps/api/test/checkout.e2e-spec.ts` (send a key)
- Create `apps/api/test/idempotency.e2e-spec.ts`

**Interfaces:**

```ts
// orders.constants.ts
export const PlaceCheckoutOutcomes = {
  PLACED: 'PLACED',
  REPLAYED: 'REPLAYED',
  REJECTED: 'REJECTED',
  CART_CHANGED: 'CART_CHANGED',
  KEY_REUSED: 'KEY_REUSED',
} as const;

export const CheckoutMessages = {
  /* …unchanged… */
  KEY_REUSED: 'This key was used for a different order',
} as const;

export const CheckoutLogReasons = {
  MIXED_CURRENCY: 'MIXED_CURRENCY',
  CONTENDED: 'CONTENDED',
  KEY_REUSED: 'KEY_REUSED',
} as const;
```

```ts
// interfaces/checkout.interface.ts
export type PlaceCheckoutOutcome =
  | { kind: typeof PlaceCheckoutOutcomes.PLACED; checkoutId: string }
  | { kind: typeof PlaceCheckoutOutcomes.REPLAYED; checkoutId: string }
  | { kind: typeof PlaceCheckoutOutcomes.REJECTED; conflicts: LineConflict[] }
  | { kind: typeof PlaceCheckoutOutcomes.CART_CHANGED }
  | { kind: typeof PlaceCheckoutOutcomes.KEY_REUSED };
```

```ts
// checkout.controller.ts — the header is validated by the same pipe the global one is,
// so a missing key is the same 400 VALIDATION_ERROR envelope a malformed body gets.
place(
  @Buyer() buyer: BuyerContext,
  @Headers(IDEMPOTENCY_KEY_HEADER, new ZodValidationPipe(IdempotencyKeySchema)) key: string,
  @Body() body: CreateCheckoutRequestDto,
  @Req() request: Request,
): Promise<Checkout>
```

The repository gains one parameter and one statement; everything else in `placeWithin` keeps its
order (the claim is step 0, before the cart lock):

```ts
place(
  buyer: BuyerContext,
  key: string,
  requestFingerprint: string,
  lines: readonly ConfirmedLine[],
): Promise<PlaceCheckoutOutcome>

// placeWithin(tx, buyer, key, fingerprint, lines)
const checkoutId = randomUUID();
const scope = { buyerId: buyer.buyerId, key, requestFingerprint, checkoutId };
const claim = await this.idempotencyRepository.claim(tx, scope);
if (claim.kind === IdempotencyClaimKinds.KEY_REUSED) return { kind: PlaceCheckoutOutcomes.KEY_REUSED };
if (claim.kind === IdempotencyClaimKinds.REPLAY) {
  return { kind: PlaceCheckoutOutcomes.REPLAYED, checkoutId: claim.checkoutId };
}
// …the existing steps 1–6, each refusal path calling `release(tx, scope)` first,
// and `tx.checkout.create({ data: { id: scope.checkoutId, … } })` on the way out.
```

**Steps:**

- [ ] Write the failing unit tests: the service answers a `REPLAYED` outcome with the stored
  checkout and logs `checkout.placed` with `replayed: true`; it refuses `KEY_REUSED` with
  `409` and `details.reason` `KEY_REUSED`, logging `checkout.rejected` with that reason; the service
  passes the fingerprint from `checkoutRequestFingerprint` and one minted checkout id.
- [ ] Update the two existing specs for the new signatures; they must fail for the *new* reason, not
  for a compile error, before the implementation lands.
- [ ] Write `apps/api/test/idempotency.e2e-spec.ts` failing, covering:
  - **AC-US-CHK-003-1**: 20 sequential requests, one key, one cart → **one checkout row, one set of
    orders, one `Checkout` body** (assert the 20 bodies' `id`s are one value and the DB counts are 1),
    stock decremented once, cart empty;
  - the same key with a different `quantity` → `409` `CONFLICT` `details.reason: KEY_REUSED`;
  - the same lines in a different order → the same checkout (D96);
  - a retry after the cart was emptied → `201` with the original checkout, **not** `CART_CHANGED`;
  - a refused placement (a `SOLD_OUT` line) does not consume the key: the buyer fixes the cart and
    retries the same key → `201` (D98);
  - a missing header → `400 VALIDATION_ERROR`; a 65-character and a `'has space'` key → `400`;
  - two buyers using the same key string get two different checkouts (D99);
  - `Accept`/auth are unchanged: no key and no token → `401` (the guard runs before the pipe).
- [ ] Red on `pnpm --filter api test:e2e`.
- [ ] Implement the controller, service, repository, constants and interfaces.
- [ ] Green on `pnpm --filter api exec jest`, `pnpm --filter api test:integration` and
  `pnpm --filter api test:e2e`; update `checkout.e2e-spec.ts` so every existing placement sends a
  fresh key and keeps asserting what it asserted.
- [ ] Commit.

### Task 6: The duplicates that arrive together (T-070)

**Goal:** INV-2 holds when the repeats are concurrent, and every existing race keeps racing.

**Files:**
- Create `apps/api/test/concurrency/idempotency.concurrency-spec.ts`
- Change `apps/api/test/concurrency/last-unit.concurrency-spec.ts`,
  `overlapping-carts.concurrency-spec.ts` (each request sends a key)

**The claim:** with one key and one cart, 100 concurrent `POST /checkouts` on a 10-unit product
answer **201 a hundred times with a single checkout id**, leave one checkout, one order per seller,
stock `9`, and an empty cart — repeated 10 consecutive times with fresh rows. The losers hit the
uncommitted unique index entry, hold nothing, and replay.

**Steps:**

- [ ] Write the spec failing (the requests have no key yet).
- [ ] Add the key to the two existing race specs — one constant per racer is correct there, because
  the key is scoped to the buyer and every racer is a different buyer — and confirm both still pass
  with their existing assertions unchanged.
- [ ] Red, then green on `pnpm --filter api test:concurrency`.
- [ ] Commit.

### Task 7: One key per attempt, through the BFF (T-070)

**Goal:** the browser sends a key the API accepts, and a retry of the same attempt reuses it.

**Files:**
- Create `apps/web/src/lib/storefront/attempt.ts`, `attempt.test.ts`
- Change `apps/web/src/lib/storefront/client.ts`, `client.test.ts`
- Change `apps/web/src/app/(shop)/checkout/page.tsx`
- Change `apps/web/src/app/api/checkouts/route.ts`
- Change `apps/web/src/lib/auth/resources.ts`

**Interfaces:**

```ts
// lib/storefront/attempt.ts
/** One key per placement attempt (D100): minted when the review step mounts, reused by every retry of it. */
export const newAttemptKey = (): string => crypto.randomUUID();
```

```ts
// lib/storefront/client.ts — the key is a header, the body is unchanged
placeCheckout: (body: CreateCheckoutRequest, idempotencyKey: string) => Promise<Checkout>
```

The BFF forwards the browser's header and, when it is absent or malformed, answers the same
`400 VALIDATION_ERROR` envelope the API would (`parseBody`'s shape), so a client cannot tell which hop
refused it.

**Steps:**

- [ ] Failing tests: `attempt.test.ts` asserts a minted key satisfies `IdempotencyKeySchema` and two
  calls differ; `client.test.ts` asserts `placeCheckout` sends `Idempotency-Key` with the value it was
  given; a page/route test asserts a request without the header answers `400` with
  `code: 'VALIDATION_ERROR'` and that a retry reuses one key.
- [ ] Red on `pnpm --filter web test`.
- [ ] Implement: `page.tsx` holds `const [idempotencyKey] = useState(newAttemptKey)` (a lazy
  initialiser, **not** `useRef(newAttemptKey())` — the argument would be evaluated on every render);
  the client and BFF pass the header through.
- [ ] Green; `pnpm --filter web test`, lint and typecheck.
- [ ] Commit.

### Task 8: The retry a browser makes (T-070)

**Goal:** the user-facing claim, observed in a real browser against the real stack.

**Files:** change `apps/e2e/tests/storefront.spec.ts`.

**Steps:**

- [ ] Add a test that signs in, fills a cart, and — with the browser's own session — posts
  `/api/checkouts` twice with one key from the page context, asserting both answers carry one checkout
  id and that the orders list shows exactly one order. Add a key to the direct API placement the
  abandoned-checkout test already makes.
- [ ] Red, then green on `pnpm --filter e2e test:behavioural` (the compose stack; the worker's payment
  window stays at D87's 20 s).
- [ ] Capture the before/after screenshots the PR body needs.
- [ ] Commit.

### Task 9: D91 — a signed-in visitor lands on the storefront (T-002)

**Goal:** close the deferral T-002 recorded: with `/browse` existing, a signed-in user lands there,
and the way to open a shop is called what it is.

**Files:**
- Change `apps/web/src/lib/session/routing.ts` (`STOREFRONT_PATH`, and the credential-page decision)
- Change `apps/web/src/app/page.tsx`, `apps/web/src/app/(auth)/login/page.tsx`
- Change `apps/web/src/app/(dash)/onboarding.tsx` (the heading and action become **Start selling**)
- Change `apps/web/src/lib/session/routing.test.ts`, `apps/web/src/app/page.test.tsx`,
  `apps/web/src/app/(auth)/login/page.test.tsx`

**Bound:** this task changes *where a signed-in visitor lands* and *what the first-run screen is
called*. It does not move the console, and it must not make `/admin` unreachable for a user with no
organization — that screen stays the place an organization is created.

**Steps:**

- [ ] Failing tests for each decision: a signed-in visitor on `/login` or `/register` is sent to
  `/browse`; the front door sends a signed-in visitor to `/browse` and a signed-out one to `/login`;
  the login fallback is `/browse`; the first-run screen's heading and button read "Start selling".
- [ ] Red on `pnpm --filter web test`.
- [ ] Implement.
- [ ] Green; lint, typecheck.
- [ ] Commit.

### Task 10: M2 — the gate, the documents and STATUS

**Goal:** the milestone's evidence, and the documents brought level with the code.

**Files:** `README.md`, `docs/domain-model.md`, `docs/failure-scenarios.md`,
`apps/e2e/tests/storefront.spec.ts` if the landing needs a journey,
`docs/superpowers/STATUS.md`, `docs/superpowers/plans/2026-10-16-marketcore-release-1.md`,
`docs/adr/003-request-scoped-idempotency.md`, `docs/adr/README.md`.

**Steps:**

- [ ] Run the whole gate and record the numbers: `pnpm turbo run lint typecheck test build`, then
  `pnpm --filter api test:integration`, `pnpm --filter api test:e2e`,
  `pnpm --filter api test:concurrency`, `pnpm --filter worker test:integration`,
  `pnpm --filter web test`, `pnpm --filter @app/ui test`, `pnpm --filter e2e test:behavioural`.
- [ ] Prove the M2 row itself: `pnpm --filter api test:e2e` and the `idempotency` suite within it,
  with the 20-requests-one-key case named in the output.
- [ ] `README.md`: the guarantees table's idempotency row moves from *phase 5* to proven, with the
  count; the roadmap marks phase 5 done; the limitations list loses "no idempotency key".
- [ ] `docs/domain-model.md`: `IdempotencyKey` as built, including the deferred foreign key.
- [ ] `docs/failure-scenarios.md`: the retry and the duplicate-click rows name this plan's spec files.
- [ ] `docs/superpowers/plans/2026-10-16-marketcore-release-1.md`: T-070 done with its PR, M2 met
  with the date, and the T-002 row amended to record D91 as delivered.
- [ ] `docs/adr/003-…`: Status → **Accepted**, `Implements:` the PRs; `docs/adr/README.md` row 13 the
  same.
- [ ] `docs/superpowers/STATUS.md`: a Phase 5 entry in the phase-4 entry's style — what was built,
  the commands and their real output, what is proven, what is deferred, and any deviation.
- [ ] Commit the documents separately from the code.

---

## Decisions added by this plan

| D | Decision | Task |
|---|---|---|
| D94 | `POST /checkouts` requires `Idempotency-Key: 1–64 chars [A-Za-z0-9_-]`; missing or malformed is `400 VALIDATION_ERROR` before any lock, and writes no row. | 1, 5 |
| D95 | A key that produced a checkout replays it: the same key with a matching fingerprint answers `201` with **that checkout, re-read**, not a stored copy of the first response; a different fingerprint answers `409 CONFLICT` with `details.reason: KEY_REUSED`. | 1, 5 |
| D96 | The fingerprint is the canonical request — `{"lines":[…]}` with lines sorted by `productId` — so the same lines in another order replay rather than conflict, and it is stored verbatim. | 2 |
| D97 | The key is claimed as the first statement of the checkout transaction with `INSERT … ON CONFLICT DO NOTHING`; the unique index is the concurrency arbiter, so a duplicate blocks holding nothing and then replays. | 4, 5, 6 |
| D98 | A refusal releases the claim inside the same transaction; `checkoutId` is `NOT NULL` behind a `DEFERRABLE INITIALLY DEFERRED` foreign key, so a committed key must name a checkout that exists. | 3, 4, 5 |
| D99 | Keys are scoped to the buyer (`UNIQUE (buyerId, key)`), so two buyers may use one key string and neither can see the other's. | 3, 5 |
| D100 | The browser mints one key per placement attempt and reuses it across retries; the key is minted per mount of the review step, not derived from the cart. | 7, 8 |
| D101 | A signed-in visitor lands on `/browse`; the first-run screen is called **Start selling** and stops being the first thing a signed-in user sees (closes D91's deferral in T-002). | 9 |

## Plan findings — what the SRS or the code left open

1. **The SRS says "the original 201 response" and never says what a replay *is*.** Read literally it
   would mean storing a frozen body, which goes stale when the worker cancels the checkout.
   *Resolution:* D95 — the same checkout, re-read. Cost if the ruling is wrong: one client that
   asserted byte equality across a 30-minute retry would have to read the checkout instead; no client
   in the plan does.
2. **§6 names `IdempotencyKey (buyerId, key)` and says nothing about what the row holds.** The replay
   in SRS-FR-CHK-008 needs the checkout id and the body to compare. *Resolution:* D95/D96 — the
   fingerprint and the checkout id, and the checkout id is minted by the claim. Cost if wrong: one
   additive column.
3. **A refusal's effect on the key is unspecified.** Reading it as "the key is consumed" would make a
   corrected retry (`CART_CHANGED`, then a fixed cart, same key) answer `KEY_REUSED` for a different
   body, or replay nothing. *Resolution:* D98 — a refusal releases the claim. Cost if wrong: a client
   that expects a key to be spent by a refusal would have to change one header.
4. **PostgreSQL cannot defer a `CHECK`**, which the first draft of ADR 003 assumed. *Resolution:* the
   guarantee rides on a deferred `REFERENCES` constraint and a `NOT NULL` column, and the claim mints
   the checkout id. Cost if wrong: none identified — the FK is the stricter of the two.
5. **D91's landing change was deferred by T-002 to "the storefront phase", which is phase 4.** Phase 4
   shipped `/browse` and did not do it. *Resolution:* Task 9, bound to the landing and the first-run
   screen's name. Cost if wrong: one revert.

## Defects and wrong expectations recorded by this plan

| Where | What was wrong | What changed |
|---|---|---|
| — | none yet | — |
