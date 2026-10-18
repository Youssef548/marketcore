# MarketCore — Failure Scenarios

- **Date:** 2026-09-19
- **Status:** Accepted
- **Related:** `docs/architecture.md`, `docs/domain-model.md`, `docs/superpowers/specs/2026-10-16-marketcore-storefront-srs.md`

A failure scenario is only accepted into this table if it names the behaviour required, the test
that proves the behaviour, and the week that test lands. Anything with an empty "proven by" cell is a
hope.

## 1. Failure matrix

| Failure | Required behaviour | Proven by | Week |
|---|---|---|---|
| Client times out after checkout commit | Retry returns the original operation | Repeated-checkout idempotency test (INV-2, AC-US-CHK-003-1) — `apps/api/test/idempotency.e2e-spec.ts` (20 repeats, one key), `apps/api/test/concurrency/idempotency.concurrency-spec.ts` (100 reports arriving at once, 10 runs) | phase 5 |
| A buyer double-clicks "Place order" | One checkout, and both responses name it | Duplicate-click idempotency test (INV-2, D95) — `apps/api/test/idempotency.e2e-spec.ts`; the first claim is the transaction's step 0, so the loser blocks on the uncommitted unique index entry and then replays | phase 5 |
| The same key arrives with a different cart | `409 CONFLICT`, `details.reason: KEY_REUSED`; the first checkout untouched | Fingerprint mismatch test (SRS-FR-CHK-008, D96) — `apps/api/test/idempotency.e2e-spec.ts` | phase 5 |
| Payment provider times out | Job retries safely without duplicate capture | Deterministic timeout amount (`%100 == 17`) — `apps/api/test/integration/payment-capture.integration-spec.ts`, `apps/api/test/payments.e2e-spec.ts`: the charge is recorded, the caller is told `PAYMENT_PENDING`, and the retry settles on the charge rather than making a second | phase 6 |
| Webhook is duplicated | Duplicate is stored or ignored without repeated effects | Unique event constraint test (INV-4) | 5 |
| Webhook arrives out of order | State machine applies or ignores it safely | Ordered and reordered event tests | 5 |
| Worker crashes after provider success | Recovery reconciles the provider outcome and records it once | The provider's lookup answers what the key already did (D112) — `apps/api/test/integration/payment-capture.integration-spec.ts`: a `PROCESSING` row beside a recorded charge is refunded, never charged again | phase 6 |
| Redis is unavailable | Core database remains consistent and work is recoverable | Dependency outage test and runbook | 8 |
| Database deadlock occurs | Bounded retry handles retryable transaction failure | Forced lock-order test | 3 |
| Email sending fails | Payment and ledger remain successful | Notification retry test | 10 |
| Two payout workers race | One claim and one provider call | Concurrent worker integration test (INV-8) | 9 |
| One line of a multi-seller checkout is short of stock | No order, no stock change, every failing line reported | All-or-nothing checkout test (INV-11) — `apps/api/test/integration/checkout.integration-spec.ts` | phase 4 |
| A price changes after the buyer confirmed it | Checkout refused with `PRICE_CHANGED`; nothing committed | Confirmed-price mismatch test (SRS-FR-CHK-003) — `apps/api/test/checkout.e2e-spec.ts` | phase 4 |
| Overlapping carts lock the same rows in different orders | Rows lock in product-id order; no deadlock reaches the client | Overlapping-cart concurrency test (SRS-NFR-REL-002) — `apps/api/test/concurrency/overlapping-carts.concurrency-spec.ts` | phase 4 |
| Two auto-cancel runs see the same expired checkout | Cancelled once, stock restored once | Parallel worker-run test (INV-15) — `apps/worker/test/auto-cancel.integration-spec.ts` | phase 4 |
| The worker is down past the 30-minute window | Unpaid checkouts are cancelled on the next run; nothing is lost, only late | Worker-restart test — `apps/worker/test/auto-cancel.integration-spec.ts` | phase 4 |
| A payment captures after the checkout was auto-cancelled | No order becomes Paid; the capture is refunded in full | Capture-after-cancel test (SRS-FR-PAY-004) | phase 6 |
| Two sellers' refunds race against one payment | Cumulative refunds never exceed the capture | Multi-seller refund-cap test (INV-5) | phase 9 |

