# Software Requirements — MarketCore buyer storefront, Release 1

**Version:** 1.0 · **Based on PRD baseline:** v2 (`2026-10-16-marketcore-storefront-prd.md`) · **Date:** 2026-10-16
**Decisions:** D52–D74 in `2026-10-16-cr-001-buyer-storefront.md`; this document adds D75–D80.
**Design records:** ADR 010 (amended), ADR 0001 (amended), ADR 014.

## 1. Introduction

### 1.1 Purpose

The PRD says what a buyer can do. This document says what the API, the database and the worker
must do to make it true, precisely enough to write the tests first.

### 1.2 Scope

Release 1 only: public catalog, cart, checkout, auto-cancel, one split payment, buyer orders and
refund requests (PRD F-CAT-01 … F-REF-01). Release 2 features get their SRS when Release 2 is
planned; §13 lists the constraints already fixed for them.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| Buyer | An authenticated user acting without a tenant. May also be a member of organizations. |
| `BuyerContext` | The value object a guard builds from the authenticated user id. Buyer-scoped repositories take it, never a bare user id. |
| Public field | A product field in the `PublicProduct` contract schema. Nothing else leaves a public read. |
| Checkout | One "Place order": one buyer, one currency, one order per seller, one payment. |
| Seller share | An order's total minus the platform fee. |

### 1.4 References

`docs/domain-model.md` (INV-1 … INV-15), `docs/architecture.md`, `docs/failure-scenarios.md`,
`packages/contracts/src/error.ts` (the closed error-code set), ADRs 0001, 010, 014.

## 2. System overview

```
browser ──▶ apps/web BFF ──▶ apps/api /api/v1 ──▶ PostgreSQL ◀── apps/worker (phase 4: auto-cancel)
                                   │
                                   └─▶ PaymentProvider (simulator phase 6, Stripe test mode phase 7)
```

The storefront and the operator UI are one Next.js app behind one BFF. Buyer routes carry no
`x-organization-id`; seller routes keep it. The worker shares `packages/runtime` and
`packages/domain` and never imports `apps/api` (ADR 0001).

**Decisions added here**

| ID | Decision |
|---|---|
| D75 | Buyer routes are `@TenantFree()` and resolve a `BuyerContext` from the access token's user id. A buyer is never identified by a request field. |
| D76 | The public product identifier is the product id. The web URL `/p/{name-slug}-{id}` is cosmetic; only the id is read. `Product` gains no slug. |
| D77 | Checkout confirmation is concrete: `POST /checkouts` carries the lines the buyer confirmed (`productId`, `quantity`, `unitPriceMinor`). The server places the order only if every confirmed price still equals the current price. |
| D78 | The platform fee is a constant, `PLATFORM_FEE_BPS = 1000` (10%), in `packages/domain`, applied per seller order: fee = floor(total × bps / 10 000), seller share = total − fee, so rounding favours the seller. |
| D79 | The auto-cancel worker runs every 60 seconds and cancels at most 100 checkouts per run. |
| D80 | Approving or rejecting a refund request is `@OwnerOnly()` `[ASSUMPTION — a member may not move money]`. |

## 3. Functional requirements

All paths are under `/api/v1`. Every failure uses the shared error envelope.

### 3.1 Public catalog — F-CAT-01

| SRS ID | Requirement | Traces to |
|---|---|---|
| SRS-FR-CAT-001 | `GET /storefront/products` returns `PUBLISHED` products of every `ACTIVE` organization, newest first, cursor-paginated, 24 per page. | PRD-FR-CAT-001 |
| SRS-FR-CAT-002 | `GET /storefront/products/:id` returns one `PUBLISHED` product; a draft, an unknown id, or a product of an inactive organization answers 404 `NOT_FOUND`. | PRD-FR-CAT-002 |
| SRS-FR-CAT-003 | Both responses are parsed through the `PublicProduct` zod schema (`id`, `name`, `priceMinor`, `currency`, `available`, `seller: { name, slug }`). The schema is `.strict()`; it is the allowlist. | PRD-FR-CAT-003, RULE-CAT-001 |
| SRS-FR-CAT-004 | `available` is `Inventory.available` read in the same query; it is not cached. | PRD-FR-CAT-003, D61 |

### 3.2 Cart — F-CART-01

