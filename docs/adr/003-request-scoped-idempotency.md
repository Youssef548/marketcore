# 003 Use request-scoped idempotency records

- **Date:** 2026-10-18
- **Status:** Proposed
- **Phase:** 5 — gates retry-safe checkout
- **Implements:** _pending_ — `docs/superpowers/plans/2026-10-18-marketcore-phase-5-idempotency.md`

## Context

US-CHK-003 and PRD-FR-CHK-006: a retried "Place order" never creates a second checkout, and the
retry carries a key scoped to the buyer. AC-US-CHK-003-1 fixes the observation — 20 requests with
one key leave one checkout and one set of orders (INV-2).

D83 already makes a *concurrent* second checkout of the same cart harmless: the cart row is locked
first, so the second request finds the cart empty and gets `409 CART_CHANGED`. That is a different
claim from the one the requirement makes. A retry that arrives *after* the first one committed also
finds an empty cart, so a buyer who double-clicked gets a refusal for an order that already exists —
the retry is not harmless, it is indistinguishable from a genuine "your cart changed". US-CHK-003
needs the retry to answer with the checkout it already placed.

Two constraints decide the shape:

- **No Redis before phase 10** (SRS §10, architecture rule 2). The record has to live in PostgreSQL
  next to the state it protects, or a restart loses it.
- **The effect and its record commit together.** Written before the checkout, a crash in between
  leaves a key that names nothing; written after, a crash leaves a checkout no key can replay. The
  record is a write inside the checkout transaction.

## Decision

**A row in `idempotency_keys`, unique per `(buyerId, key)`, is claimed as the first statement of the
checkout transaction; it names the checkout it will create and carries the canonical request's
fingerprint.**

1. `POST /checkouts` requires `Idempotency-Key: 1–64 chars [A-Za-z0-9_-]` (SRS §7). Missing or
   malformed is `400 VALIDATION_ERROR`, produced before any lock and writing no row (D94).
2. The transaction's first statement claims the key with `INSERT … ON CONFLICT DO NOTHING`. The row is
   written with the id the placement is about to give its checkout, so the claim does not depend on a
   later update. A claimed key means "this request is the operation" — continue (D97).
3. An existing row is the replay path: a matching fingerprint answers `201` with the checkout that
   row names; a different fingerprint answers `409 CONFLICT` with `details.reason: KEY_REUSED`, a new
   value in `CheckoutRefusals` (D95). No new `ErrorCode` (SRS §8).
4. The fingerprint is the canonical request — `{"lines":[…]}` with the lines sorted by `productId` —
   stored verbatim in the row, so the same lines in a different order replay and a mismatch is
   readable in a failure report rather than opaque (D96).
5. The unique index is the concurrency arbiter: a duplicate blocks on the uncommitted index entry
   while holding nothing else, then re-reads the row the winner committed. The second 100-way
   checkout race for one key is therefore one checkout, not two (D97).
6. A refusal — `409` line conflicts, `CART_CHANGED`, or the contention `409` — releases the claim
   inside the same transaction, so a key is committed only alongside the checkout it created. The
   database enforces the same rule directly: `checkoutId` is `NOT NULL` and its foreign key to
   `checkouts` is `DEFERRABLE INITIALLY DEFERRED`, so the row may be inserted before its checkout but
   a committed row must name one that exists. (PostgreSQL defers `UNIQUE`, `PRIMARY KEY`,
   `REFERENCES` and `EXCLUDE` only — never `CHECK` — so the guarantee rides on the deferred foreign
   key rather than a CHECK) (D98).
7. Keys are scoped to the buyer: `UNIQUE (buyerId, key)`. Two buyers may use the same key string, and
   one buyer's key is invisible to another (SRS §6, D99).
8. The replay re-reads the checkout instead of storing a frozen response body (D95). An immediate
   retry returns the original response; a retry after the worker cancelled the checkout returns the
   cancellation, which is the state the buyer needs to see.

