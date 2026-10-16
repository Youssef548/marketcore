# Product Requirements — MarketCore buyer storefront

**Version:** 1.0-draft · **Date:** 2026-10-16 · **Owner:** Youssef · **Status:** Baselined v2 (2026-10-16)
**Change request:** `2026-10-16-cr-001-buyer-storefront.md` (decisions D52–D74 live there)
**Extends:** `2026-09-19-marketcore-platform-design.md`, `docs/domain-model.md`

## 1. Product overview

The buyer side of MarketCore: public buyers browse every seller's published products, fill one
cart across sellers, check out once, and follow their orders. It sits beside the operator UI in
`apps/web` and talks to the API through the same BFF.

## 2. Problem statement

The consistency guarantees are proven only by tests. No buyer exists outside a fixture, so the
stock-1 race, the idempotent checkout and the split payment cannot be watched happening. A
single-seller "buy now" would leave out the hardest marketplace case: one checkout spanning
several sellers.

## 3. Goals

| ID | Business requirement |
|---|---|
| BR-001 | A buyer can buy from several sellers in one checkout, paid by one charge. |
| BR-002 | Every flagship invariant on the buyer path is demonstrable in a browser, not only in a test. |
| BR-003 | A buyer can follow an order after purchase: status, refund request, and (Release 2) delivery and review. |

## 4. Non-goals

- Guest checkout (D54).
- Stock reservations or holds (D58).
- A dedicated search engine, recommendations, or personalisation (D67).
- Platform-funded promotions (D66).
- Storing card data in MarketCore; saved cards are Stripe's (Release 2).
- Real money movement and payment providers beyond Stripe (unchanged from the baseline).

## 5. Personas

| Persona | Who | Wants |
|---|---|---|
| Buyer | A signed-in user with no organization membership needed | A purchase that either fully succeeds or fully fails, never a double charge |
| Seller | A member of an organization | Accurate stock, orders and money owed; control over refunds and reviews replies |
| Reviewer | A developer evaluating the project | To watch the invariants hold in the UI and match them to a test |

One user may be both Buyer and Seller (D54).

## 6. User journeys

1. **Buy across sellers (R1).** Browse → product page → add to cart (seller A) → add to cart
   (seller B) → cart → review step → place order → order placed (two orders, one checkout) →
   my orders.
2. **Lose the last unit (R1).** Two buyers hold the last unit in their carts → both place order →
   one succeeds; the other returns to the cart with that line flagged "Sold out" and nothing
   charged.
3. **Request a refund (R1).** My orders → order detail → request refund → seller approves on
   Refunds → buyer sees the refund status.
4. **Deliver and review (R2).** Checkout with an address → seller fulfils → order `Completed` →
   buyer reviews the product.

## 7. Product scope

### 7.1 Release 1 — with phases 4–11 (Must)

F-CAT-01, F-CART-01, F-CHK-01, F-PAY-01, F-BORD-01, F-REF-01.

### 7.2 Release 2 — after phase 11 (Should / Could)

F-DLV-01, F-ACC-01, F-SPAY-01, F-REV-01, F-WISH-01, F-DISC-01, F-SRCH-01, F-PROMO-01.

### 7.3 Out of scope

Everything in §4.

### 7.4 Screen map

The design source for each screen (D69). Every screen is its Stitch `[Senior Craft]` file in
`docs/design/deliverables/ui/stitch/`. Search, cart, filter and review links in their
shared chrome render only once the feature behind them ships.

