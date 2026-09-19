# Architecture Decision Records

One file per decision, numbered sequentially. ADRs are written **just in time** — immediately before
the phase that would otherwise force the decision, never in a batch up front. An ADR written before
its constraint exists describes a guess, not a decision.

## Index

| ADR | Decision | Gating phase | Status |
|---|---|---|---|
| [001](./0001-modular-monolith-with-worker.md) | Use a modular monolith with API and worker processes | Before application structure | Accepted |
| 002 | Use PostgreSQL row locking for limited inventory | Before checkout implementation (phase 4) | Proposed |
| 003 | Use request-scoped idempotency records | Before retry-safe checkout (phase 5) | Proposed |
| 004 | Use a deterministic payment simulator before Stripe | Before payment implementation (phase 6) | Proposed |
| 005 | Use an append-only double-entry ledger | Before financial balances (phase 8) | Proposed |
| 006 | Use a transactional outbox | Before asynchronous payment jobs (phase 10) | Proposed |
| 007 | Use BullMQ for background processing | Before worker and retry configuration (phase 10) | Proposed |
| 008 | Use OpenTelemetry for cross-process tracing | Before instrumentation (phase 12) | Proposed |
| 009 | Deploy API and worker on ECS Fargate | Before Terraform implementation (phase 14) | Proposed |
| [010](./010-tenant-isolation-in-the-query-layer.md) | Enforce tenant isolation in the application query layer | Before tenancy and every tenant-owned read (phase 2) | Accepted |
| [011](./011-web-session-and-token-storage.md) | Hold the web session in httpOnly cookies behind a BFF | Before the first web route that needs a session | Accepted |

Decisions that do not warrant an ADR live in `docs/superpowers/specs/`, whose `D<n>` identifiers are
cited from code comments and plans. The sequence is continuous across documents rather than
restarting: D1–D17 are in `2026-09-19-marketcore-platform-design.md`, and D18 onward are in the week
spec that introduces them. Week 1's structural decisions — the `packages/runtime` extraction (D5) and
bigint ledger amounts (D9) — are recorded there.

## Status values

- **Proposed** — written, not yet implemented.
- **Accepted** — implemented, and the linked commit or phase exists.
- **Superseded** — replaced; the ADR stays in place and links forward rather than being deleted.

## Template

```markdown
# NNN Title

- **Date:** YYYY-MM-DD
- **Status:** Proposed | Accepted | Superseded by [NNN](./NNN-*.md)
- **Phase:** the phase this gates
- **Implements:** link to the commit or PR that carries it

## Context
What forces a decision now. Facts, not preferences.

## Decision
One sentence, then the specifics.

## Alternatives considered
Each with the reason it was rejected. An alternative dismissed without a reason is not considered.

## Trade-offs
What this costs. A decision with no cost is either trivial or unexamined.

## Consequences
What becomes true, including the constraints this places on other code.

## Review date
YYYY-MM-DD
```