| SRS ID | Requirement | Traces to |
|---|---|---|
| SRS-FR-CART-001 | `GET /cart` returns the buyer's cart, creating an empty one on first read. One `Cart` row per buyer (unique `buyerId`). | PRD-FR-CART-001 |
| SRS-FR-CART-002 | `PUT /cart/items/:productId` with `{ quantity }` sets a line; `DELETE /cart/items/:productId` removes it. Both are idempotent by construction. | PRD-FR-CART-005 |
| SRS-FR-CART-003 | Setting a line for a product that is not `PUBLISHED` answers 404 `NOT_FOUND`. | PRD-FR-CART-001 |
| SRS-FR-CART-004 | A cart write never reads-for-update or writes `Inventory`. | PRD-FR-CART-002, D58 |
| SRS-FR-CART-005 | Each line in a cart response carries `currentUnitPriceMinor`, `available` and a derived `availability` of `OK`, `SHORT` (available < quantity) or `SOLD_OUT` (available = 0). | PRD-FR-CART-003 |
| SRS-FR-CART-006 | Lines are grouped by seller organization in the response. | PRD-FR-CART-004 |
| SRS-FR-CART-007 | A line that stops being `PUBLISHED` stays in the cart with `availability: SOLD_OUT`. | PRD-FR-CART-003 |

### 3.3 Checkout — F-CHK-01

| SRS ID | Requirement | Traces to |
|---|---|---|
| SRS-FR-CHK-001 | `POST /checkouts` takes `{ lines: [{ productId, quantity, unitPriceMinor }] }` — the lines the buyer confirmed on the review step (D77). | PRD-FR-CHK-001, -002 |
| SRS-FR-CHK-002 | In **one transaction**: lock the `Inventory` rows of every line with `SELECT … FOR UPDATE` **ordered by `productId`**; re-read every product's price and status; then either commit everything below or nothing. | PRD-FR-CHK-003, RULE-CHK-002 |
| SRS-FR-CHK-003 | If any line is not `PUBLISHED`, short of stock, or priced differently from its confirmed `unitPriceMinor`, roll back and answer 409 `CONFLICT` with `details.lines: [{ productId, reason: SOLD_OUT \| SHORT \| PRICE_CHANGED, available, currentUnitPriceMinor }]` listing every failing line, not only the first. | PRD-FR-CHK-004, INV-11 |
| SRS-FR-CHK-004 | On success: decrement each line's `available`; insert one `Checkout` (`PENDING_PAYMENT`, `placedAt = now()`); insert one `Order` per seller organization with its `OrderItem`s and snapshotted `unitPriceMinor`; return 201 with the checkout and its orders. | PRD-FR-CHK-003, -005 |
| SRS-FR-CHK-005 | All lines must share one currency; a mixed request answers 400 `VALIDATION_ERROR` before any lock is taken. | RULE-CHK-001, D71 |
| SRS-FR-CHK-006 | The request's lines must equal the buyer's current cart lines (same products, same quantities); otherwise 409 `CONFLICT` with `details.reason: CART_CHANGED`. | PRD-FR-CHK-001 |
| SRS-FR-CHK-007 | On success the cart is emptied in the same transaction. On failure the cart is unchanged. | PRD-FR-CHK-004 |
| SRS-FR-CHK-008 | From phase 5, `POST /checkouts` requires an `Idempotency-Key` header. Keys are unique per `(buyerId, key)`. A repeat with the same body returns the original 201 response; the same key with a different body answers 409 `CONFLICT`. | PRD-FR-CHK-006, INV-2 |
| SRS-FR-CHK-009 | `GET /checkouts/:id` returns the buyer's own checkout; another buyer's id answers 404. | PRD-FR-CHK-007, INV-12 |

### 3.4 Auto-cancel — D70

| SRS ID | Requirement | Traces to |
|---|---|---|
| SRS-FR-CXL-001 | Every 60 seconds the worker runs, in one transaction: `UPDATE checkout SET status = 'CANCELLED' WHERE id IN (SELECT id FROM checkout WHERE status = 'PENDING_PAYMENT' AND placed_at < now() - interval '30 minutes' ORDER BY placed_at LIMIT 100 FOR UPDATE SKIP LOCKED) RETURNING id`. | PRD-FR-CHK-008, D79 |
| SRS-FR-CXL-002 | In the same transaction, for the returned checkouts only: set their orders to `CANCELLED`, and add each order item's quantity back to `Inventory.available`, locking inventory rows in `productId` order. | PRD-FR-CHK-008, INV-15 |
| SRS-FR-CXL-003 | A checkout whose status is no longer `PENDING_PAYMENT` is never touched, so a run racing a payment or another run restores nothing twice. | INV-15 |
| SRS-FR-CXL-004 | Each run logs one JSON line: `event: checkout.autocancel.run`, `cancelled`, `durationMs`. | SRS-NFR-OBS-001 |

### 3.5 Payment and the split — F-PAY-01 (phases 6–8)