| Route | Screen | Feature | Release | Source |
|---|---|---|---|---|
| `/browse` | Browse | F-CAT-01 | R1 | Stitch 057 |
| `/p/:slug` | Product page | F-CAT-01 | R1 | Stitch 077 |
| `/cart` | Cart | F-CART-01 | R1 | Stitch 056 |
| `/checkout` | Checkout (review step) | F-CHK-01 | R1 | Stitch 028 |
| `/orders/:id/placed` | Order placed | F-CHK-01 | R1 | Stitch 063 |
| `/account/orders` | My orders | F-BORD-01 | R1 | Stitch 017 |
| `/account/orders/:id` | Order detail (buyer) | F-BORD-01, F-REF-01 | R1 | Stitch 003 |
| `/admin/refunds` | Refunds (seller) | F-REF-01 | R1 | Stitch 020 |
| `/account/addresses` | Addresses | F-DLV-01 | R2 | Stitch 070 |
| `/admin/orders/:id/fulfil` | Fulfil an order | F-DLV-01 | R2 | Stitch 016 |
| `/account` | Profile & security | F-ACC-01 | R2 | Stitch 044 |
| `/account/payments` | Payment methods | F-SPAY-01 | R2 | Stitch 039 |
| `/p/:slug/reviews` | Product reviews | F-REV-01 | R2 | Stitch 074 |
| `/account/wishlist` | Wishlist | F-WISH-01 | R2 | Stitch 033 |
| `/` | Home | F-DISC-01 | R2 | Stitch 072 |
| `/c/:category` | Category | F-DISC-01 | R2 | Stitch 073 |
| `/s/:seller` | Seller store | F-DISC-01 | R2 | Stitch 036 |
| `/mobile` | Mobile storefront (layout reference) | F-DISC-01 | R2 | Stitch 055 |
| `/search` | Search | F-SRCH-01 | R2 | Stitch 042 |
| `/admin/promotions` | Promotions (seller) | F-PROMO-01 | R2 | Stitch 012 |

The operator screens outside this PRD — dashboard, products, orders, payouts, members, operations
and the catalog screens — are listed in `ui/stitch/README.md`.

## 8. Features and requirements

### F-CAT-01: Public catalog and product page

- **Purpose:** buyers see every seller's published products. · **Traces to:** BR-001, BR-002 · **Priority:** Must (R1)
- **User stories**
  - US-CAT-001: As a buyer, I want to browse published products from every seller, so that I can choose what to buy.
  - US-CAT-002: As a buyer, I want a product page showing price, seller and exact stock, so that I know whether I can buy it.
- **Functional requirements**

| ID | Requirement |
|---|---|
| PRD-FR-CAT-001 | The system must list `PUBLISHED` products from every organization to any signed-in user. |
| PRD-FR-CAT-002 | The system must never return a `DRAFT` product, or any product field outside RULE-CAT-001, on a public read. |
| PRD-FR-CAT-003 | The product page must show name, price, currency, seller name and the current stock count. |

- **Business rules:** RULE-CAT-001 — public product fields are: id, slug, name, priceMinor, currency, seller name and slug, stock count, status. Everything else stays tenant-private.
- **Acceptance criteria**
  - AC-US-CAT-001-1: Given organizations A and B each with one published and one draft product, When a buyer with no membership opens Browse, Then exactly the two published products appear.
  - AC-US-CAT-001-2: Given a draft product id from organization A, When a buyer requests it publicly, Then the response is 404.
  - AC-US-CAT-002-1: Given a published product with stock 1, When a buyer opens its page, Then it shows "1 left" and the seller's name.

### F-CART-01: Multi-seller cart

- **Purpose:** one cart across sellers, holding intent only. · **Traces to:** BR-001 · **Priority:** Must (R1)
- **User stories**
  - US-CART-001: As a buyer, I want to add products from several sellers to one cart, so that I check out once.
  - US-CART-002: As a buyer, I want the cart to show each line's current availability and price, so that I can fix problems before checkout.
- **Functional requirements**

| ID | Requirement |
|---|---|
| PRD-FR-CART-001 | The system must keep one server-side cart per buyer, readable from any device the buyer signs into. |
| PRD-FR-CART-002 | Adding to the cart must not change stock (D58). |
| PRD-FR-CART-003 | Each cart line must show its current price and current availability: "Only N left" when N is below the line quantity, "Sold out" when N is 0. |
| PRD-FR-CART-004 | The cart must group lines by seller. |
| PRD-FR-CART-005 | A buyer must be able to change a line's quantity or remove it. |
| PRD-FR-CART-006 | The system must refuse a line quantity above 10 (D72). |

