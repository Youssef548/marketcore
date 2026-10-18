# 002 Decide limited stock with PostgreSQL row locks at checkout

- **Date:** 2026-10-17
- **Status:** Accepted
- **Phase:** 4 — gates the checkout transaction
- **Implements:** [`#71`](https://github.com/Youssef548/marketcore/pull/71) (retryable transactions),
  [`#77`](https://github.com/Youssef548/marketcore/pull/77)–[`#79`](https://github.com/Youssef548/marketcore/pull/79)
  (`CheckoutRepository.place`, the checkout routes and the stock-1 race) — Tasks 12–15 of
  `docs/superpowers/plans/2026-10-16-marketcore-phase-4-cart-checkout.md`; M1 met at
  [`#87`](https://github.com/Youssef548/marketcore/pull/87).

## Context

INV-1: available stock never goes below zero, observed as 100 concurrent checkouts for one unit
producing exactly one order and stock 0, on every one of 20 consecutive runs (SRS-NFR-REL-001). CR-001
made two things harder than the baseline assumed:

- **A checkout spans sellers** (D56) and is all or nothing (D57, INV-11): every line succeeds or none
  does, and a refusal reports *every* failing line with one reason each (D85) and the current price
  (D77), so the buyer can fix the cart once.
- **Nothing is reserved at add-to-cart** (D58). The contest for the last unit happens once, inside
  the checkout transaction.

`Inventory` already carries `available`, `reserved` (stays 0) and `version`, and the database enforces
`inventory_quantities_non_negative` as a CHECK.

## Decision

**One short `READ COMMITTED` transaction locks every line's inventory row with
`SELECT … FOR UPDATE`, in `productId` order, then reads, decides and writes.**

1. Lock the buyer's cart row (D83), then every line's `inventory` row, ordered by `productId`
   (`COLLATE "C"`), so two overlapping carts always take their locks in the same order and cannot
   deadlock (RISK-003, SRS-NFR-REL-002).
2. Re-read each product's price and status under the lock and evaluate **all** lines — a pure rule in
   `packages/domain` — so a refusal lists every failing line, not the first.
3. Any failing line: write nothing and commit the read-only transaction. Otherwise decrement each line,
   insert the checkout and one order per seller, clear the cart, commit.
4. The CHECK constraint stays as the backstop: a bug that skipped step 2 fails at the database rather
   than overselling.
5. A deadlock or serialization failure that still occurs is retried up to three times with jitter
   (SRS §8); a test forces one to pin how Prisma reports it.

The writes cross module edges through `InventoryRepository` and `CartRepository` sharing one
transaction client (D93).

## Alternatives considered

- **Conditional updates, no explicit lock** — `UPDATE inventory SET available = available - $q
  WHERE "productId" = $id AND available >= $q`, rolling back when any affects zero rows. Simplest for
  one line, and correct for INV-1. Rejected for checkout because it decides line by line: it stops at the
  first short line, cannot report the rest (D85), and checks the price separately from the stock, so the
  two can disagree. It stays the right tool for the worker's restock, which has nothing to report.
- **Optimistic concurrency on `version`.** Read without locks, write with `WHERE version = $v`, retry on
  conflict. Rejected: the flagship case is maximum contention — 100 writers on one row — where optimistic
  retries are the expensive path, and 99 retry storms to tell 99 buyers "sold out" is the opposite of the
  claim. `version` stays unused; dropping it is a later migration if nothing adopts it.
- **`SERIALIZABLE` isolation.** Correct without hand-ordered locks, but every conflict surfaces as a
  serialization failure to retry, so under the race the database does the same work as optimistic
  locking, and the outcome depends on retry budgets rather than on a lock.
- **A Redis lock or counter.** Rejected by architecture rule 2: Redis is never the source of truth for
  state that money depends on, and it does not exist before phase 10.
- **Advisory locks per product.** Equivalent ordering guarantees, but the lock lives apart from the row
  it protects, so a code path that writes `inventory` without taking it is invisible.

## Trade-offs

- **Locks serialise buyers of the same product.** Throughput on one hot product is bounded by the
  transaction's length, which is why the transaction holds no network call — the payment happens after
  it, in phases 6–7 (D62).
- **Lock order is a rule code must keep.** The ordering lives in one repository method and one domain
  helper, and the overlapping-cart test fails if it is broken.
- **A refused checkout still takes its locks** to read under them. Cheap compared with reporting a
  stale availability.

## Consequences

- Every write to `inventory` goes through `InventoryRepository`, and every multi-row lock there is
  ordered by `productId`.
- The worker's restock (INV-15) locks inventory rows in the same order.
- The stock-1 race and the overlapping-cart test are the gate: both run against real PostgreSQL, 20
  consecutive passes for the race (failure-scenarios §4).

## Review date

At phase 13's load results, or 2027-01-17 — whichever comes first. The trigger is a measured hot-row
bottleneck.