| SRS ID | Requirement | Traces to |
|---|---|---|
| SRS-FR-PAY-001 | A `Payment` references a `checkoutId`, unique: one payment per checkout. Its amount is the checkout total. | PRD-FR-PAY-001, INV-3 |
| SRS-FR-PAY-002 | On capture, one `LedgerTransaction` debits platform cash by the amount and, per order, credits that seller's payable with the seller share and platform revenue with the fee (D78). The signed sum is zero. | PRD-FR-PAY-002, INV-6, INV-13 |
| SRS-FR-PAY-003 | Capture moves the checkout and every one of its orders to `PAID` in the same transaction as the ledger write. | PRD-FR-PAY-003 |
| SRS-FR-PAY-004 | A capture for a `CANCELLED` checkout is refunded in full by the system and never marks any order `PAID`. | INV-15, failure-scenarios |

### 3.6 Buyer orders — F-BORD-01

| SRS ID | Requirement | Traces to |
|---|---|---|
| SRS-FR-BORD-001 | `GET /buyer/orders` lists orders where `buyerId` is the `BuyerContext`'s user, newest first, cursor-paginated. | PRD-FR-BORD-001 |
| SRS-FR-BORD-002 | `GET /buyer/orders/:id` returns items, unit prices, total, status, `checkoutId` and seller `{ name, slug }`; another buyer's order answers 404. | PRD-FR-BORD-002, INV-12 |
| SRS-FR-BORD-003 | Buyer order queries compose their filter from `buyerScope(buyer)` in `packages/domain` and never from `tenantScope`. | RULE-BORD-001, ADR 010 |

### 3.7 Refund requests — F-REF-01 (phase 9)

| SRS ID | Requirement | Traces to |
|---|---|---|
| SRS-FR-REF-001 | `POST /buyer/orders/:id/refund-requests` creates a `Refund` in `REQUESTED` for the order's full total, only if the order is the buyer's and `PAID`, `FULFILLING` or `COMPLETED`; otherwise 409 `CONFLICT`. One open request per order. | PRD-FR-REF-001 |
| SRS-FR-REF-002 | `POST /refunds/:id/approve` and `/reject` are tenant routes, `@OwnerOnly()` (D80), and act only on refunds of the tenant's orders. | PRD-FR-REF-002, -004 |
| SRS-FR-REF-003 | Approval moves the refund to `PROCESSING` and runs the phase-9 refund against the checkout's payment for that order's total. The cumulative refunds of a payment never exceed its capture, checked under a lock on the payment row. | PRD-FR-REF-003, INV-5 |
| SRS-FR-REF-004 | A succeeded refund's ledger transaction reverses only that order's seller share and fee. | RULE-REF-001, INV-13 |

## 4. Non-functional requirements

| SRS ID | Category | Requirement | Measurement | Traces to |
|---|---|---|---|---|
| SRS-NFR-REL-001 | Reliability | The stock-1 race holds on every run. | 100 concurrent `POST /checkouts` on stock 1, repeated 20 consecutive times: each run 1 × 201, 99 × 409, `available = 0`, 1 checkout. | INV-1 |
| SRS-NFR-REL-002 | Reliability | Overlapping multi-seller checkouts never deadlock-fail. | 50 concurrent checkouts over 3 shared products in different cart orders: 0 deadlock errors reach the client. | RULE-CHK-002 |
| SRS-NFR-REL-003 | Reliability | Auto-cancel restores stock exactly once. | Two worker runs in parallel over 10 expired checkouts: each product's `available` rises by exactly its ordered quantity. | INV-15 |
| SRS-NFR-SEC-001 | Security | No private product field leaves a public read. | Contract test: `PublicProduct.strict()` rejects any extra key; e2e: a draft id answers 404. | RULE-CAT-001 |
| SRS-NFR-SEC-002 | Security | Cross-buyer isolation on cart, checkout and orders. | e2e per route: buyer Y's id under buyer X answers 404, with a control case where X reads X's own. | INV-12 |
| SRS-NFR-PERF-001 | Performance | A 3-line, 3-seller checkout returns quickly under load. | p95 < 300 ms at 50 concurrent buyers on the local compose stack `[ASSUMPTION — measured in phase 13]`. | — |
| SRS-NFR-OBS-001 | Observability | Every checkout outcome is one structured log line with the request id. | `event: checkout.placed` or `checkout.rejected` with `checkoutId` or `reasons`. | — |
| SRS-NFR-A11Y-001 | Accessibility | Storefront pages meet the existing bars. | `tokens.spec.ts` contrast ≥ 4.5:1 text, ≥ 3:1 control edge, both themes; no font below 12px. | ADR 013 |

## 5. Authorization

| Action | Anonymous | Buyer (signed in) | Seller member | Seller owner |
|---|---|---|---|---|
| Browse / read published product | — | ✓ | ✓ (as buyer) | ✓ (as buyer) |
| Read and change own cart | — | ✓ | ✓ | ✓ |
| Place checkout, read own checkout | — | ✓ | ✓ | ✓ |
| Read own buyer orders, request refund | — | ✓ | ✓ | ✓ |
| Read the tenant's orders | — | — | ✓ | ✓ |
| Approve or reject a refund | — | — | — | ✓ (D80) |

