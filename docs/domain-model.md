# MarketCore — Domain Model

- **Date:** 2026-09-19
- **Status:** Accepted
- **Related:** `docs/architecture.md`, `docs/failure-scenarios.md`

This document is the source for two things: the invariants that later weeks write tests against, and
the entity table that later weeks transcribe into `packages/database/prisma/schema/*.prisma`. Nothing
here is invented at implementation time.

## 1. Invariants

Each invariant is stated with the observable that proves it. An invariant that cannot fill the third
column is a slogan, not an invariant, and does not belong in this table.

| ID | Invariant | How it is observed |
|---|---|---|
| INV-1 | Inventory available quantity may never become negative | After any concurrent run, `SELECT available FROM inventory WHERE product_id = :id` is >= 0 |
| INV-2 | A checkout idempotency key may create at most one logical operation | N requests sharing one key produce exactly one order row |
| INV-3 | An order may be paid at most once for the same captured amount | Count of successful captures for one order is exactly 1 |
| INV-4 | A provider webhook may cause each business side effect at most once | Repeated delivery of one event produces one state transition and one ledger transaction |
| INV-5 | A refund total may never exceed the successfully captured payment total | `SUM(refund.amountMinor) <= payment.amountMinor` for the payment |
| INV-6 | Every ledger transaction's signed entries sum to zero per currency | Grouped by transaction, the signed sum is 0 within each currency |
| INV-7 | Historical financial entries are never edited or deleted | No update or delete path on `LedgerEntry` exists in the codebase |
| INV-8 | A seller payout may be executed at most once | Under concurrent claims, exactly one provider transfer is initiated per payout |
| INV-9 | A user may not access a private resource owned by another organization | Cross-tenant fetch by identifier returns 404 or 403 and never returns data |
| INV-10 | A committed domain event must remain recoverable after a process crash | Killed between commit and publication, the event is still processed exactly once after recovery |

**Not testable as stated, and deliberately replaced.** "Money must be correct" and "the system must
be reliable" appear in no table because neither names an observable. They are covered by INV-1
through INV-10.

## 2. Entities

Amounts use integer minor units (see §3). Every money-bearing aggregate carries its own currency.
`phase` is when the model is created; nothing is created before the phase that uses it.

| Entity | Essential fields | Key constraints | Phase |
|---|---|---|---|
| User | id, email, passwordHash, status, createdAt | Unique normalized email | 1 * |
| Organization | id, name, slug, status, createdAt | Unique slug | 2 |
| OrganizationMember | organizationId, userId, role | Unique (organizationId, userId) | 2 |
| Session | id, userId, expiresAt, revokedAt, revokedReason | One per login; revocation is explicit and recorded with a reason | 2 *|
| RefreshToken | sessionId, tokenHash, expiresAt, usedAt | Unique tokenHash; rotated on every use | 2 *|
| Product | id, organizationId, name, priceMinor, currency, status | Tenant-scoped product access | 3 |
| Inventory | productId, available, reserved, version | Non-negative quantities; unique productId | 3 |
| Order | id, organizationId, buyerId, status, totalMinor, currency | Totals immutable after creation | 4 |
| OrderItem | orderId, productId, quantity, unitPriceMinor | Positive quantity; snapshotted price | 4 |
| IdempotencyKey | organizationId, key, requestHash, status, response | Unique (organizationId, key) | 5 |
| Payment | id, orderId, status, amountMinor, currency, providerRef | One logical capture per payment | 6 |
| PaymentAttempt | paymentId, attempt, status, request, response | Unique provider operation key | 6 |
| WebhookEvent | provider, eventId, type, payload, status | Unique (provider, eventId) | 6 |
| LedgerAccount | id, organizationId, type, currency, ownerRef | Unique account identity and currency | 8 |
| LedgerTransaction | id, type, referenceType, referenceId, occurredAt | Unique business reference where required | 8 |
| LedgerEntry | transactionId, accountId, signedAmountMinor | Append-only | 8 |
| Refund | paymentId, status, amountMinor, providerRef | Cumulative amount cannot exceed capture | 9 |
| OutboxEvent | aggregateType, aggregateId, type, payload, status | Claim and retry metadata | 10 |
| Payout | organizationId, status, amountMinor, currency, providerRef | Idempotent payout operation | 11 |
| AuditLog | actor, organization, action, resource, before, after, requestId | Immutable chronological record | 12 |

**Ownership note.** `LedgerEntry` has no `updatedAt` and no soft-delete column. That is not an
omission: INV-7 is enforced by the schema offering no way to violate it, which is stronger than a
convention.