- **Business rules:** RULE-CART-001 — a cart line quantity is an integer from 1 to 10 (D72). RULE-CART-002 — a buyer reads and changes only their own cart (INV-12).
- **Acceptance criteria**
  - AC-US-CART-001-1: Given products from sellers A and B, When the buyer adds both, Then the cart shows two seller groups and stock for both products is unchanged.
  - AC-US-CART-002-1: Given a cart line of quantity 2 whose stock drops to 1, When the buyer opens the cart, Then the line shows "Only 1 left".
  - AC-US-CART-001-2: Given a cart line of quantity 10, When the buyer adds one more, Then the request is refused and the line stays at 10.
  - AC-US-CART-002-2: Given buyer X's cart id, When buyer Y requests it, Then the response is 404.

### F-CHK-01: All-or-nothing checkout

- **Purpose:** one checkout creates one order per seller, or none. · **Traces to:** BR-001, BR-002 · **Priority:** Must (R1)
- **User stories**
  - US-CHK-001: As a buyer, I want one review step listing any price or stock change, so that I confirm the final total once.
  - US-CHK-002: As a buyer, I want my checkout to either place every seller's order or none, so that I never get half an order.
  - US-CHK-003: As a buyer, I want a retried "Place order" to never create a second checkout, so that a double click or a network retry is harmless.
- **Functional requirements**

| ID | Requirement |
|---|---|
| PRD-FR-CHK-001 | Before "Place order", the review step must list every line whose price differs from when it was added, and every line short of stock. |
| PRD-FR-CHK-002 | "Place order" must be disabled until the buyer confirms the listed changes. |
| PRD-FR-CHK-003 | Placing an order must lock every inventory row in the cart, check every line, decrement stock and create one order per seller in one transaction. |
| PRD-FR-CHK-004 | If any line is short of stock at that moment, the system must create no order, change no stock, and return the buyer to the cart with the failing lines flagged. |
| PRD-FR-CHK-005 | Each order must snapshot its unit prices; its total must not change after creation. |
| PRD-FR-CHK-006 | "Place order" must carry an idempotency key scoped to the buyer; repeats with the same key must return the same checkout. |
| PRD-FR-CHK-007 | Until phase 6, orders are created `Pending payment` and the placed screen says payment is not yet collected (D62). |
| PRD-FR-CHK-008 | A checkout still unpaid 30 minutes after placement must move all its orders to `Cancelled` and restore their stock, once (D70). |

- **Business rules:** RULE-CHK-001 — one checkout, one currency; the review step refuses a cart mixing currencies (D71). RULE-CHK-002 — inventory rows lock in product-id order.
- **Acceptance criteria**
  - AC-US-CHK-001-1: Given a line whose price rose after it was added, When the buyer opens the review step, Then the old and new price are shown and "Place order" is disabled until confirmed.
  - AC-US-CHK-002-1: Given a cart with lines from sellers A, B and C, When the buyer places the order, Then exactly three orders exist, all linked to one checkout.
  - AC-US-CHK-002-2: Given the same cart where seller C's line is short by one unit, When the buyer places the order, Then zero orders exist, all three stocks are unchanged, and the buyer is on the cart with C's line flagged.
  - AC-US-CHK-002-3: Given one unit in stock and 100 buyers with it in their carts, When all place the order concurrently, Then exactly one checkout succeeds, stock is 0, and 99 buyers see "Sold out".
  - AC-US-CHK-002-4: Given a checkout placed 30 minutes ago and never paid, When the cancellation runs twice, Then every order is `Cancelled` and each product's stock is restored exactly once.
  - AC-US-CHK-002-5: Given a cart with one EGP and one USD line, When the buyer opens the review step, Then "Place order" is disabled with a mixed-currency message.
  - AC-US-CHK-003-1: Given 20 "Place order" requests with one key, When they complete, Then one checkout and one set of orders exist.

