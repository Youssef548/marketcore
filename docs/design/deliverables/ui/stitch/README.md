# Stitch screens — the design source for every page

The `[Senior Craft]` variants from Stitch project `3383911874392417631` ("MarketCore — Quartz
(rebuild)"), copied verbatim. Under ADR 013 (amended by CR-001) each file here is the authority for its route —
operator and storefront alike. Quartz is the token system underneath; build against
`packages/ui/src/tokens.css`, not the file's hex values. Graphite (dark) is the same layout with the
dark token values; Stitch has no dark designs.

These are a **reference, not the product.** Build each screen from its file minus the chrome for
features that have not shipped (search, cart, filter and review links in the shared header), and to
the repository's rules rather than the file's: the Quartz tokens in `packages/ui`, the contrast test,
and the 12px type floor. About 2.3% of these files' size declarations sit below that floor
(the Stitch run report); do not port them.

`002` and `071` load Tailwind from a CDN, and `002` one image from Google; the others are
self-contained apart from Google Fonts. Open them locally with a browser.

| Route | Screen | Release | File |
|---|---|---|---|
| `/signin` | Sign in (with error state) | shipped — re-skin | `040-marketcore-sign-in-error-state-senior-craft.html` |
| `/register` | Register | shipped — re-skin | `046-marketcore-register-senior-craft.html` |
| `/onboarding` | First run | shipped — re-skin | `032-marketcore-first-run-onboarding-senior-craft.html` |
| `/admin/products` | Products (seller) | shipped — re-skin | `048-marketcore-seller-products-admin-products-senior-craft.html` |
| `/admin` | Dashboard (seller) | operator | `001-marketcore-seller-overview-dashboard-admin-senior-craft.html` |
| `/admin/products/:id` | Product detail (seller) | catalog | `071-marketcore-seller-product-detail-admin-products-6642-senior-craft.html` |
| `/admin/orders` | Orders (seller) | 1 | `049-marketcore-seller-orders-admin-orders-senior-craft.html` |
| `/admin/orders/:id` | Order detail (seller) | 1 | `006-marketcore-seller-order-detail-admin-orders-1042-senior-craft.html` |
| `/admin/refunds` | Refunds (seller) | 1 | `020-marketcore-seller-refunds-admin-refunds-senior-craft.html` |
| `/admin/payouts` | Payouts (seller) | 1 | `067-marketcore-seller-payouts-admin-payouts-senior-craft.html` |
| `/admin/members` | Members | operator | `047-marketcore-seller-members-admin-members-senior-craft.html` |
| `/admin/operations` | Operations | 1 | `060-marketcore-seller-operations-admin-operations-senior-craft.html` |
| `/design/foundations` | Foundations | reference | `008-marketcore-foundations-design-foundations-senior-craft.html` |
| `/design/states` | Loading, empty, error, not found | reference | `062-marketcore-states-design-states-senior-craft.html` |
| `/browse` | Browse | 1 | `057-marketcore-browse-senior-craft.html` |
| `/p/:slug` | Product page | 1 | `077-marketcore-product-detail-senior-craft.html` |
| `/cart` | Cart | 1 | `056-marketcore-cart-senior-craft.html` |
| `/checkout` | Checkout (review step) | 1 | `028-marketcore-checkout-senior-craft.html` |
| `/orders/:id/placed` | Order placed | 1 | `063-marketcore-order-placed-senior-craft.html` |
| `/account/orders` | My orders | 1 | `017-marketcore-my-orders-senior-craft.html` |
| `/account/orders/:id` | Order detail (buyer) | 1 | `003-marketcore-order-detail-senior-craft.html` |
| `/account/addresses` | Addresses | 2 | `070-marketcore-addresses-senior-craft.html` |
| `/admin/orders/:id/fulfil` | Fulfil an order | 2 | `016-marketcore-seller-fulfil-an-order-admin-orders-1042-fulfil-senior-craft.html` |
| `/account` | Profile & security | 2 | `044-marketcore-profile-security-senior-craft.html` |
| `/account/payments` | Payment methods | 2 | `039-marketcore-payment-methods-senior-craft.html` |
| `/p/:slug/reviews` | Product reviews | 2 | `074-marketcore-product-reviews-senior-craft.html` |
| `/account/wishlist` | Wishlist | 2 | `033-marketcore-wishlist-senior-craft.html` |
| `/` | Home | 2 | `072-marketcore-home-senior-craft.html` |
| `/c/:category` | Category | 2 | `073-marketcore-category-textiles-senior-craft.html` |
| `/s/:seller` | Seller store | 2 | `036-marketcore-seller-store-nile-traders-senior-craft.html` |
| `/mobile` | Mobile layout reference | 2 | `055-marketcore-mobile-storefront-senior-craft.html` |
| `/search` | Search | 2 | `042-marketcore-search-senior-craft.html` |
| `/admin/promotions` | Promotions (seller) | 2 | `012-marketcore-seller-promotions-admin-promotions-senior-craft.html` |
| `/admin/products/new` | New product (seller) | catalog | `002-marketcore-seller-new-product-admin-products-new-senior-craft.html` |
| `/admin/products/:id/media` | Media & variants (seller) | catalog | `018-marketcore-seller-media-variants-admin-products-6642-media-senior-craft.html` |
| `/admin/inventory` | Inventory (seller) | catalog | `053-marketcore-seller-inventory-admin-inventory-senior-craft.html` |
| `/admin/settings` | Store settings (seller) | catalog | `004-marketcore-seller-store-settings-admin-settings-senior-craft.html` |

Requirements for each route: `docs/superpowers/specs/2026-10-16-marketcore-storefront-prd.md` §7.4.
