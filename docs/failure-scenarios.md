# MarketCore — Failure Scenarios

- **Date:** 2026-09-19
- **Status:** Accepted
- **Related:** `docs/architecture.md`, `docs/domain-model.md`

A failure scenario is only accepted into this table if it names the behaviour required, the test
that proves the behaviour, and the week that test lands. Anything with an empty "proven by" cell is a
hope.

## 1. Failure matrix

| Failure | Required behaviour | Proven by | Week |
|---|---|---|---|
| Client times out after checkout commit | Retry returns the original operation | Repeated-checkout idempotency test (INV-2) | 4 |
| Payment provider times out | Job retries safely without duplicate capture | Simulator timeout scenario | 4 |
| Webhook is duplicated | Duplicate is stored or ignored without repeated effects | Unique event constraint test (INV-4) | 5 |
| Webhook arrives out of order | State machine applies or ignores it safely | Ordered and reordered event tests | 5 |
| Worker crashes after provider success | Recovery reconciles the provider outcome and records it once | Kill worker at controlled checkpoint (INV-10) | 8 |
| Redis is unavailable | Core database remains consistent and work is recoverable | Dependency outage test and runbook | 8 |
| Database deadlock occurs | Bounded retry handles retryable transaction failure | Forced lock-order test | 3 |
| Email sending fails | Payment and ledger remain successful | Notification retry test | 10 |
| Two payout workers race | One claim and one provider call | Concurrent worker integration test (INV-8) | 9 |

## 2. Flagship automated tests

These are the eight tests the plan nominates as the project's evidence. Three of them shape the
architecture rather than merely verifying it, and are marked accordingly.

| Test | Setup | Assertions | Week | Shapes design |
|---|---|---|---|---|
| Last item race | Stock 1, 100 concurrent checkout requests | One success, 99 conflicts, stock 0, one order | 3 | **yes** — forces row lock inside a short transaction |
| Repeated checkout | Same request and key submitted 20 times | One order, one reservation, one payment intent | 4 | |
| Duplicate payment webhook | Same provider event delivered repeatedly | One state transition, one ledger transaction | 5 | |
| Ledger balance | Generate captures, refunds, and payouts | Every transaction sums to zero by currency | 8 | |
| Outbox crash recovery | Crash after commit, before publication acknowledgement | Event is published after recovery, effect occurs once | 8 | **yes** — forces claim leases |
| Tenant isolation | User from tenant A requests tenant B resource | Not found or forbidden, without data leakage | 2 | |
| Payout race | Two workers claim the same eligible payout | Provider transfer is initiated once | 9 | **yes** — forces a single atomic claim |
| Refund cap | Concurrent refunds exceed the captured amount | Only the valid cumulative amount succeeds | 9 | |

## 3. How the two views relate

The failure matrix and the flagship-test list answer different questions, and merging them would
lose information. **Four of the eight flagship tests are failure scenarios; four are correctness
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
