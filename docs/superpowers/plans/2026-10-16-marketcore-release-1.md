# MarketCore Release 1 — the buyer storefront — Development Plan

**Based on:** PRD baseline v2 (`specs/2026-10-16-marketcore-storefront-prd.md`), SRS 1.0
(`specs/2026-10-16-marketcore-storefront-srs.md`), CR-001, ADRs 0001 and 010 (amended), 013 (amended), 014.

This is the release-level plan: epics, tasks, order, gates and the test behind each acceptance
criterion. It is **not** the step-by-step plan an executor follows. Each phase gets its own detailed
TDD plan in this folder, written immediately before the phase starts — the same just-in-time rule the
ADRs follow — because a step-level plan written four phases early describes code that does not exist
yet.

No dates (D16). Sizes are relative: S ≈ a day, M ≈ two to three, L ≈ a week.

## 1. Epics

| Epic | Description | PRD features | Phase |
|---|---|---|---|
| EP-RESKIN | The four shipped pages on their Stitch layouts | — (D74) | before 4 |
| EP-CAT | Public catalog and product page | F-CAT-01 | 4 |
| EP-CART | Server-side multi-seller cart | F-CART-01 | 4 |
| EP-CHK | All-or-nothing checkout, review step, placed screen | F-CHK-01 | 4 |
| EP-WORKER | `apps/worker` and the auto-cancel job | F-CHK-01 (D70) | 4 |
| EP-BORD | Buyer orders | F-BORD-01 | 4 |
| EP-IDEM | Buyer-scoped idempotency on checkout | F-CHK-01 | 5 |
| EP-PAY | One charge per checkout, ledger split | F-PAY-01 | 6–8 |
| EP-REF | Buyer refund requests, seller approval | F-REF-01 | 9 |

Phases 10–11 (outbox and queues, payouts, audit) continue as already planned; Release 1 changes only
what they consume — a checkout's payment instead of an order's.

## 2. Tasks

