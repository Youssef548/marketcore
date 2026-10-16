# 014 Take one charge per checkout and split it by the ledger

- **Date:** 2026-10-16
- **Status:** Proposed
- **Phase:** 6 — gates the first payment, and phase 8's ledger postings
- **Implements:** _pending_ — `docs/superpowers/specs/2026-10-16-marketcore-storefront-srs.md` §3.5

## Context

CR-001 makes one checkout span several sellers (D56). Each seller has its own order, because the
order is the unit a seller fulfils and refunds. The buyer, though, places the checkout once. The
payment has to belong to one of the two.

The baseline put the payment on the order (`Payment.orderId`, INV-3 "an order may be paid at most
once"), which was correct while an order and a checkout were the same thing.

## Decision

**A checkout has exactly one payment, for its total. On capture, one ledger transaction splits it:
platform cash is debited by the total, and each order credits its seller's payable with the seller
share and platform revenue with the fee.**

- `Payment.checkoutId` is unique; INV-3 is restated per checkout.
- The fee is `PLATFORM_FEE_BPS` in `packages/domain`, applied per order and rounded so that the
  sum of seller shares plus fees equals the capture exactly (INV-13).
- Seller money leaves the platform only through phase-11 payouts, which already carry INV-8.
- A refund is per order: it reverses that order's seller share and fee and nothing else.

## Alternatives considered

- **One charge per seller order.** Rejected: the buyer sees several charges for one action, and the
  checkout can end half-paid — one capture succeeds, the next is declined — which reintroduces
  across payments exactly the partial outcome D57 forbids across orders.
- **Stripe Connect destination charges.** Rejected: it moves the split into the provider, so the
  ledger would record a split it did not make, and it needs connected accounts per seller —
  onboarding that real money movement (excluded) would need and this project does not.
- **Authorise per seller, capture together.** Rejected: separate authorisations can expire
  separately, so "capture together" is a hope, not a guarantee.

## Trade-offs

- **Refunds are partial by construction.** A one-seller refund on a multi-seller payment is a
  partial refund of the charge, so INV-5's cap must be checked against the payment's cumulative
  refunds under a lock, not per order.
- **The platform holds every seller's money until payout.** Correct for a marketplace, and it means
  the ledger, not the provider, is the record of who is owed what.
- **A capture can race the auto-cancel.** The capture must lock the checkout and require
  `PENDING_PAYMENT`; a capture that loses that race is refunded in full (SRS-FR-PAY-004).

## Consequences

- `docs/domain-model.md`: `Payment.checkoutId` (done in CR-001); the ledger table carries a
  multi-seller example.
- Phase 8's ledger-balance test generates multi-seller captures, not only single-order ones.
- Phase 9's refund-cap test includes two sellers' refunds racing against one payment.

## Review date

At phase 6's start, or 2027-01-16 — whichever comes first.