### F-PAY-01: One charge, split by the ledger

- **Purpose:** the buyer pays once; each seller is owed their share. · **Traces to:** BR-001 · **Priority:** Must (R1, phases 6–8)
- **User stories**
  - US-PAY-001: As a buyer, I want to pay one charge for a multi-seller checkout, so that I see one payment.
  - US-PAY-002: As a seller, I want my share of a checkout credited to my balance, so that my payout is correct.
- **Functional requirements**

| ID | Requirement |
|---|---|
| PRD-FR-PAY-001 | A checkout must have at most one captured payment (INV-3 as amended). |
| PRD-FR-PAY-002 | On capture, the ledger must credit each seller's payable with their order total minus the platform fee, in one balanced transaction. |
| PRD-FR-PAY-003 | Each order must move to `Paid` when its checkout's payment is captured. |

- **Business rules:** RULE-PAY-001 — the seller shares plus the platform fee equal the captured amount (INV-13).
- **Acceptance criteria**
  - AC-US-PAY-001-1: Given a checkout of two orders (E£249.00 and E£189.00), When payment is captured, Then one payment of E£438.00 exists and both orders are `Paid`.
  - AC-US-PAY-002-1: Given that capture, When the ledger transaction is read, Then its signed entries sum to zero and each seller's credit equals their order total minus the fee.

### F-BORD-01: Buyer orders

- **Purpose:** the buyer follows every order they placed. · **Traces to:** BR-003 · **Priority:** Must (R1)
- **User stories**
  - US-BORD-001: As a buyer, I want to list my orders across sellers, so that I can follow them.
  - US-BORD-002: As a buyer, I want an order detail with items, total, seller and status, so that I know where it stands.
- **Functional requirements**

| ID | Requirement |
|---|---|
| PRD-FR-BORD-001 | The system must list only orders whose buyer is the signed-in user, newest first. |
| PRD-FR-BORD-002 | Order detail must show items, unit prices, total, seller, status and the checkout it belongs to. |

- **Business rules:** RULE-BORD-001 — a buyer reads orders by buyer id only, never by organization (INV-12).
- **Acceptance criteria**
  - AC-US-BORD-001-1: Given buyers X and Y with orders, When X lists orders, Then none of Y's appear.
  - AC-US-BORD-002-1: Given Y's order id, When X requests it, Then the response is 404.

### F-REF-01: Buyer refund request

- **Purpose:** the buyer asks; the seller decides. · **Traces to:** BR-003 · **Priority:** Must (R1, phase 9)
- **User stories**
  - US-REF-001: As a buyer, I want to request a refund on a paid order, so that I can get my money back.
  - US-REF-002: As a seller, I want to approve or reject refund requests, so that I control refunds of my orders.
- **Functional requirements**

| ID | Requirement |
|---|---|
| PRD-FR-REF-001 | A buyer must be able to request a refund only on their own `Paid`, `Fulfilling` or `Completed` order. |
| PRD-FR-REF-002 | The request must appear on that seller's Refunds screen as `Requested`. |
| PRD-FR-REF-003 | Approval must run the phase-9 refund against the checkout's payment, for that order's amount only. |
| PRD-FR-REF-004 | Rejection must move the refund to `Rejected` and show it to the buyer. |

- **Business rules:** RULE-REF-001 — refunds against one checkout payment never exceed the captured total (INV-5), and a seller's refund never exceeds that seller's order total.
- **Acceptance criteria**
  - AC-US-REF-001-1: Given a `Pending payment` order, When the buyer requests a refund, Then it is refused.
  - AC-US-REF-002-1: Given a two-seller checkout, When seller A approves a full refund of A's order, Then the refund equals A's total and seller B's balance is unchanged.

### Release 2 features

Stories and rules below are agreed scope; their full acceptance criteria are written when Release 2
is planned, against the same quality bar.

