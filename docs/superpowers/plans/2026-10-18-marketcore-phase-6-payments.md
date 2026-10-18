# MarketCore Phase 6 — the first payment: one charge, captured once — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. `superpowers:test-driven-development` applies to every task
> that writes code.

**Goal:** Deliver Release 1's phase-6 slice — T-080 and T-082. A buyer pays a checkout once: the
charge goes through the deterministic simulator, capture moves the checkout and **every** one of its
orders to `PAID` in a single transaction, a declined charge leaves the checkout payable and says why,
`POST /checkouts/:id/pay` twice charges once and answers the same thing both times, and a charge that
lands on a checkout the auto-cancel worker has already cancelled is refunded in full by the system
without ever marking an order paid (SRS-FR-PAY-001, -003, -004; INV-3, INV-15). The review screen
grows the payment step (T-082).

**Out of scope, deliberately:** the ledger posting of the split is **T-081, which the release plan
binds to phase 8** (`depends: T-080, phase 8 ledger`), so SRS-FR-PAY-002's split and the `M3` gate's
"ledger split sums to zero" clause land there. Phase 6 charges the checkout total and records the
charge; it does not yet divide it. `docs/superpowers/STATUS.md` records this as a deferral, and the
`M3` row stays open until phase 8 closes it.

**Architecture:** a provider **port** with a deterministic simulator behind it (ADR 004), and a
capture that is three steps rather than one transaction, because a network call must not be held
inside a database transaction:

```
tx A  ── insert/claim the payment row (PROCESSING), lock the checkout, read its status
      │   if CANCELLED → nothing to charge: record REFUNDED and stop
      └─ commit        (short: no network call while a lock is held)

provider.capture({ operationKey: pay_<checkoutId>, amountMinor, currency })
                      (outside any transaction; typed TIMEOUT, not a thrown error)

tx B  ── lock the checkout again and re-read its status
      │   SUCCEEDED → payment SUCCEEDED + checkout PAID + every order PAID  (one transaction)
      │   CANCELLED → payment REFUNDED, no order PAID                        (SRS-FR-PAY-004)
      └─ commit
```

The operation key is **derived from the checkout**, never minted per attempt, so a retry in another
process presents the same provider operation — the opposite of ADR 003's client-minted key, and for
the reason that makes the difference: a client owns its retries, a server cannot remember across a
crash.

## Decisions this plan makes (D102–D110)

| D | Decision |
|---|---|
| D102 | `PaymentStatuses` is `PROCESSING \| SUCCEEDED \| FAILED \| REFUNDED`, and `PARTIALLY_REFUNDED` arrives with phase 9's per-order refunds. The domain model's `Pending → Processing` collapses: the row is created **by** the attempt, so nothing can observe a payment between created and attempted. |
| D103 | Capture is **claim (tx A) → charge → commit (tx B)**, never one transaction around a network call. A crash between the two leaves a `PROCESSING` row that the next attempt resolves, which is the state the domain model already specified. |
| D104 | The provider operation key is `pay_<checkoutId>` — derived, not minted (ADR 004). |
| D105 | `POST /checkouts/:id/pay` answers with the **checkout**, so a client reads one shape; a repeat on a `SUCCEEDED` payment charges nothing and answers the same checkout. Not the buyer's checkout → `404` (INV-12's existing control). |
| D106 | A decline is `409 CONFLICT` with `details.reason: PAYMENT_DECLINED`, the payment goes `FAILED`, the checkout stays `PENDING_PAYMENT`, and the buyer may try again — **the same payment row**, because one checkout has one payment, with `attempts` counting the provider calls. |
| D107 | A charge that lands on a `CANCELLED` checkout is `REFUNDED` with `refundedReason: CHECKOUT_CANCELLED`, no order becomes `PAID` (SRS-FR-PAY-004). If the checkout is already cancelled **before** tx A, the provider is never called and the answer is `409 CONFLICT` `details.reason: CHECKOUT_CANCELLED`: there is nothing to refund, and inventing a charge to refund would be a worse lie than a refusal. |
| D108 | The review screen places, then pays: two calls, in that order, and a decline returns the buyer to the review step with the reason. The steps are separate because the API's are — a combined endpoint would hide which of the two failed. |
| D109 | Phase 6 charges the checkout **total**; the fee and the seller shares are computed in phase 8 with the ledger (T-081). No percentage is introduced anywhere in phase 6, so nothing has to be unlearned. |
| D110 | The simulator's own store (`provider_charges`, keyed by operation key) is a real table written **before** the verdict is returned, so "the provider charged and the response was lost" is representable and the retry path is testable rather than mocked. |

