# 004 Use a deterministic payment simulator behind a provider port

- **Date:** 2026-10-18
- **Status:** Accepted
- **Phase:** 6 — gates the first payment
- **Implements:** `docs/superpowers/plans/2026-10-18-marketcore-phase-6-payments.md` — SRS §3.5,
  US-PAY-001, INV-3, INV-15

## Context

Phase 6 charges a checkout. Real money movement is out of scope for this project, so the provider is
a contract — `PaymentProvider` in SRS §5's context diagram — with a simulator behind it, and phase 7
puts Stripe test mode behind the same contract.

Three requirements shape it, and none of them is about the provider being nice:

- **SRS-FR-PAY-001:** one payment per checkout, unique, for the checkout total (INV-3).
- **SRS-FR-PAY-003:** capture moves the checkout *and every one of its orders* to `PAID` in one
  transaction with the ledger write.
- **SRS-FR-PAY-004:** a capture for a `CANCELLED` checkout is refunded in full by the system and never
  marks an order `PAID`.

The hard part is not the happy path. It is that the API calls a remote system and then commits, and
anything can happen in between: the provider can decline, time out, capture and lose the response, or
capture twice. A test double that only takes the happy path would leave all four of those unproven,
and a mock per test would prove the mock.

## Decision

**One port, one simulator whose verdict is a pure function of an operation key derived from the
checkout, and an "at most once" guarantee that does not depend on the provider behaving.**

1. **The port is `PaymentProvider`**, with one method:

   ```ts
   capture(request: { operationKey: string; amountMinor: number; currency: CurrencyCode }): Promise<ProviderCapture>
   // ProviderCapture = { providerRef: string; capturedAt: Date }
   // refusals are typed results, not exceptions: { kind: 'DECLINED' } | { kind: 'TIMEOUT' }
   ```

   A typed `TIMEOUT` rather than a thrown error, because a timeout is an outcome the caller must
   handle and record, not an accident of transport.

2. **The operation key is derived from the checkout, not minted per attempt:** `pay_<checkoutId>`.
   This is the deliberate opposite of ADR 003's client key. A client mints its own key because only the
   client knows that two clicks are one intention; the *server* mints this one because a retry after a
   crash — in a different process, with nothing in memory — must arrive at the same provider operation.
   Deriving it from the checkout makes that true by construction.

3. **The simulator's verdict is a pure function of `(operationKey, amountMinor)`**, documented in
   `packages/domain` and applied to minor units:

   | Condition on the amount | Verdict |
   |---|---|
   | `amountMinor % 100 === 13` | `DECLINED` |
   | `amountMinor % 100 === 17` | `TIMEOUT` |
   | anything else | captured, with a `providerRef` derived from the key |

   Tests choose a path by choosing a price, so no test can pass by accident of a mock's configuration,
   and the same input always produces the same verdict in any process, in any order.

4. **The simulator commits its record before it answers.** Its store (`provider_charges`, keyed by
   `operationKey`) records the verdict and the `providerRef` first, so "the provider charged and the
   response was lost" is representable: attempt 1 records a charge and returns `TIMEOUT`, attempt 2 with
   the same key finds the record and returns it. That is what a real provider's idempotency does, and it
   is the only way the retry path can be tested rather than assumed.

5. **"At most once" is enforced here, not there.** `payments.checkoutId` is unique and capture marks the
   checkout and its orders `PAID` in the same transaction. A provider that captured twice would still
   produce one payment, one transition and one `PAID` — the invariant is ours, and the simulator is a
   convenience for testing, not the thing that keeps INV-3.

6. **Capture is three steps, and the provider call is never inside a transaction.** Claim: lock the
   checkout, read its status, and insert the payment row as `PROCESSING` (tx A). Charge: call the
   provider with the derived key, outside any transaction. Settle: re-lock the checkout, re-read its
   status, and move the payment, the checkout and every order in one transaction (tx B).

   A network call inside a transaction holds a row lock for as long as the provider takes, and a crash
   between the two steps leaves a `PROCESSING` row — which is the honest record of "we do not know yet
   whether the charge happened", and the state the domain model already specified. `PaymentStatuses` is
   therefore `PROCESSING | SUCCEEDED | FAILED | REFUNDED`: the row is created *by* the attempt, so
   nothing can observe a payment between "created" and "attempted", and `PARTIALLY_REFUNDED` arrives
   with phase 9's per-order refunds.

7. **A decline is `409 CONFLICT` with `details.reason: 'PAYMENT_DECLINED'`** — the same typed-refusal
   shape every other refusal in this API uses, so `ErrorCodes` stays the closed set it is and no client
   learns a second way to read a refusal.

8. **A capture that finds the checkout `CANCELLED` refunds in full by the system** (SRS-FR-PAY-004):
   the payment is recorded `REFUNDED` with `refundedReason: 'CHECKOUT_CANCELLED'`, no order becomes
   `PAID`, and nothing is owed back to the buyer because the money never left. The `Refund` entity and
   buyer-initiated refunds are phase 9; this is the system's own reversal, and it is why the payment
   status set includes `REFUNDED` before any refund endpoint exists.

## Alternatives considered

- **Stripe test mode now.** Rejected: it puts a network dependency and an account into the loop for a
  phase whose claim is about *our* transaction boundaries. Phase 7 does it behind this port, where a
  difference in behaviour is a difference in one adapter.
- **A mock per test (`jest.mock` on the provider).** Rejected: it proves the mock. It also cannot
  produce "the provider captured and the response was lost", because the mock's return value is chosen
  by the test rather than by the amount.
- **`402 PAYMENT_REQUIRED` for a decline.** Rejected for consistency: every refusal in this API is a
  typed 409 or 400 that a client branches on by `code` and `details.reason`, and `_402` would be the
  first status with no code of its own. Cost if wrong: a client that treats "declined" as a
  payment-specific condition would have to read `details.reason` where it could have read a status.
- **Minting the provider operation key per attempt, like ADR 003's client key.** Rejected: a retry
  after a crash would then present a *new* key and the provider would charge again. The client key can
  be arbitrary because a client owns its retries; the server's cannot, because the server cannot
  remember across a crash.
- **Deriving the verdict from the operation key alone (no amount).** Rejected: tests would have to
  construct a checkout id whose hash lands on the wanted verdict, which is a test-shaped decision
  leaking into data.

## Trade-offs

- The simulator is in the API's own database, so "the provider" is not a separate failure domain. The
  boundary that matters — the port, the operation key and the transaction that commits around it — is
  the real one, and phase 7 changes only the adapter.
- A pure verdict means a declined amount declines forever. That is a feature of the simulator, not a
  claim about providers: the retry paths that a provider *does* resolve are covered by the
  record-before-answering rule, not by randomness.

## Consequences

- `payments` gains `checkoutId` (unique), `status`, `amountMinor`, `currency`, `providerRef` (unique),
  `attempts`, and the refund fields. The unique keys, not the code path, are what make a second capture
  impossible.
- The checkout's `PAID` transition and its orders' are one statement each, inside the transaction that
  also writes the payment — so a checkout cannot be paid with an unpaid order or the reverse (INV-13).
- Phase 7 implements the same port against Stripe test mode, with no change above it.
- Phase 8's ledger posting uses `payment.providerRef` as its business reference, which is why the
  simulator must produce a stable one per operation key rather than a fresh id per call.

## Review date

At phase 7, when a real provider's behaviour can falsify the port's shape — or 2027-01-18. The trigger
is a provider whose timeout semantics differ from "the same key answers the same thing".