| Feature | Stories | Key rules |
|---|---|---|
| **F-DLV-01** Addresses and delivery | US-DLV-001 buyer keeps an address book; US-DLV-002 buyer picks an address at checkout; US-DLV-003 seller fulfils an order (`Paid → Fulfilling → Completed`) | Address is snapshotted onto the order; a seller sees only the address of their own order |
| **F-ACC-01** Profile and security | US-ACC-001 buyer edits name; US-ACC-002 buyer changes password, revoking other sessions | Password change revokes every other session |
| **F-SPAY-01** Saved payment methods | US-SPAY-001 buyer saves and removes a card for later checkouts | Card data held by Stripe only; MarketCore stores the Stripe reference `[ASM-002]` |
| **F-REV-01** Reviews | US-REV-001 verified buyer reviews a product; US-REV-002 seller replies | One review per buyer per product, only after a `Completed` order containing it; sellers cannot delete (D65) |
| **F-WISH-01** Wishlist | US-WISH-001 buyer saves products for later and moves them to the cart | Wishlist never affects stock |
| **F-DISC-01** Discovery | US-DISC-001 home; US-DISC-002 category; US-DISC-003 seller store; US-DISC-004 mobile layout | Same public-field rule as RULE-CAT-001 |
| **F-SRCH-01** Search | US-SRCH-001 buyer searches published products by text | Postgres full-text only (D67); drafts never match |
| **F-PROMO-01** Promotions | US-PROMO-001 seller creates a percentage or fixed code; US-PROMO-002 buyer applies a code at the review step | Seller-funded; discount snapshotted on the order; reduces only that seller's ledger share (INV-14) |

## 9. Business rules (consolidated)

RULE-CAT-001, RULE-CART-001, RULE-CART-002, RULE-CHK-001, RULE-CHK-002, RULE-PAY-001,
RULE-BORD-001, RULE-REF-001 — as stated in §8.

## 10. Success metrics

| Metric | Target | Proven by |
|---|---|---|
| Stock-1 race through the buyer checkout | 100 concurrent checkouts → 1 success, stock 0, 99 "Sold out" — every run | AC-US-CHK-002-3, integration test |
| All-or-nothing checkout | 0 orders and 0 stock change on any failing line | AC-US-CHK-002-2 |
| Split payment balances | Every capture's ledger transaction sums to 0 | AC-US-PAY-002-1 |
| Cross-buyer isolation | Every cross-buyer read returns 404 | AC-US-CART-002-2, AC-US-BORD-002-1 |
| Public catalog leaks nothing private | Every draft read returns 404 | AC-US-CAT-001-2 |

## 11. Dependencies

Phase 4 (checkout transaction) · the phase-4 worker (D70's cancellation) · phase 5 (idempotency, rescoped to buyer) · phases 6–8 (payment,
Stripe, ledger) · phase 9 (refunds) · the committed Stitch files (D69).

## 12. Risks

RISK-001 … RISK-005 in CR-001.

## 13. Assumptions

| ID | Assumption |
|---|---|
| ASM-001 | Published product fields and stock count are public data, not a tenant leak. |
| ASM-002 | Saved cards are held by Stripe; MarketCore stays out of PCI scope. |
| ASM-003 | The platform fee is one percentage applied per seller order. |

## 14. Open issues

None at baseline. Resolved during review:

| Was | Resolution |
|---|---|
| OPEN-1 mixed currencies | D71 — one currency per checkout |
| OPEN-2 abandoned unpaid checkout | D70 — auto-cancel after 30 minutes, stock restored |
| OPEN-3 line quantity cap | D72 — 10 per line |


## 15. Glossary

| Term | Meaning |
|---|---|
| Checkout | One buyer's "Place order" action: groups one order per seller and owns the single payment. |
| Seller share | An order's total minus the platform fee, credited to the seller's payable. |
| Public field | A product field readable by any signed-in user (RULE-CAT-001). |