## 2. Flagship automated tests

These are the eight tests the plan nominates as the project's evidence, plus three the storefront
adds (CR-001). Five of them shape the architecture rather than merely verifying it, and are marked
accordingly.

| Test | Setup | Assertions | Week | Shapes design |
|---|---|---|---|---|
| Last item race | Stock 1, 100 concurrent checkout requests × 20 runs | One success, 99 conflicts, stock 0, one order — every run | 3 | **yes** — forces row lock inside a short transaction |
| Repeated checkout | Same request and key submitted 20 times | One order, one reservation, one payment intent | 5 | |
| Duplicate payment webhook | Same provider event delivered repeatedly | One state transition, one ledger transaction | 5 | |
| Ledger balance | Generate captures, refunds, and payouts | Every transaction sums to zero by currency | 8 | |
| Outbox crash recovery | Crash after commit, before publication acknowledgement | Event is published after recovery, effect occurs once | 8 | **yes** — forces claim leases |
| Tenant isolation | User from tenant A requests tenant B resource | Not found or forbidden, without data leakage | 2 | |
| Payout race | Two workers claim the same eligible payout | Provider transfer is initiated once | 9 | **yes** — forces a single atomic claim |
| Refund cap | Concurrent refunds exceed the captured amount | Only the valid cumulative amount succeeds | 9 | |
| All-or-nothing checkout | 3-seller cart, one line short | 0 orders, every stock unchanged, every failing line reported | phase 4 | **yes** — forces one transaction across sellers (`apps/api/test/integration/checkout.integration-spec.ts`) |
| Cross-buyer isolation | Buyer X requests buyer Y's cart, checkout, order | 404, never data; X reads X's own | phase 4 | (`apps/api/test/cart.e2e-spec.ts`, `apps/api/test/buyer-orders.e2e-spec.ts`) |
| Abandoned checkout | Two worker runs over expired unpaid checkouts | Each cancelled once; stock restored once | phase 4 | **yes** — forces the conditional update (`apps/worker/test/auto-cancel.integration-spec.ts`) |

## 3. How the two views relate

The failure matrix and the flagship-test list answer different questions, and merging them would
lose information. **Six of the eleven flagship tests are failure scenarios; five are correctness
claims that no failure produces.** Saying so is more useful than pretending every test belongs in
the matrix.

| Flagship test | Failure scenario? | Failure row it proves |
|---|---|---|
| Last item race | No — concurrency correctness under contention | — |
| Repeated checkout | Yes | Client times out after checkout commit |
| Duplicate payment webhook | Yes | Webhook is duplicated |
| Ledger balance | No — invariant check over generated history | — |
| Outbox crash recovery | Yes | Worker crashes after provider success |
| Tenant isolation | No — authorization correctness | — |
| Payout race | Yes | Two payout workers race |
| Refund cap | No — invariant check under concurrency | — |
| All-or-nothing checkout | Yes | One line of a multi-seller checkout is short of stock |
| Cross-buyer isolation | No — authorization correctness | — |
| Abandoned checkout | Yes | Two auto-cancel runs see the same expired checkout |

Conversely, five failure rows are proven by tests that are not flagship tests, because they verify
degradation behaviour rather than a headline claim: provider timeout, out-of-order webhook, Redis
unavailability, database deadlock, and notification failure.

## 4. Coverage rules

- **Every test runs against real PostgreSQL.** A concurrency test that mocks the database proves
  nothing about locking, and a mocked constraint cannot demonstrate a unique violation. The plan
  lists "tests mock the database or queue for concurrency behaviour" as a warning sign under False
  Correctness, and this document is where that is enforced.
- **Every test is runnable by a reviewer.** Each ships with a documented command in the README's
  flagship-scenarios section, and the real output is committed as evidence. A test that only the
  author can run is not evidence.
- **Repeatedly, not once.** The last-item race must pass across repeated runs, because a race that
  passes once may simply not have interleaved. The README states the repetition count actually used.
- **No scenario is claimed before its week.** `docs/superpowers/STATUS.md` distinguishes proven,
  planned, and excluded, and the README roadmap mirrors it.