**`*` — Session and RefreshToken were added during phase 2, not before it.** This table originally
omitted them, which meant `docs/architecture.md`'s phase-2 scope ("refresh" and "revoke") had no
server-side state to stand on. They are recorded here rather than left as an implementation detail,
because the refresh decision table in `packages/domain` is written against both and the invariants
below depend on them existing.

**Where the business rules are enforced, and where they are not.** The database enforces the unique
keys and the `inventory_quantities_non_negative` CHECK, and a test proves each by writing around the
application rather than through it. It does **not** enforce "an organization retains at least one
owner": that is a count over sibling rows, which no `CHECK` can express, so it is a transactional rule
with its own test and is labelled a rule here so the design does not imply a stronger guarantee than
exists.

**`*` — why `User` exists in phase 1.** It was pulled forward from phase 2, and not as scaffolding:
the readiness probe needs a query to round-trip, and a query through Prisma's builder needs a
delegate to hang off. `$connect()` was measured and is not a probe — it reported healthy for 18
seconds against a stopped database. `User` is therefore exercised by the migration, the seed, the
readiness check and CI on the day it lands. The full measurement is in
`docs/superpowers/STATUS.md`.

## 3. Money

1. Store money as integer minor units, such as cents. **Never binary floating point.**
2. Store currency on every money-bearing aggregate, and prevent cross-currency balancing.
3. Snapshot unit price and tax or fee inputs on the order item at purchase time.
4. Use database transactions to write business state and ledger state atomically where required.
5. Calculate displayed balances from entries, or from a verified projection that can be rebuilt.

**Storage widths.** Order-scoped amounts (`Order.totalMinor`, `OrderItem.unitPriceMinor`,
`Payment.amountMinor`, `Refund.amountMinor`, `Payout.amountMinor`) use `Int`: they are bounded by a
single order and comfortably inside 32 bits.

`LedgerEntry.signedAmountMinor` uses `BigInt`. Ledger entries are append-only and an account balance
is a summation over them, so the 32-bit ceiling (~$21.4M) is a real limit over the life of an
account. `BigInt` maps to a JavaScript `bigint`, which `JSON.stringify` throws on — so
`@app/contracts` owns a bigint codec (wire representation: string) used by every ledger schema. That
codec is a required Phase 8 deliverable, not an optional refinement.

## 4. Double-entry ledger

Every financial event creates a ledger transaction with two or more entries. Signed amounts within a
transaction must sum to zero for each currency. Account naming makes the economic meaning explicit.

| Event | Debit | Credit | Required check |
|---|---|---|---|
| Payment captured for 100 with 10 fee | Platform cash 100 | Seller payable 90, platform revenue 10 | Entries sum to zero |
| Full refund of 100 | Seller payable 90, platform revenue 10 | Platform cash 100 | Total refunds do not exceed capture |
| Seller payout of 90 | Seller payable 90 | Platform cash 90 | Payout is eligible and unique |

A refund and a payout create new reversing or settlement transactions. They never edit the original
capture. Corrections use compensating entries — INV-7.

## 5. State machines

Represent orders, payments, refunds, and payouts with explicit states and guarded transitions.
Reject illegal transitions at the domain boundary and test the transition matrix. A boolean such as
`paid` cannot express processing, failure, partial refund, or recovery.

### Product

| Legal | Illegal |
|---|---|
| DRAFT → PUBLISHED (`publish`), and only when `priceMinor >= 1` | PUBLISHED → PUBLISHED |
| PUBLISHED → DRAFT (`unpublish`) | DRAFT → DRAFT |

`ARCHIVED` was considered for this table and deliberately not added: no phase-3 operation can reach
it, and a state no endpoint can enter is scaffolding. It arrives with the operation that needs it.

### Order

| Legal | Illegal |
|---|---|
| Pending payment → Paid | Completed → Pending payment |
| Paid → Fulfilling | Cancelled → Paid |
| Fulfilling → Completed | |

### Payment

| Legal | Illegal |
|---|---|
| Pending → Processing | Failed → Succeeded without a new attempt |
| Processing → Succeeded | Refunded → Processing |
| Succeeded → Partially refunded | |

### Refund

| Legal | Illegal |
|---|---|
| Requested → Processing | Succeeded → Requested |
| Processing → Succeeded or Failed | |

### Payout

| Legal | Illegal |
|---|---|
| Requested → Processing | Paid → Processing |
| Processing → Paid or Failed | |

These tables are transcribed into `packages/domain` in the phase that needs each one, and the
transition matrix is a tested artifact — a rejected transition is a test case, not a comment.