## Tasks

### Task 1: Contracts and domain — the payment's wire shape and the simulator's rule (T-080)

**Goal:** the statuses, the refusal, and the pure verdict, before anything can write a payment.

**Files:**
- `packages/contracts/src/constants.ts` (`CheckoutStatuses` and `OrderStatuses` gain `PAID`;
  `PaymentStatuses`, `PAYMENT_DECLINED`, `CHECKOUT_CANCELLED`)
- `packages/contracts/src/payment.ts` (new: `PaymentSchema`, `PaymentDeclinedDetailsSchema`,
  `CheckoutCancelledDetailsSchema`; `CheckoutConflictDetailsSchema` union grows both)
- `packages/contracts/src/index.ts`
- `packages/domain/src/payments.ts` (new: `providerOperationKey(checkoutId)`,
  `simulatorVerdict(operationKey, amountMinor)`, `SIMULATOR_DECLINED_MODULUS`,
  `SIMULATOR_TIMEOUT_MODULUS`)
- `packages/domain/test/payments.spec.ts` (+ a property test for the verdict's totality)

**Interfaces:**

```ts
// packages/domain/src/payments.ts
export const SIMULATOR_DECLINED_MODULUS = 13;
export const SIMULATOR_TIMEOUT_MODULUS = 17;

/** ADR 004: derived from the checkout so a retry in any process is the same provider operation. */
export function providerOperationKey(checkoutId: string): string;

/** Pure: the amount decides the verdict, so a test chooses a path by choosing a price. */
export type SimulatorVerdict = 'CAPTURED' | 'DECLINED' | 'TIMEOUT';
export function simulatorVerdict(operationKey: string, amountMinor: number): SimulatorVerdict;

/** Deterministic and stable: phase 8 posts the ledger against it. */
export function simulatedProviderRef(operationKey: string): string;
```

**Steps:**
- [ ] Failing tests: the verdict is total over every amount and stable across calls; `13` declines,
      `17` times out, `100` captures; `providerOperationKey('c1')` is stable and does not contain the
      amount; the statuses are exhaustive; the two new details members parse and reject an unknown
      `reason` (`.strict()`).
- [ ] Run `pnpm --filter @app/domain test` and `pnpm --filter @app/contracts test`; watch them fail.
- [ ] Implement; green; `typecheck` and `lint` for both packages.
- [ ] Commit: `feat(contracts,domain): the payment's statuses, its refusal, and a pure simulator verdict (T-080)`

### Task 2: The database — one payment per checkout (T-080)

**Goal:** the constraints that make a second capture impossible, in the database rather than the code.

**Files:**
- `packages/database/prisma/schema/Payment.prisma` (new) and `ProviderCharge.prisma` (new)
- `packages/database/prisma/schema/Checkout.prisma` (`payment Payment?`)
- `packages/database/prisma/migrations/<ts>_add_payments/migration.sql`
- `apps/api/test/integration/payments.integration-spec.ts` (new)

**Interfaces:**

```prisma
model Payment {
  id             String   @id @default(uuid())
  checkoutId     String   @unique            // one payment per checkout (INV-3)
  status         String
  amountMinor    Int
  currency       String
  attempts       Int      @default(0)
  providerRef    String?  @unique            // phase 8's ledger reference
  refundedReason String?
  capturedAt     DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  checkout       Checkout @relation(fields: [checkoutId], references: [id])
  @@map("payments")
}
```

**Steps:**
- [ ] Write the failing integration spec first, writing **around** the application: a second payment
      for one checkout is refused; two `providerRef`s cannot be the same; `amountMinor <= 0` is
      refused; a `provider_charges` row is unique per `operationKey`.
- [ ] `prisma migrate dev --create-only`, read the SQL, add what Prisma cannot express, apply.
- [ ] Prove the constraints exist by asking the catalogue (`pg_indexes` / `pg_constraint`), not by
      reading the migration.
- [ ] Green on `pnpm --filter api test:integration`.
- [ ] Commit: `feat(database): one payment per checkout, one charge per provider operation (T-080)`

### Task 3: The provider port and the simulator (T-080)

**Goal:** the port phase 7 swaps, and the adapter that makes every verdict reachable.

**Files:**
- `apps/api/src/payments/interfaces/payment-provider.interface.ts` (new)
- `apps/api/src/payments/repositories/provider-charge.repository.ts` (new)
- `apps/api/src/payments/simulator-payment.provider.ts` (new — `@Injectable()`)
- `apps/api/src/payments/simulator-payment.provider.spec.ts` (new, unit: the adapter's decisions)
- `apps/api/test/integration/provider-charge.integration-spec.ts` (new)

**Interfaces:**

```ts
export const PaymentProviderRefusals = { DECLINED: 'DECLINED', TIMEOUT: 'TIMEOUT' } as const;

export interface PaymentProvider {
  capture(request: {
    operationKey: string;
    amountMinor: number;
    currency: CurrencyCode;
  }): Promise<SimulatorVerdict>;
}
```

**Steps:**
- [ ] Failing tests: a captured amount returns `CAPTURED` and records one `provider_charges` row; a
      second call with the same key returns the **recorded** verdict and does not write a second row
      (the lost-response rule); `13` returns `DECLINED`, `17` charges-then-returns `TIMEOUT` and the
      retry finds the charge; the `providerRef` is stable per key.
- [ ] Implement; green; lint and typecheck.
- [ ] Commit: `feat(api): the payment provider port and its deterministic simulator (T-080)`

### Task 4: Capture — claim, charge, commit (T-080)

**Goal:** the three steps of the architecture, with the checkout locked in both transactions and never
across the network call.

**Files:**
- `apps/api/src/payments/payment.repository.ts` (new: `claim`, `settle`, `fail`, `refund`)
- `apps/api/src/payments/payment.service.ts` (new: `pay(buyer, checkoutId, requestId)`)
- `apps/api/src/payments/payments.constants.ts` (new)
- `apps/api/src/payments/interfaces/payment.interface.ts` (new)
- `apps/api/src/payments/payment.service.spec.ts` (new)
- `apps/api/test/integration/payment-capture.integration-spec.ts` (new)

**Interfaces:**

```ts
export const PayCheckoutOutcomes = {
  PAID: 'PAID',
  ALREADY_PAID: 'ALREADY_PAID',
  DECLINED: 'DECLINED',
  CANCELLED: 'CANCELLED',
} as const;

// PaymentRepository.claim(tx, checkoutId, amountMinor, currency): a row in PROCESSING, attempts + 1
//   -- or the existing row, when there is one. The unique (checkoutId) is the arbiter, as in ADR 003.
// PaymentRepository.settle(tx, paymentId, providerRef): SUCCEEDED + capturedAt
//                     + the checkout PAID + every order of it PAID, in this transaction
// PaymentRepository.fail(tx, paymentId): FAILED
// PaymentRepository.refund(tx, paymentId, reason): REFUNDED + refundedReason
```

**Steps:**
- [ ] Failing integration tests, in the order the claims matter:
      a paid checkout has every order `PAID` and a `SUCCEEDED` payment whose `amountMinor` is the
      checkout total (SRS-FR-PAY-001, -003); a declined attempt leaves the checkout `PENDING_PAYMENT`
      and writes `FAILED` with `attempts: 1`, and a second attempt reuses **that row**; a checkout
      cancelled **during** the charge (the test cancels it between the two steps) is `REFUNDED` with
      no order `PAID` (SRS-FR-PAY-004); a checkout already cancelled before the charge never reaches
      the provider (assert the `provider_charges` table is empty).
- [ ] Unit tests for the service's outcome mapping, including that a repeat on `SUCCEEDED` answers
      `ALREADY_PAID` without calling the provider.
- [ ] Implement; green on `pnpm --filter api exec jest` and `pnpm --filter api test:integration`.
- [ ] Commit: `feat(api): capture a checkout once — claim, charge, commit (T-080)`

### Task 5: The route (T-080)

**Files:**
- `apps/api/src/payments/payments.controller.ts` (new: `POST /checkouts/:id/pay`)
- `apps/api/src/payments/payments.module.ts` (new) and `apps/api/src/app.module.ts`
- `apps/api/test/payments.e2e-spec.ts` (new)

**Steps:**
- [ ] Failing e2e: paying a checkout answers `200` with the checkout `PAID` and every order `PAID`;
      the same request again is `200` with the same body and **no second charge** (`provider_charges`
      has one row); a declined amount is `409 CONFLICT` with `details.reason: PAYMENT_DECLINED` and
      the checkout is still `PENDING_PAYMENT`; another buyer's checkout is `404`; anonymous is `401`.
- [ ] Implement; green; lint and typecheck.
- [ ] Commit: `feat(api): POST /checkouts/:id/pay (T-080)`

### Task 6: The two that arrive together (T-080)

**Goal:** INV-3 under concurrency, and the race with the worker that cancels.

**Files:**
- `apps/api/test/concurrency/payment.concurrency-spec.ts` (new)

**Steps:**
- [ ] 50 concurrent `pay` requests on one checkout: **all** answer `200` with the same checkout, and
      `provider_charges` holds exactly **one** row (the derived operation key is what makes that
      true); 10 runs with fresh rows.
- [ ] A cancellation racing the charge: the checkout is cancelled while a `17`-amount charge is in
      flight, and the outcome is exactly one of the two legal ones — `PAID` with no refund, or
      `REFUNDED` with no `PAID` order — never both and never neither.
- [ ] Green on `pnpm --filter api test:concurrency`.
- [ ] Commit: `test(api): one charge when fifty requests pay at once, and when a cancel lands mid-flight (T-080)`

### Task 7: The web payment step (T-082)

**Files:**
- `apps/web/src/lib/storefront/client.ts` (+`client.test.ts`), `apps/web/src/app/api/checkouts/[id]/pay/route.ts` (new route or an extension of the existing BFF)
- `apps/web/src/app/(shop)/checkout/page.tsx`, `review-view.tsx` (+ tests)
- `apps/web/src/lib/storefront/paid.ts` (new: the placed screen's copy for a paid checkout)

**Steps:**
- [ ] Failing tests: the review step places and then pays; a decline shows the reason and stays on the
      review step; a successful payment navigates to the placed screen, which says the checkout is
      paid and does not say "Pending payment" any more.
- [ ] Implement; green on `pnpm --filter web test`; lint and typecheck.
- [ ] Commit: `feat(web): the payment step on the review screen (T-082)`

### Task 8: The payment a browser makes (T-082)

**Files:** change `apps/e2e/tests/storefront.spec.ts`.

**Steps:**
- [ ] A journey that buys from two sellers, pays, and sees both orders `Paid`; and a decline journey
      (a price ending in 13) that stays on the review step with the reason and leaves the checkout
      payable.
- [ ] Red, then green on `pnpm --filter e2e test:behavioural` against the compose stack.
- [ ] Commit: `test(e2e): pay a checkout in a real browser, and be refused a declined one (T-082)`

### Task 9: The gate, the documents and STATUS

**Files:** `README.md`, `docs/domain-model.md`, `docs/failure-scenarios.md`,
`docs/superpowers/plans/2026-10-16-marketcore-release-1.md`, `docs/adr/014-one-charge-per-checkout-split-by-the-ledger.md`
(note, not yet Accepted), `docs/superpowers/STATUS.md`.

**Steps:**
- [ ] Run and record: `pnpm turbo run lint typecheck test build`, then the api/worker/web/ui/behavioural
      suites individually, and the whole compose stack torn down afterwards.
- [ ] `README.md`: the guarantees table gains "a checkout is charged at most once" as **proven, phase 6**
      with its observable; the scenario table gains the decline and the cancel-race rows; the roadmap
      moves phase 6 to Done; the limitation "orders sit in Pending payment and go no further" changes
      to what is now true (a payment is captured; **the money is not yet split — T-081, phase 8**).
- [ ] `docs/domain-model.md`: `Payment` and the other `PROCESSING` rule as built (D102), and the
      `provider_charges` row.
- [ ] `docs/failure-scenarios.md`: "Payment provider times out" and "Worker crashes after provider
      success" name this phase's specs.
- [ ] `docs/superpowers/plans/2026-10-16-marketcore-release-1.md`: T-080 and T-082 done with their
      PRs; M3 stays open with the reason (T-081 belongs to phase 8) recorded next to it.
- [ ] `docs/superpowers/STATUS.md`: a Phase 6 entry in the phase-5 entry's style.
- [ ] Commit the documents separately from the code.

---

## Plan findings — what the SRS or the code left open

1. **SRS-FR-PAY-003 says capture moves the checkout and its orders to `PAID` "in the same transaction
   as the ledger write", but the ledger is phase 8.** Read literally, phase 6 cannot satisfy it.
   *Resolution:* D103 — phase 6 makes the checkout-and-orders transition one transaction of its own,
   and phase 8 adds the ledger write to that same transaction. Cost if wrong: phase 8 edits one
   function rather than adding one.
2. **The SRS names a `PaymentProvider` and never says what it returns.** *Resolution:* ADR 004 — a
   typed verdict (`CAPTURED | DECLINED | TIMEOUT`) rather than a thrown error, because the caller must
   record all three. Cost if wrong: one adapter to rewrite, which is what phase 7 does anyway.
3. **`Payment`'s designed machine is `Pending → Processing → Succeeded`, but nothing can observe a
   payment between "created" and "attempted"** — the row is created by the attempt.
   *Resolution:* D102 collapses the two into `PROCESSING`. Cost if wrong: a state to add back, and no
   client can tell the difference today.
4. **A decline's status code is unspecified.** *Resolution:* D106 — `409 CONFLICT` with
   `details.reason: PAYMENT_DECLINED`, consistent with every other refusal in this API, rather than the
   semantically tidy `402` that would be the first status without a code of its own. Cost if wrong: a
   client that wanted to branch on the status reads `details.reason` instead.
5. **SRS-FR-PAY-004 does not say what happens when the checkout is already cancelled *before* the
   charge.** Refunding a charge that was never made is not representable. *Resolution:* D107 — the
   provider is never called and the answer is `409` `details.reason: CHECKOUT_CANCELLED`. Cost if
   wrong: one branch.
6. **T-082 depends on T-042, which phase 4's plan does not list under that name.** The review screen
   phase 4 shipped is where the payment step goes; the plan treats the dependency as satisfied.
   Cost if wrong: none identified — the screen exists.

## Defects and wrong expectations recorded by this plan

| Where | What was wrong | What changed |
|---|---|---|
| — | none yet | — |