## Alternatives considered

- **A `(buyerId, key)` unique constraint with no stored response.** The cheapest record, and it does
  detect the duplicate — but the duplicate's cart is gone, so all it can answer is `CART_CHANGED`.
  It fails the claim it exists for.
- **An in-process map or a Redis key.** Rejected: not durable across processes, and Redis before
  phase 10 is the constraint this decision already sits inside.
- **Making checkout naturally idempotent by matching the request against the buyer's recent
  checkouts.** Ambiguous by construction: a buyer who legitimately refills the same cart and orders
  again looks exactly like a retry, and a changed quantity cannot be told from a stale duplicate. The
  key is an explicit claim by the client, and only the client knows what a retry is.
- **Inserting the key row after the placement succeeds**, so the row is born with its `checkoutId`.
  Rejected: the duplicate pays the whole placement — cart lock, inventory locks, every write — before
  discovering it is a duplicate, then rolls all of it back. Claiming first fails fast and shortens
  what the duplicate holds, the same argument ADR 002 makes for the lock order.
- **Hashing the canonical request (SHA-256) instead of storing it.** Bounded length and no request
  text in the table. Rejected for now: the string is bounded by validation at ≤50 lines, the table is
  never exposed, and a stored string makes a fingerprint mismatch explainable. A digest is a later
  migration behind a measurement, not a guess.
- **A deferred `CHECK ("checkoutId" IS NOT NULL)`.** Considered first and *not possible*: PostgreSQL
  defers only `UNIQUE`, `PRIMARY KEY`, `REFERENCES` and `EXCLUDE` constraints, never `CHECK`, so a
  CHECK is evaluated at insert, when the checkout does not exist yet. The guarantee moved to the
  deferred foreign key, which is checked at commit.
- **Leaving `checkoutId` nullable and trusting the release-on-refusal code path.** The invariant would
  rest on a branch a future edit can delete silently. Making the column `NOT NULL` behind a deferred
  foreign key turns the same mistake into an aborted transaction.

## Trade-offs

- **Rows accumulate.** Checkouts and orders are never deleted (INV-7), so a key is kept for as long as
  the checkout it replays exists, and the largest row is ~3 KB. There is no expiry.
- **The claim serialises duplicates of one key.** That is the claim, but it means a client that reuses
  one key across different carts (a bug, not a retry) is told `409 KEY_REUSED` instead of getting two
  orders.
- **The store is per-checkout, not a generic queue.** Phase 6's capture has its own retry problem and
  decides it in its own ADR (014); this table does not grow a purpose it does not have.
- **The checkout id is minted by the claim, before the checkout exists.** A refused placement discards
  one uuid, and the id is no longer the database's default. The alternative — writing the row after the
  checkout — is rejected above for its lock cost.
- **The replay is regenerated, not echoed byte for byte.** A checkout whose status changed between
  attempts answers with the new status. Cost if the ruling is wrong: a client that asserted byte
  equality across a 30-minute retry — no such client exists in the plan.

## Consequences

- `POST /checkouts` without `Idempotency-Key` is a `400`, and every caller mints one key per placement
  attempt and reuses it across retries. The web BFF is the only caller, so the browser is where the
  key is minted: only the browser knows that a click is a retry (D100).
- The M2 gate is the proof: 20 requests with one key leave one checkout and one set of orders
  (`pnpm --filter api test:e2e`), with a concurrency spec for duplicates that arrive together.
- A committed `idempotency_keys` row always names a checkout; an integration test proves that a
  committed row naming a checkout that does not exist aborts the transaction.
- Checkout outcomes keep SRS-NFR-OBS-001's two events: a replay logs `checkout.placed` with
  `replayed: true`, and a fingerprint mismatch logs `checkout.rejected` with `KEY_REUSED`.

## Review date

At phase 8, when the ledger gives a second retry-safe write a reason to reuse this shape — or
2027-01-18. The trigger is a second caller or a measured hot key.
