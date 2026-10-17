# CR-002: Phase-4 rulings — the plan's decisions, three product calls, and SRS errata

**Raised by:** the phase-4 plan (25 findings against the SRS) · **Date:** 2026-10-17 · **Against baseline:** v2
**Status:** Approved — baseline v2.1

## Requested change

Writing the phase-4 TDD plan against the real code found 25 places where the Release 1 SRS was wrong,
silent or ungroundable. The plan proposed D81–D90 and left three questions for the owner. This CR
ratifies the ten, rules on the three, and corrects the documents.

## Decisions ratified

D81–D90 as written in `docs/superpowers/plans/2026-10-16-marketcore-phase-4-cart-checkout.md`
(§ Decisions added by this plan): a seller sets stock with `PUT /products/:id/inventory` (D81); a cart
line snapshots its price when added (D82); the cart row is locked first and a concurrent second
checkout gets `409 CART_CHANGED` (D83); phase 4 ships only `PENDING_PAYMENT` and `CANCELLED` (D84);
one reason per refused line, `SOLD_OUT` > `SHORT` > `PRICE_CHANGED` (D85); a no-longer-public line
reports stock 0 and price `null` (D86); worker timings shortenable by env with floors (D87); the
placed screen's id is the checkout id (D88); newest-first cursor pages of 20 (D89); order items
snapshot the product name (D90).

## Decisions added

| ID | Decision | Finding |
|---|---|---|
| D91 | **Every signed-in user lands on the storefront** (`/browse`). Belonging to no organization is a buyer's normal state, so the first-run screen stops being a gate and becomes the page behind **Start selling**; a member reaches the console through a **Seller console** link. | 20 |
| D92 | **The operator console lives under `/admin`** — `/admin` (overview), `/admin/products`, and so on, as `docs/architecture.md` and the Stitch route map already say. `/dashboard` and `/products` redirect permanently. Moved with the shell re-skin (T-002), which frees the root for the storefront. | 23 |
| D93 | **Checkout crosses module edges through repositories, not tables.** `CheckoutRepository` opens the transaction and calls `InventoryRepository` and `CartRepository` methods that take the transaction client; their modules export those repositories. Architecture rule 4 holds with no exception, and no Prisma type reaches a service. | 16 |

## Errata applied

| Document | Correction | Finding |
|---|---|---|
| SRS §3.4 | Auto-cancel SQL uses the schema's names: `checkouts`, `"placedAt"`. | 10 |
| SRS §3.1 | Adds SRS-FR-CAT-005, the seller's stock endpoint. | 2 / D81 |
| SRS §3.2, §3.3 | Price snapshot at add (D82); one reason per line (D85); `CART_CHANGED` on a concurrent checkout (D83). | 3, 7, 9 |
| SRS §3.6 | Buyer orders page by 20, newest first (D89). | 18 |
| SRS §6 | `Order.checkoutId` is `NOT NULL` from its first migration — `Order` is new in phase 4, so nothing is backfilled; `CartItem.addedUnitPriceMinor`, `OrderItem.productName`, unique (`checkoutId`, `organizationId`). | 25, 21 |
| SRS §8 | The error filter forwards `details` from any `HttpException`, so the typed 409 reaches the client. | 1 |
| PRD RULE-CAT-001 | Public fields drop slug and status, as D76 already decided. | 5 |
| PRD AC-US-CART-002-2 | Restated without a cart id: buyer Y's cart never shows buyer X's lines. | 4 |
| PRD AC-US-CAT-001-1 | Asserted over the test's own sellers, plus "no draft anywhere in the page". | 19 |
| Phase-4 plan | Task 13's cross-module write follows D93; Task 20's routing follows D91 and D92; the gate task's architecture.md edit records D93 instead of an exception. | 16, 20, 23 |
| Release plan | §7 drops the backfill; T-002 carries D91 and D92. | 25 |

Findings 6, 8, 11–14, 17, 21, 24 are resolved inside the plan's tasks; 15 is resolved by the gate
task's ADR 010 edit; 22 was fixed on 2026-10-16.

## Impact

| Dimension | Impact |
|---|---|
| Scope | No feature added or removed. D91 changes where users land; D92 moves URLs. |
| Roadmap | T-002 grows by the `/admin` move and the landing change — still M0, still before phase 4. |
| Risks | D92 moves every console URL: the behavioural suite's paths and any bookmark change. Mitigated by permanent redirects and the suite running against the new paths. |

## Decision

- Decision: approved · Approved by: Youssef · Date: 2026-10-17
- New baseline version: **v2.1**
- Documents updated: the SRS, the PRD, the phase-4 plan, the Release 1 plan (this change).