Anonymous browsing is not in scope: the PRD requires a signed-in user for every storefront read.

## 6. Data requirements

| Entity | Fields (new or changed) | Constraints |
|---|---|---|
| Cart | `id`, `buyerId`, `updatedAt` | Unique `buyerId` |
| CartItem | `cartId`, `productId`, `quantity` | Unique (`cartId`, `productId`); CHECK `quantity BETWEEN 1 AND 10` |
| Checkout | `id`, `buyerId`, `status`, `totalMinor`, `currency`, `placedAt` | Index (`status`, `placedAt`) for the auto-cancel scan |
| Order | + `checkoutId` | FK to Checkout; index (`buyerId`, `createdAt`) |
| IdempotencyKey | `buyerId` replaces `organizationId` | Unique (`buyerId`, `key`) |
| Payment | `checkoutId` replaces `orderId` | Unique `checkoutId` |
| Refund | + `orderId`, status `REJECTED` | Partial unique: one `REQUESTED`/`PROCESSING` per `orderId` |
| Inventory | unchanged; `reserved` stays 0 | Existing CHECK `available >= 0` |

Retention: carts are kept until emptied; checkouts, orders and ledger rows are never deleted (INV-7).

## 7. Validation rules

| Field | Rule | Error |
|---|---|---|
| `quantity` | integer 1–10 | 400 `VALIDATION_ERROR` |
| `lines` | 1–50 entries, unique `productId` | 400 `VALIDATION_ERROR` |
| `unitPriceMinor` | integer ≥ 1 | 400 `VALIDATION_ERROR` |
| `Idempotency-Key` | 1–64 chars `[A-Za-z0-9_-]` | 400 `VALIDATION_ERROR` |
| Currencies across lines | all equal | 400 `VALIDATION_ERROR` |

## 8. Error handling

No new error codes. Stock, price and cart-change failures are 409 `CONFLICT` with a typed
`details` shape in `packages/contracts`, so the web app branches on `details.lines[].reason`, never
on `message`. A Postgres deadlock or serialization failure inside checkout is retried up to 3 times
with jitter before 409 is returned (failure-scenarios: database deadlock).

## 9. External interfaces

| System | Purpose | Direction | Failure behaviour |
|---|---|---|---|
| PaymentProvider (simulator, then Stripe test mode) | One charge per checkout; refunds | Outbound + webhook inbound | Timeout retried by the worker with the same provider idempotency key; never a second capture (INV-3) |

## 10. Constraints

- No Redis before phase 10; the phase-4 worker uses only PostgreSQL.
- `scripts/check-db-env.mjs` must list `apps/worker/.env` in phase 4 (moved from phase 10, ADR 0001 amended).
- Real money movement stays excluded; seller transfers are ledger entries plus phase-11 payouts.

## 11. Regulatory

Saved cards (Release 2) are held by Stripe only; MarketCore stores no card data (ASM-002).

## 12. Traceability

| PRD | SRS | Test |
|---|---|---|
| PRD-FR-CAT-001 … 003 | SRS-FR-CAT-001 … 004, SRS-NFR-SEC-001 | AC-US-CAT-001-1/-2, AC-US-CAT-002-1 |
| PRD-FR-CART-001 … 006 | SRS-FR-CART-001 … 007 | AC-US-CART-001-1/-2, AC-US-CART-002-1/-2 |
| PRD-FR-CHK-001 … 008 | SRS-FR-CHK-001 … 009, SRS-FR-CXL-001 … 004, SRS-NFR-REL-001 … 003 | AC-US-CHK-001-1 … AC-US-CHK-003-1 |
| PRD-FR-PAY-001 … 003 | SRS-FR-PAY-001 … 004 | AC-US-PAY-001-1, AC-US-PAY-002-1 |
| PRD-FR-BORD-001 … 002 | SRS-FR-BORD-001 … 003, SRS-NFR-SEC-002 | AC-US-BORD-001-1, AC-US-BORD-002-1 |
| PRD-FR-REF-001 … 004 | SRS-FR-REF-001 … 004 | AC-US-REF-001-1, AC-US-REF-002-1 |

The development plan (`docs/superpowers/plans/2026-10-16-marketcore-release-1.md`) maps each SRS ID to
a task and a test.

## 13. Release 2 constraints already fixed

Address snapshotted onto the order; reviews unique per (`productId`, `buyerId`) and gated on a
`COMPLETED` order; wishlist never touches `Inventory`; promotions seller-funded and snapshotted, with
INV-14; search is a Postgres `tsvector` over the `PublicProduct` fields only.
