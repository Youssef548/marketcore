# CR-001: Add a buyer storefront

**Raised by:** Youssef · **Date:** 2026-10-16 · **Against baseline:** the 2026-09-19 platform spec (D1–D51)
**Status:** Approved — baseline v2
**Requirements:** `2026-10-16-marketcore-storefront-prd.md`

## Requested change

Reverse the exclusion *"Deliberately excluded — a consumer storefront (the web app is an operator
UI, not a shop)"* (README, Roadmap) and the matching non-goal in `docs/architecture.md` ("The plan's
non-goals exclude a consumer interface"). Add a full buyer storefront: a multi-seller marketplace
where public buyers browse every organization's published products, fill one cart across sellers,
and check out once.

The screens are the Stitch `[Senior Craft]` set (project `3383911874392417631`), 37 routes.

## Need / justification

The flagship claims — the stock-1 race, the idempotent checkout, the duplicate webhook, the
balanced ledger — are proven by tests a reviewer must read. A storefront makes them observable in
a browser. A **multi-seller** cart also adds a correctness problem the baseline does not have: one
checkout that must create every seller's order or none, paid by one charge split across sellers.

Not doing it: the project stays an operator console whose buyer is a test fixture.

## Decisions recorded

Numbered after the platform and week-02 specs, which end at D51.

| ID | Decision |
|---|---|
| D52 | A full buyer storefront is in scope. All 37 Stitch routes, in two releases (D68). |
| D53 | A multi-seller marketplace. A buyer is a user with no organization membership and sees every organization's **published** products. |
| D54 | Buying requires an account; there is no guest checkout. One user may be a buyer and a seller member at once. |
| D55 | The cart lives on the server, one per buyer, and may hold products from many sellers. |
| D56 | One checkout creates **one order per seller**. A new `Checkout` aggregate groups those orders and owns the payment. |
| D57 | Checkout is **all or nothing**: if any line fails, no order is created and nothing is charged. |
| D58 | **No reservations.** The cart records intent only; checkout locks the inventory rows, checks every line and decrements in one transaction. |
| D59 | The cart shows live availability per line ("Only N left", "Sold out"). A checkout that fails on stock returns the buyer to the cart with the failing lines flagged. |
| D60 | One review step before "Place order" lists every price change and stock problem; the buyer confirms once. |
| D61 | The exact stock count is public on published products. |
| D62 | Phase 4 ships checkout as "Place order" (orders created `Pending payment`); the payment step arrives in phases 6–7. |
| D63 | One buyer charge per checkout; the ledger credits each seller's share and payouts move it (separate charges and transfers). |
| D64 | A buyer may request a refund; the seller approves or rejects it on the existing Refunds screen. |
| D65 | Only verified buyers review: one review per buyer per product, after an order containing it is `Completed`. A seller may reply, not delete. |
| D66 | Promotions are seller-created percentage or fixed codes, funded by that seller only. |
| D67 | Search is Postgres full-text over published products. A dedicated search engine stays a non-goal. |
| D68 | **Release 1:** public catalog, product page, cart, checkout, order placed, buyer orders, refund request — alongside phases 4–11. **Release 2:** addresses and delivery, account and saved payments, reviews, wishlist, discovery (home, category, search, seller store, mobile), promotions — after phase 11. |
| D69 | Stitch is the design source for **every** screen, operator and storefront: 37 `[Senior Craft]` files committed to `docs/design/deliverables/ui/stitch/`. Quartz stays the token system they are built on. `design-board.html` and its generator are deleted. ADR 013 is amended. |
| D70 | A checkout unpaid 30 minutes after placement is cancelled by the worker: its orders go `Cancelled` and stock is restored, exactly once. The worker moves forward to phase 4 as a plain interval process (no Redis, no queue); exactly-once comes from a conditional update on the checkout's status. Phase 10 adds queues to the same process. |
| D71 | One currency per checkout; the review step refuses a mixed-currency cart. |
| D72 | A cart line holds at most 10 units. |
| D73 | Graphite stays as a token set; Stitch layouts render dark by swapping values, with no separate dark design. |
| D74 | The four shipped pages (sign in, register, onboarding, products) are re-skinned to their Stitch layouts before phase 4. |

**Rejected during analysis:** reserving stock at add-to-cart with a 15-minute expiry. It moved the
flagship race to add-to-cart, let one account hold every unit, and added an expiry-mid-checkout
failure, for no gain in what is proven. D58 replaces it.