| Task | Description | Story | SRS | Size | Depends on |
|---|---|---|---|---|---|
| T-001 | Re-skin sign in, register, onboarding, products to Stitch 040/046/032/048 — **done**, `49f763a` | — | SRS-NFR-A11Y-001 | M | — |
| T-002 | Re-skin the shared shell (left rail, top bar) to the Stitch dashboard (001): grouped rail, breadcrumb top bar, user chip. Only chrome that works ships — no search, ⌘K or notifications until a feature backs them. The top bar's `h1` moves into the page header, and the behavioural test that reads it moves with it. Also moves the console to `/admin` with permanent redirects (D92), and lands every signed-in user on the storefront, the first-run screen becoming **Start selling** (D91). | — | SRS-NFR-A11Y-001 | M | T-001 |
| T-010 | `packages/domain`: `BuyerContext`, `buyerScope`, `PLATFORM_FEE_BPS`, checkout and order transitions incl. `CANCELLED` — **done**, `e1ea94f` (#59) | US-CHK-002 | SRS-FR-BORD-003, D78 | S | — |
| T-011 | `packages/contracts`: `PublicProduct` (strict), cart, checkout, buyer-order schemas; the 409 `details.lines` shape — **done**, `6635a29` (#62) | US-CAT-002, US-CHK-002 | SRS-FR-CAT-003, SRS-FR-CHK-003 | M | — |
| T-012 | Migration: `Cart`, `CartItem` (CHECK 1–10), `Checkout`, `Order` + `OrderItem` with `checkoutId`; indexes — **done**, `81e0a32` (#63) | — | §6 | M | T-010 |
| T-013 | `BuyerGuard` building `BuyerContext` on `@TenantFree()` routes — **done**, `11f6464` (#64) | US-BORD-001 | D75 | S | T-010 |
| T-020 | `GET /storefront/products[/:id]`, published only, through `PublicProduct` — **done**, `9574ba6` (#67) | US-CAT-001, -002 | SRS-FR-CAT-001 … 004 | M | T-011, T-012 |
| T-021 | Web: browse and product page (Stitch 057, 077) via the BFF — **done**, `12a3abe` (#82) | US-CAT-001, -002 | — | M | T-002, T-020 |
| T-030 | `GET /cart`, `PUT`/`DELETE /cart/items/:productId`, live availability, seller grouping — **done**, `36b4b0e` (#69) | US-CART-001, -002 | SRS-FR-CART-001 … 007 | M | T-012, T-013 |
| T-031 | Web: cart (Stitch 056) with "Only N left" / "Sold out" lines — **done**, `8a9fb65` (#83) | US-CART-002 | — | M | T-021, T-030 |
| T-040 | `POST /checkouts`: ordered row locks, confirmed-price check, one order per seller, cart emptied, all or nothing, deadlock retry — **done**, `b357c25` (#77) + `9481f76` (#78) + retry `483b515` (#71) | US-CHK-001, -002 | SRS-FR-CHK-001 … 007, §8 | L | T-030 |
| T-041 | `GET /checkouts/:id` — **done**, `9481f76` (#78) | US-CHK-002 | SRS-FR-CHK-009 | S | T-040 |
| T-042 | Web: review step and placed screen (Stitch 028, 063); a 409 returns to the cart with lines flagged — **done**, `2676ea8` (#84) | US-CHK-001, -002 | — | M | T-031, T-040 |
| T-050 | `apps/worker` scaffold on `packages/runtime`; `check-db-env.mjs` covers `apps/worker/.env` — **done**, `009b13e` (#73) | — | §10, ADR 0001 | S | — |
| T-051 | Auto-cancel job: conditional update, `SKIP LOCKED`, stock restore, one log line per run — **done**, `20e2a6b` (#74) | US-CHK-002 | SRS-FR-CXL-001 … 004 | M | T-040, T-050 |
| T-060 | `GET /buyer/orders[/:id]` through `buyerScope` — **done**, `f286ec4` (#80) | US-BORD-001, -002 | SRS-FR-BORD-001 … 003 | S | T-040 |
| T-061 | Web: my orders and buyer order detail (Stitch 017, 003) — **done**, `66c4031` (#85) | US-BORD-001, -002 | — | M | T-042, T-060 |
| T-070 | Idempotency: `IdempotencyKey (buyerId, key)`, replay and body-mismatch | US-CHK-003 | SRS-FR-CHK-008 | M | T-040 |
| T-080 | Payment per checkout through the simulator; capture locks the checkout; capture-after-cancel refunds | US-PAY-001 | SRS-FR-PAY-001, -003, -004 | L | T-051, T-070 |
| T-081 | Ledger posting of the split (seller shares + fee) | US-PAY-002 | SRS-FR-PAY-002 | M | T-080, phase 8 ledger |
| T-082 | Web: payment step on the review screen | US-PAY-001 | — | M | T-042, T-080 |
| T-090 | `POST /buyer/orders/:id/refund-requests`; `approve`/`reject` (`@OwnerOnly`); per-order ledger reversal | US-REF-001, -002 | SRS-FR-REF-001 … 004 | L | T-081, phase 9 refunds |
| T-091 | Web: request refund on buyer order detail; approve/reject on Refunds (Stitch 020) | US-REF-001, -002 | — | M | T-061, T-090 |

## 3. Dependencies and critical path

```
T-001 ─────────────────────────────┐
T-010 ─▶ T-012 ─▶ T-030 ─▶ T-040 ─▶ T-051 ─▶ T-080 ─▶ T-081 ─▶ T-090
T-011 ─▶ T-020 ─┘          │  └──▶ T-070 ──┘
T-013 ─────────────────────┘  T-050 ─┘
```

**Critical path:** T-010 → T-012 → T-030 → T-040 → T-051 → T-080 → T-081 → T-090. T-040 is the
riskiest task in the release (ordered locks across sellers, all-or-nothing, deadlock retry) and gets
its own concurrency suite before any web work depends on it. Web tasks run beside the API path once
their endpoint exists.

## 4. Milestones

| Milestone | Demonstrable outcome | Requirements covered | Gate command |
|---|---|---|---|
| M0 — one look | The four shipped pages and the shared shell on Stitch layouts, both themes | D74 | `pnpm turbo run lint typecheck test build`, behavioural suite |
| M1 — phase-4 gate | A buyer fills a two-seller cart and places one checkout; the stock-1 race passes 20 runs in a row; a short line creates nothing; an abandoned checkout restocks once | F-CAT, F-CART, F-CHK, F-BORD, D70 | `pnpm --filter api test:concurrency`, `test:integration`, `test:e2e`; `pnpm --filter worker test:integration` — **met 2026-10-17**, all four suites green from a clean DB; evidence in the Phase 4 entry of `docs/superpowers/STATUS.md` |
| M2 — phase-5 gate | 20 repeats of one key make one checkout | SRS-FR-CHK-008 | `pnpm --filter api test:e2e` |
| M3 — phases 6–8 gate | One charge pays a two-seller checkout; the ledger split sums to zero; capture-after-cancel refunds | F-PAY-01 | `pnpm --filter api test:integration` |
| M4 — phase-9 gate | A buyer's refund request, approved by one seller, leaves the other seller untouched; racing refunds never exceed the capture | F-REF-01 | `pnpm --filter api test:integration` |

Release 1 is done at M4. Release 2 starts after phase 11's gate.

## 5. Release criteria

- **Every acceptance criterion in PRD §8 (Release 1) has a passing test**, named in §6, and its
  output is recorded in `docs/superpowers/STATUS.md` under **Proven**.
- **Quality gates per milestone:** whole-repo `pnpm turbo run lint typecheck test build` green; the
  behavioural suite green for any milestone with web work; no test weakened to pass (AGENTS.md).
- **Sign-off:** the milestone's STATUS entry, with its "Not proven / deferred" list.

## 6. Testing plan

Lowest layer that can falsify the claim (AGENTS.md verification ladder). Every test runs against
real PostgreSQL (failure-scenarios §4).

| Acceptance criterion / NFR | Test | Level | Task |
|---|---|---|---|
| AC-US-CAT-001-1 | Two orgs, published + draft each; browse returns the two published | API e2e | T-020 |
| AC-US-CAT-001-2 | Draft id on the public route → 404 | API e2e | T-020 |
| AC-US-CAT-002-1 | Stock 1 shows `available: 1` and seller name | API e2e + web unit | T-020, T-021 |
| SRS-NFR-SEC-001 | `PublicProduct` rejects an extra key | contracts unit | T-011 |
| AC-US-CART-001-1 | Two-seller cart, stock unchanged | API e2e | T-030 |
| AC-US-CART-001-2 | Quantity 11 refused | contracts unit + API e2e | T-011, T-030 |
| AC-US-CART-002-1 | Stock drops below quantity → `SHORT` | API e2e | T-030 |
| AC-US-CART-002-2 | Buyer Y reads X's cart → 404, with control | API e2e | T-030 |
| AC-US-CHK-001-1 | Price rose → 409 `PRICE_CHANGED`; web shows old and new price | API e2e + web unit | T-040, T-042 |
| AC-US-CHK-002-1 | Three sellers → three orders, one checkout | integration | T-040 |
| AC-US-CHK-002-2 | One line short → 0 orders, stocks unchanged, cart unchanged | integration | T-040 |
| AC-US-CHK-002-3 / SRS-NFR-REL-001 | 100 concurrent on stock 1, 20 consecutive runs | concurrency | T-040 |
| SRS-NFR-REL-002 | 50 overlapping carts over 3 products, no deadlock reaches the client | concurrency | T-040 |
| AC-US-CHK-002-4 / SRS-NFR-REL-003 | Two parallel runs over expired checkouts restore once | worker integration | T-051 |
| AC-US-CHK-002-5 | Mixed currencies → 400 before any lock | API e2e | T-040 |
| AC-US-CHK-003-1 | 20 repeats, one key → one checkout | API e2e | T-070 |
| AC-US-BORD-001-1, -002-1 | Cross-buyer list and detail → none / 404, with control | API e2e | T-060 |
| AC-US-PAY-001-1, -002-1 | One payment of the total; split sums to zero | integration | T-080, T-081 |
| SRS-FR-PAY-004 | Capture after auto-cancel → full refund, no order `PAID` | integration | T-080 |
| AC-US-REF-001-1 | Refund on `PENDING_PAYMENT` refused | API e2e | T-090 |
| AC-US-REF-002-1 | Seller A's refund leaves seller B's balance unchanged | integration | T-090 |
| Journeys 1–3 (PRD §6) | Buy across sellers; lose the last unit; request and approve a refund | behavioural (Playwright) | T-042, T-061, T-091 |

## 7. Deployment plan

Local and CI only in Release 1; AWS arrives in phase 14 as already planned.

- **Migrations** are additive (new tables; `Order` is new in phase 4, so its `checkoutId` is `NOT NULL`
  from the first migration — nothing to backfill, CR-002). Rollback is the previous migration plus a reset of the dev database; no production data
  exists to migrate.
- **CI** runs the worker's integration suite from phase 4, which needs `apps/worker/.env` covered by
  `check-db-env.mjs` (T-050) before the first worker test lands.
- **Compose:** `docker-compose.e2e.yml` gains the worker service at M1, so the behavioural suite runs
  the abandoned-checkout path against the real process.

## 8. Next detailed plan

`2026-10-16-marketcore-stitch-reskin.md` (EP-RESKIN, M0) if the re-skin needs one, then
`…-phase-4-cart-checkout.md` covering T-010 … T-061 in TDD steps, written when M0 closes.