## Impact analysis

| Dimension | Impact |
|---|---|
| Scope | Adds PRD features F-CAT-01 … F-PROMO-01 (14 features). Adds BR-001 … BR-003. Changes INV-2, INV-3, INV-9 (below). Adds INV-11 … INV-15. |
| Complexity | **XL.** Release 1 alone is L: a second authorization path, a cross-tenant transaction, and a split payment. |
| Domain model | New: `Cart`, `CartItem`, `Checkout`. Release 2: `Address`, `Review`, `WishlistItem`, `Promotion`, `Category`. `Order` keeps `organizationId` (one seller) and gains `checkoutId`. `Payment.orderId` becomes `Payment.checkoutId`. `Inventory.reserved` stays unused (D58). Refund gains a `Rejected` state and a `Requested` entry by the buyer. Order gains `Cancelled` from `Pending payment` for an abandoned payment. |
| Invariants | **INV-2:** the idempotency key is scoped `(organizationId, key)`; a buyer checkout spans organizations, so it becomes `(buyerId, key)`. **INV-3:** "an order may be paid at most once" becomes "a checkout may be paid at most once". **INV-9:** narrowed — published product fields and stock are public by design; drafts, orders, members and ledger stay private. |
| New invariants | **INV-11** a checkout creates every seller's order or none. **INV-12** a buyer reads only their own orders and cart. **INV-13** the seller shares of a checkout sum to the captured amount minus the platform fee. **INV-14** a seller-funded discount reduces only that seller's order total and ledger share. **INV-15** an abandoned checkout restores its stock exactly once (D70). |
| Architecture / ADRs | ADR 010 (tenant isolation in the query layer) amended with a public read path and a buyer-scoped path. ADR 0001 amended (worker from phase 4). ADR 013 amended (D69, D73). ADR 014 for the split charge (D63). |
| Roadmap | A re-skin of the four shipped pages comes before phase 4 (D74). Phase 4 gains the cart, multi-seller checkout and the first worker job (D70). Phase 5 rescopes the idempotency key. Phase 6–8 pay and post a checkout, not an order. Release 2 is new work after phase 11, before phases 12–15. |
| Cost | No new infrastructure: full-text search stays in Postgres, saved cards stay with Stripe. |
| Documents to update on approval | README (Roadmap, exclusions, Honest limitations), `docs/architecture.md` (stakeholders, non-goals, module table), `docs/domain-model.md` (entities, invariants, state machines), ADR 013, `docs/design/deliverables/README.md`, `.gitignore` for the Stitch folder. |

## Risks

| ID | Risk | Mitigation |
|---|---|---|
| RISK-001 | The public catalog reads as a broken tenant-isolation claim. | Write the public/private field rule down; test both sides — public fields readable cross-tenant, private ones still 404. |
| RISK-002 | A second authorization path (by buyer) on the order table leaks one buyer's orders to another. | INV-12 with its own cross-buyer e2e test, the control case included. |
| RISK-003 | A multi-seller checkout locks many inventory rows and deadlocks under concurrency. | Lock rows in a fixed order (by product id); a concurrency test with overlapping carts. |
| RISK-004 | Scope is the whole storefront with no timeline. | Release 1 is bound to the invariant phases; Release 2 cannot start before phase 11 closes. |
| RISK-005 | The Stitch files carry out-of-scope chrome and below-12px type (2.3% of declarations, Stitch REPORT). | Build from them minus that chrome; the 12px floor is a test, not a review note. |

## Options

1. Accept into the current roadmap as one block.
2. **Accept in two releases (D68).**
3. Accept Release 1 only; defer Release 2 to a later CR.
4. Reject.

**Recommendation:** option 2 — chosen during analysis. Release 1 is the part that strengthens the
North Star; Release 2 is committed scope but cannot delay the invariant phases.

## Decision

- Decision: option 2, two releases · Approved by: Youssef · Date: 2026-10-16
- New baseline version: **v2** — the 2026-09-19 platform spec plus this CR and the storefront PRD.
  Any later change to scope is CR-002 onward.
- Documents updated: this CR and `2026-10-16-marketcore-storefront-prd.md`. **Still to update:**
  README, `docs/architecture.md`, `docs/domain-model.md`, ADR 013, `docs/design/deliverables/README.md`,
  and committing the Stitch files (D69) — listed under Impact analysis.
