# Stitch prompts — MarketCore

**Import `DESIGN.md` into the project first.** It carries the rules — tokens, type, contrast,
components. These prompts carry the scope. Without the rules file Stitch will invent a look;
without these prompts it will invent the screens, and stop after a handful.

## How to use this

Stitch generates a bounded number of screens per prompt — around five. So this is
11 generations, not one, grouped by flow so each batch is a set of screens that
link to one another. Keep one Stitch project and paste one batch at a time; the later batches
will inherit the tokens and components from the first.

Every prompt names its surface and its chrome, because the chrome is the difference that
matters: **a buyer screen never has the rail.** A buyer belongs to no organization, so a rail
would assert a membership that does not exist — and the checkout carries no
`x-organization-id`.

Surfaces, for reference:

- **auth** — Seller console, auth — full-page, centred card on the app canvas. No rail, no top bar.
- **console** — Seller console — 252px dark rail on the left, 64px breadcrumb top bar. A tenant screen.
- **shop** — Buyer storefront — 64px public bar plus a 44px horizontal category bar. No rail, no organization name anywhere: a buyer belongs to no tenant.
- **acct** — Buyer account — the storefront chrome plus a 246px left account nav. No rail, no organization name.
- **doc** — Reference sheet — a plain documentation page on the app canvas. No rail, no top bar.

---

## Batch 1 of 11 — auth: the three screens a user meets before the app

`signin` · `register` · `onboarding`

3 screens in one generation.

### `signin` — Sign in

**Surface:** Reference sheet — a plain documentation page on the app canvas. No rail, no top bar.

**Prompt:**

> Sign in. Centred 392px card: MarketCore logo mark and wordmark, heading "Sign in", sub-line "Use your organization account to continue." A labelled Email field prefilled owner@marketcore.test; a labelled Password field. Then an inline error banner reading "That email and password don't match an account." A full-width primary "Sign in" button, and "No account? Create one" beneath it. This is the error state — show it, do not show the happy path.

### `register` — Register

**Surface:** Reference sheet — a plain documentation page on the app canvas. No rail, no top bar.

**Prompt:**

> Create account. Same centred card. Heading "Create your account", sub-line "12 characters or more — a policy, not a suggestion." Labelled Email field (placeholder you@company.test) and a Password field whose helper text reads "12+ code points · shown as a hint, linked by aria-describedby". Full-width "Create account" button. Footer "Already have one? Sign in".

### `onboarding` — First run

**Surface:** Reference sheet — a plain documentation page on the app canvas. No rail, no top bar.

**Prompt:**

> First run — "You're not in an organization yet". A single centred card shown INSTEAD of the console shell, never inside it: without a tenant every control in the shell would be inert. Heading "You're not in an organization yet"; body copy explaining that MarketCore keeps products, orders and money inside an organization and that creating one makes you its owner. Exactly one field: Organization name, placeholder Nile Traders. One full-width "Create organization" button. Footer "Wrong account? Sign out".

---

## Batch 2 of 11 — buyer discovery: find something to buy

`shop-home` · `storefront` · `shop-category` · `shop-search` · `shop-seller`

5 screens in one generation.

### `shop-home` — Home

**Surface:** Buyer storefront — 64px public bar plus a 44px horizontal category bar. No rail, no organization name anywhere: a buyer belongs to no tenant.

**Prompt:**

> Buyer storefront home. Public bar: MarketCore wordmark, a "Search products and sellers…" field with a ⌘K hint, wishlist and cart icons each with a count badge, a "Start selling" link and a "Sign in" button. Below it the horizontal category bar: All (selected) · Textiles · Home · Food · Beauty · Deals · then Sell on MarketCore · Help pushed to the right. Page: a hero card headed "Everything from every seller, one checkout" with the line "Two sellers today. Browse by category, filter by what matters, and buy without leaving the page." and three chips — Free delivery over E£500 (selected), 14-day returns, Verified sellers. Then four category cards: Textiles 142 products, Home 88, Food 64, Beauty 31. Then a results bar "Featured this week · curated, not newest" with "Sort: Recommended". Then a four-column grid of product cards: Nile Cotton Shirt E£249.00 (Nile Traders, 4.6, 128), Delta Olive Oil E£189.00, Ramie Table Runner E£180.00, Giza Sheet Set E£1,250.00 — each with seller name, name, star rating, price and an "in stock" pill.

### `storefront` — Browse

**Surface:** Buyer storefront — 64px public bar plus a 44px horizontal category bar. No rail, no organization name anywhere: a buyer belongs to no tenant.

**Prompt:**

> Buyer browse — all published products. Storefront chrome. A hero card headed "Find something worth buying" with the line "Every published product from every seller. Two are the real seed rows; the rest are examples, because the catalog is thin today." and filter chips: All (selected), In stock, Under E£200, Nile Traders, Delta Goods. Results bar "4 products · from 2 sellers · Sort: Recommended". A four-column grid of the same four product cards, each labelled with its seller and whether it is a real seed row. A footer line noting the filters are only the ones the domain can support — price, availability, seller — and that drafts answer 404.

### `shop-category` — Category

**Surface:** Buyer storefront — 64px public bar plus a 44px horizontal category bar. No rail, no organization name anywhere: a buyer belongs to no tenant.

**Prompt:**

> Buyer category page — "Textiles / Shirts & linen". Storefront chrome, then a breadcrumb. Two columns: a 230px filter panel and the results. The filter panel has five groups: Category (checkboxes: Shirts ✓, Bedding, Table linen ✓, Towels), Price (three rows with counts: Under E£200 · 3, E£200–E£1,000 · 4, Over E£1,000 · 1), Seller (Nile Traders ✓, Delta Goods), Availability (In stock ✓, Include out of stock), Rating (4★ and up ✓, 3★ and up). Results: a bar reading "8 results · in Shirts & linen · Sort: Recommended", then a grid of eight product cards with seller, name, stars, price and a stock pill (in stock / low / out), then pagination ‹ 1 2 3 ›.

### `shop-search` — Search

**Surface:** Buyer storefront — 64px public bar plus a 44px horizontal category bar. No rail, no organization name anywhere: a buyer belongs to no tenant.

**Prompt:**

> Buyer search. Storefront chrome, then a large 50px search field containing "cotton" with a Clear affordance. Below it an autocomplete panel of grouped rows with a small icon on each: a "Suggestions" group header, then "cotton shirt — 12 results" and "cotton towels — 4 results"; a "Sellers" group header, then "Nile Traders — 2 products" and "Delta Goods — 1 product"; a "Recent" group header, then "olive oil — 2 days ago". Group headers are small uppercase labels on an inset background.

### `shop-seller` — Seller store

**Surface:** Buyer storefront — 64px public bar plus a 44px horizontal category bar. No rail, no organization name anywhere: a buyer belongs to no tenant.

**Prompt:**

> Buyer seller store — "Nile Traders", the public route /s/nile-traders. Storefront chrome. A store hero: a 64px rounded logo tile reading NT; the store name; a 4.6 star rating with 128 reviews; a chip "Replies in under 2 hours"; and a description "Long-staple Egyptian cotton, made in Cairo. On MarketCore since Sep 2026." Right-aligned stats: 4 Products, 177 Sold, 14d Returns. Then filter chips: All products (selected), Best selling, New in, On sale. A results bar "4 products · sorted by best selling". Then a grid of the seller's four product cards.

---

## Batch 3 of 11 — buyer product: decide on one item

`shop-product` · `shop-product-reviews` · `storefront-mobile`

3 screens in one generation.

### `shop-product` — Product

**Surface:** Buyer storefront — 64px public bar plus a 44px horizontal category bar. No rail, no organization name anywhere: a buyer belongs to no tenant.

**Prompt:**

> Buyer product detail — "Nile Cotton Shirt" by Nile Traders. Storefront chrome, then a breadcrumb Browse / Textiles / Shirts / Nile Cotton Shirt. Two columns. Left, a gallery: a large image tile showing a monogram with a "Click to zoom" tag, four thumbnails beneath it (Main selected, In scale, Fabric, On model), and a caption. Right, the buy box: the seller name as an overline, the product title, a 4.6 rating with 128 reviews and a "42 sold" chip, the price E£249.00 in monospace, a description, then a Colour group with three round swatches — Ecru selected, Indigo, Olive struck through — and a Size group with buttons S / M (selected) / L / XL struck through plus a "Size guide" link. Then Availability "In stock · 8 left" and Delivery "Arrives Tue 14 – Thu 16 Oct" as label/value rows. Then a quantity stepper flanked by a large "Add to cart" button and a wishlist icon button. Below the fold: a Specifications table (Material, Fit, Colour, Care, SKU, Returns) and a "Buy with confidence" card (Sold by, Seller rating, Returns, Dispatch, Replies in).

### `shop-product-reviews` — Product — reviews

**Surface:** Buyer storefront — 64px public bar plus a 44px horizontal category bar. No rail, no organization name anywhere: a buyer belongs to no tenant.

**Prompt:**

> Buyer product reviews for Nile Cotton Shirt. Storefront chrome, then a breadcrumb Nile Cotton Shirt / Reviews. Two columns. Left: a "Ratings & reviews" card with a very large 4.6, stars, "128 verified reviews", and a 5★→1★ breakdown as five rows of percentage bars (78%, 14%, 5%, 2%, 1%). Then a "Most recent" card with filter chips (All selected, With photos, 5★) containing three reviews, each with an avatar, name, star rating, date, an optional "Verified purchase" badge and the review text. Right: a "You may also like" cross-sell card with three product cards in a two-column grid, and a "Why reviews matter" card of explanatory copy.

### `storefront-mobile` — Mobile

**Surface:** Buyer storefront — 64px public bar plus a 44px horizontal category bar. No rail, no organization name anywhere: a buyer belongs to no tenant.

**Prompt:**

> The buyer storefront on a phone — this surface is mobile-first, over 70% of marketplace transactions. Draw a 392×812 phone frame. Inside: a compact top bar with the logo mark, a "Search products…" field and a cart icon with a count badge. A horizontally scrolling row of filter chips: In stock (selected), Under E£200, Nile Traders. A results bar "4 products · 2 sellers". Then a two-column grid of four compact product cards with name, seller, price and a stock pill.

---

## Batch 4 of 11 — buyer cart and checkout: pay for it

`shop-cart` · `checkout` · `shop-confirmation`

3 screens in one generation.

### `shop-cart` — Cart

**Surface:** Buyer storefront — 64px public bar plus a 44px horizontal category bar. No rail, no organization name anywhere: a buyer belongs to no tenant.

**Prompt:**

> Buyer cart. Storefront chrome. Page head "Your cart" with "2 items from 2 sellers" and a "Continue shopping" link. Two columns. Left: an "Items" card whose header carries a "Save for later" action, containing two cart rows — each a 64px thumbnail, the product name, a variant line ("Nile Traders · Ecru / M"), a quantity stepper, a right-aligned line total in monospace, and a remove icon button. Rows: Nile Cotton Shirt × 1 E£249.00, Delta Olive Oil × 2 E£378.00. Right: a Summary card with Subtotal E£627.00, Delivery "Free over E£500", Total E£627.00, a full-width "Checkout" button, and an optional Promo code field. Below it a card noting that a cart is a proposed addition — the domain currently has none.

### `checkout` — Checkout

**Surface:** Buyer storefront — 64px public bar plus a 44px horizontal category bar. No rail, no organization name anywhere: a buyer belongs to no tenant.

**Prompt:**

> Buyer checkout, step 2 of 3. Storefront chrome. Page head "Checkout" with "Signed in as Mariam Buyer · belongs to no organization" and a "step 2 of 3" pill. A three-step progress row: Cart ✓ → Details ✓ → Payment. Two columns. Left: a "Your order" table (one line item, total footer E£249.00); then a "Delivery details" card whose header says required fields are marked and the rest named as optional, containing labelled fields Full name *, Email *, Address * (empty, with the helper "Not in the domain yet — a checkout with no address is not a checkout.") and Phone (optional — used only for delivery updates). Right: a Summary card (Subtotal, Delivery Free, Total) with a full-width "Place order" button, and a note explaining the 10% platform fee is taken from the seller's proceeds so the buyer pays the listed price — a fee line here would be a lie. Below it a card headed "Not built yet — be honest about it" covering payment and the deliberate absence of guest checkout.

### `shop-confirmation` — Order placed

**Surface:** Buyer storefront — 64px public bar plus a 44px horizontal category bar. No rail, no organization name anywhere: a buyer belongs to no tenant.

**Prompt:**

> Buyer order confirmation. Storefront chrome. A centred confirmation card: a green circular tick, "Order placed", "Order #1042 is confirmed. Payment is still pending, and the seller has been notified.", three chips (Order #1042, Nile Cotton Shirt · E£249.00, Nile Traders), and two buttons — "Track this order" and "Continue shopping". Below it two columns: a "What happens next" card with a four-entry vertical timeline (Order confirmed / Payment pending / Dispatch / Delivery), and a "Confirmation email" card stating plainly that nothing sends email yet, then a Receipt row "#1042.pdf".

---

## Batch 5 of 11 — buyer orders: what happened after paying

`my-orders` · `shop-order`

2 screens in one generation.

### `my-orders` — My orders

**Surface:** Buyer storefront — 64px public bar plus a 44px horizontal category bar. No rail, no organization name anywhere: a buyer belongs to no tenant.

**Prompt:**

> Buyer "My orders" — orders where you are the buyer, across every seller. Storefront chrome. Page head "My orders" with "Orders where you are the buyer — across every seller." One table: Order, Item (with the seller beneath), Status pill, Placed, Total (right-aligned, monospace), and an "Open" button per row. Two rows: #1042 / Nile Cotton Shirt / pending / 10 Oct 2026 / E£249.00; #1031 / Delta Olive Oil / completed / 28 Sep 2026 / E£189.00. A table footer noting the scope is buyerId = you, never a tenant.

### `shop-order` — Order detail

**Surface:** Buyer storefront — 64px public bar plus a 44px horizontal category bar. No rail, no organization name anywhere: a buyer belongs to no tenant.

**Prompt:**

> Buyer order detail #1042. Storefront chrome, then a breadcrumb My orders / #1042. Page head "Order #1042" with "Placed 10 Oct 2026 · Nile Traders", a "pending payment" pill and an Invoice button. A four-step progress row: Placed ✓ → Paid → Shipped → Delivered. Two columns. Left: an Items table (one line, total E£249.00); a Tracking card whose header says nothing can be tracked until the order is paid and dispatched, containing an empty state with an emblem and "No shipment yet". Right: a "Delivering to" card with Name, Address and Email rows; and a "Need help?" card with "Contact seller" and "Request a return" buttons plus a note that a return needs a paid order first.

---

## Batch 6 of 11 — buyer account: personal, apart from any organization

`account-profile` · `account-addresses` · `account-payments` · `account-wishlist`

4 screens in one generation.

### `account-profile` — Account — profile

**Surface:** Buyer account — the storefront chrome plus a 246px left account nav. No rail, no organization name.

**Prompt:**

> Buyer account — Profile & security. Storefront chrome plus a 246px left account nav headed by an avatar, "Mariam Buyer" and mariam@shopper.test, listing Profile & security (selected), Addresses, Payment methods, Orders, Wishlist, My reviews, Returns, Sign out. Main column head: "Profile & security" with "Your personal account — separate from any organization you belong to." Two columns. Left: a "Personal details" card with a two-up First name * / Last name *, then Email * with the helper that changing it needs a verification email that does not exist yet, an optional Phone, and a Save changes button; then a "Password" card with Current password *, New password * and an "Update password" button with the note "signs out other sessions". Right: a "Security" card (Two-factor authentication — an "off" pill, Active sessions 2, This device Chrome · Cairo, and "Sign out everywhere"); a "Notifications" card with four checkboxes (Order updates ✓, Back-in-stock alerts ✓, Price drops on wishlist, Seller marketing); and a card explaining why "mine" and "the organization's" are kept apart.

### `account-addresses` — Account — addresses

**Surface:** Buyer account — the storefront chrome plus a 246px left account nav. No rail, no organization name.

**Prompt:**

> Buyer account — Addresses. Storefront chrome plus the account nav with Addresses selected. Head "Addresses" with "Where your orders go." and a "New address" button. Left column: two address cards — Home (with a default pill, showing Name, Address "12 Corniche El Nil, Cairo, 11511", Phone) and Work (4 Tahrir Square, Cairo) — each with an Edit action. Right column: a "New address" form (Label optional, Street *, a two-up City * and Postal code * in monospace, a "Make this my default address" checkbox, and a full-width "Save address" button), then a card noting there is no address in the domain yet.

### `account-payments` — Account — payments

**Surface:** Buyer account — the storefront chrome plus a 246px left account nav. No rail, no organization name.

**Prompt:**

> Buyer account — Payment methods. Storefront chrome plus the account nav with Payment methods selected. Head "Payment methods" with "Used at checkout. Card numbers never touch this app." and an "Add card" button. Left: a "Saved cards" card with a default pill, containing two rows — a small card-icon tile, "Visa ending 4242" with "Expires 09 / 2028" and a Default label; and "Mastercard ending 5100" with "Expires 03 / 2027" and a Backup label — each with Edit and a remove button. Right: an "Add a card" form (Card number *, a two-up Expiry * / CVC *, a "Use as my default card" checkbox, full-width "Save card"), then a card noting the app stores a provider token, never a card number, and that the provider adapter is a later phase.

### `account-wishlist` — Account — wishlist

**Surface:** Buyer account — the storefront chrome plus a 246px left account nav. No rail, no organization name.

**Prompt:**

> Buyer account — Wishlist. Storefront chrome plus the account nav with Wishlist selected. Head "Wishlist" with "3 saved products across 1 seller." A four-column grid of three product cards (Giza Sheet Set E£1,250.00, Ramie Table Runner E£180.00, Fayoum Wool Throw E£460.00), each carrying an "Add to cart" button and a remove icon. A line beneath noting that saved products are a proposed addition, and that back-in-stock and price-drop alerts are why wishlists earn their keep.

---

## Batch 7 of 11 — console: the overview and the catalog

`dashboard` · `products` · `product` · `product-new`

4 screens in one generation.

### `dashboard` — Dashboard

**Surface:** Seller console — 252px dark rail on the left, 64px breadcrumb top bar. A tenant screen.

**Prompt:**

> Seller console — the Overview dashboard. The dark 252px rail: a logo tile with "Nile Traders" and "MarketCore" beneath it; a ⌘K search field; grouped navigation — a "Overview" group (Dashboard selected, Reports), "Catalog" (Products with a count of 4, Inventory, Promotions), "Money" (Orders with a count of 128, Refunds, Payouts), "Admin" (Members, Store settings, Operations with a warning count of 3); and a user chip pinned to the bottom with an Owner role. The 64px top bar: a "Dashboard / Overview" breadcrumb, a wide search field with a ⌘K hint, a notifications bell with an unread badge, and a user chip. Page head "Overview" with "Revenue, orders and stock health for Nile Traders.", a 7d/30d/90d/1Y segmented control and an Export button. A row of four KPI cards, each with a label, a delta chip and a sparkline: Revenue · 30d E£48,290.00 (+14.2%), Orders 128 (+8.1%), Avg order value E£377.00 (+5.4%), Low stock 2 (a down chip reading "1 out of stock"). Then two columns: a Revenue card with a grouped bar chart by week, a legend for this quarter vs last, and axis labels in monospace; and a "Revenue by plan" card with a donut showing 56% and a legend list (Cotton 56%, Olive oil 28%, Other 16%). Then two more columns: a Recent orders table (Order, Buyer with avatar, Total, Payment pill, Fulfilment pill, Progress share bar) and a "Top products" list with share bars.

### `products` — Products

**Surface:** Seller console — 252px dark rail on the left, 64px breadcrumb top bar. A tenant screen.

**Prompt:**

> Seller console — the Products list. Rail with Products selected, breadcrumb Catalog / Products. Page head "Products" with "4 products · Nile Traders", an inline search field, a Filter button and a "New product" primary button. Four KPI cards: Published 2, Draft 1, Out of stock 1 (needing attention), Inventory value E£12,450.00 with a sparkline. One wide table: Product (a status dot, the name, the SKU beneath in monospace), Status pill (published / draft), Price, Available (a share bar with the number beside it), Sales · 30d (a sparkline column), Trend (a delta chip or a dash), and an Edit action per row. Four rows: Nile Cotton Shirt, Giza Sheet Set, Ramie Table Runner, Delta Olive Oil. A table footer noting inventory is enforced by a database CHECK.

### `product` — Product detail

**Surface:** Seller console — 252px dark rail on the left, 64px breadcrumb top bar. A tenant screen.

**Prompt:**

> Seller console — product detail for "Nile Cotton Shirt". Rail with Products selected, breadcrumb Catalog / Products / Nile Cotton Shirt. Page head with a "published" pill, a Duplicate button and a "Save changes" primary button. Two columns. Left: a Details card with labelled fields Name, a two-up Price (monospace, helper "EGP · minor units 24900") and Currency (helper "carried on the aggregate"), and Slug (monospace, helper "unique per organization"); then a "Sales · 30 days" card with a bar chart, delta chip +18.4%. Right: an Inventory card with a very large "10 available", a share bar, and Reserved / Version / Constraint rows; then a "Publish rule" card explaining DRAFT → PUBLISHED needs a price of at least 1 minor unit.

### `product-new` — New product

**Surface:** Seller console — 252px dark rail on the left, 64px breadcrumb top bar. A tenant screen.

**Prompt:**

> Seller console — create a product. Rail with Products selected, breadcrumb Catalog / Products / New. Page head "New product" with "Saved as a draft. Publishing is a separate, guarded step.", plus Preview, Save draft and a Publish primary button. Two columns. Left: a Details form — Name *, Description (optional), a two-up Price * (monospace, helper "EGP · minor units 24900") and Currency select, and Opening stock * with the helper that a product with no inventory row cannot be sold. Right: an Image card holding a dashed dropzone labelled "drop an image" — the card header states an image is required to publish because a marketplace card leads with the photo; then a Publish rule card.

---

## Batch 8 of 11 — console: media, stock and discounts

`product-media` · `inventory` · `promotions`

3 screens in one generation.

### `product-media` — Media & variants

**Surface:** Seller console — 252px dark rail on the left, 64px breadcrumb top bar. A tenant screen.

**Prompt:**

> Seller console — media and variants. Rail with Products selected, breadcrumb Catalog / Products / Nile Cotton Shirt / Media & variants. Page head "Media & variants" with "Images and options — the two things a buyer looks at before the price.", plus Preview and Save. Two columns. Left: an Images card headed "4 of 8 · drag to reorder, first is the card image" with an Add action, holding a four-column grid of square tiles — each showing a monogram, a caption tag (the first reads "Card image"), and a remove button — plus an "add" dropzone as the fifth cell. Then an Options card with a Colour group of three swatches and a Size group of S / M / L / XL buttons. Right: a Variants table — six rows of Variant, Price, Stock, SKU, State pill and Edit — with a footer noting variant-level inventory is a new model, because today one product has one stock row.

### `inventory` — Inventory

**Surface:** Seller console — 252px dark rail on the left, 64px breadcrumb top bar. A tenant screen.

**Prompt:**

> Seller console — Inventory. Rail with Inventory selected, breadcrumb Catalog / Inventory. Page head "Inventory" with "Available, reserved and version — the CHECK constraint is the guard.", plus Export and an "Adjust stock" primary button. Four KPI cards: In stock 3, Low stock 1 (needing attention), Out of stock 1 (cannot sell), Inventory value E£12,450.00 with a sparkline. A "Stock on hand" table: Product (dot + name + SKU), Available, Reserved, Version (all monospace and right-aligned), a State pill, and an Adjust action. Rows: Nile Cotton Shirt 10/2/12 in stock, Giza Sheet Set 0/0/3 out, Ramie Table Runner 3/0/8 low. A footer noting available ≥ 0 is enforced in the database and adjustments append to a movement log. Below it a "Recent movements" card with a three-entry timeline.

### `promotions` — Promotions

**Surface:** Seller console — 252px dark rail on the left, 64px breadcrumb top bar. A tenant screen.

**Prompt:**

> Seller console — Promotions. Rail with Promotions selected, breadcrumb Catalog / Promotions. Page head "Promotions" with "Discounts a buyer can apply at cart or checkout." and a "New promotion" primary button. Two columns. Left: a table — Code (monospace, bold), Value, Applies to, Status pill, Window, and Edit. Three rows: WELCOME10 / 10% off / All products / active / ends 31 Oct; COTTON20 / 20% off / Textiles / scheduled / starts 1 Nov; FREESHIP / Free delivery / Orders over E£500 / expired / ended 30 Sep. A footer noting discounts are a proposed addition. Right: a "Create a promotion" form — Code *, a two-up Type select and Value *, an Applies to select, and a full-width "Create promotion" button.

---

## Batch 9 of 11 — console: money in and money out

`orders` · `order` · `fulfil` · `refunds` · `payouts`

5 screens in one generation.

### `orders` — Orders

**Surface:** Seller console — 252px dark rail on the left, 64px breadcrumb top bar. A tenant screen.

**Prompt:**

> Seller console — the Orders list. Rail with Orders selected, breadcrumb Money / Orders. Page head "Orders" with "4 orders · 1 needs attention", an All/Paid/Pending segmented control and an Export button. One table: Buyer (an avatar with the name and the order id beneath), Payment pill, Fulfilment pill, Total (right-aligned monospace), Fee, and an "Open" action. Four rows — #1042 Mariam Buyer paid/fulfilling, #1041 Sara Ahmed paid/completed, #1040 Khaled Hassan processing/pending, #1039 Nour Said refunded/cancelled. A table footer noting totals are immutable after creation and corrections are compensating ledger entries.

### `order` — Order detail

**Surface:** Seller console — 252px dark rail on the left, 64px breadcrumb top bar. A tenant screen.

**Prompt:**

> Seller console — order detail #1042. Rail with Orders selected, breadcrumb Money / Orders / #1042. Page head "Order #1042" with "Placed 2 minutes ago · Nile Traders" and a "paid" pill. A four-step flow row: Pending payment → Paid ✓ → Fulfilling → Completed. Two columns. Left: an Items table (one line, total E£249.00); a Ledger table headed "Signed entries sum to zero, per currency" with Account / Debit / Credit columns, three rows (Platform cash, Seller payable, Platform revenue), a "Signed sum 0.00" footer and a "balanced" pill in the card header. Right: a Payment card (Status succeeded, Attempts 1, Provider ref pi_3Qk…9d2, Captured E£249.00); a Timeline card with three entries (Payment captured / Order created / Checkout, each with a relative time and a one-line detail); and an Actions card with Refund order and Cancel.

### `fulfil` — Fulfil an order

**Surface:** Seller console — 252px dark rail on the left, 64px breadcrumb top bar. A tenant screen.

**Prompt:**

> Seller console — fulfilling order #1042. Rail with Orders selected, breadcrumb Money / Orders / #1042 / Fulfil. Page head "Fulfil #1042" with "Paid · 1 item · ships to Cairo.", a Packing slip button and a "Mark as shipped" primary button. Two columns. Left: a "Pack these items" table (Item, Qty, and a Packed checkbox per line) with a footer saying marking every line packed is what allows "shipped"; then a Shipment form with a two-up Carrier select and Tracking number (monospace), and a note that a typed tracking number is not verified with the carrier. Right: a "Deliver to" card (Buyer, Address, Phone); and a card noting fulfilment is a proposed addition because no shipment, carrier or tracking model exists yet.

### `refunds` — Refunds

**Surface:** Seller console — 252px dark rail on the left, 64px breadcrumb top bar. A tenant screen.

**Prompt:**

> Seller console — Refunds. Rail with Refunds selected, breadcrumb Money / Refunds. Page head "Refunds" with "INV-5 — a refund never exceeds what was captured" and a "New refund" primary button. Two columns. Left: a Refunds table (Refund monospace, Order monospace, Amount, Status pill, Settled share bar) with three rows: RF-0042 / #1039 / E£249.00 / succeeded; RF-0041 / #1036 / E£90.00 / failed; RF-0040 / #1032 / E£50.00 / processing. Right: a "Request a refund" form (Order, Amount with the helper "captured: 249.00 EGP", a warning banner that a refund above the captured total is refused before the provider is called, and a full-width "Request refund" button); then a "Ledger effect" card explaining a refund posts a reversing transaction and never edits the original capture.

### `payouts` — Payouts

**Surface:** Seller console — 252px dark rail on the left, 64px breadcrumb top bar. A tenant screen.

**Prompt:**

> Seller console — Payouts. Rail with Payouts selected, breadcrumb Money / Payouts. Page head "Payouts" with "INV-8 — a payout is executed at most once" and a "Request payout" primary button. Four KPI cards: Available E£6,150.00 (withdrawable now), Pending settlement E£1,824.00 (clears in 2 days), Paid out · all time E£34,870.00 with a sparkline, Failed payouts 1 (needs a retry). A "Payout history" table — Payout, Amount, Status pill, Provider ref, Requested — with three rows: PO-0031 E£2,241.00 paid; PO-0032 E£6,150.00 processing; PO-0030 E£980.00 failed. A footer explaining that two workers may race one payout and the state predicate, not the worker, is the guard.

---

## Batch 10 of 11 — console: admin and operations

`store-settings` · `members` · `operations`

3 screens in one generation.

### `store-settings` — Store settings

**Surface:** Seller console — 252px dark rail on the left, 64px breadcrumb top bar. A tenant screen.

**Prompt:**

> Seller console — Store settings for Nile Traders. Rail with Store settings selected, breadcrumb Admin / Store settings. Page head "Store settings" with "Nile Traders — the public face buyers see.", a "View public store" button and a "Save changes" primary button. Two columns. Left: a "Store profile" form (Store name *, Public slug * in monospace with the helper that a buyer reaches you at /s/nile-traders, About optional, and a Response time select); then a Policies card (Returns window select, Dispatch promise). Right: a Shipping zones table (Zone, Rate & time, State pill, Edit) with rows Cairo & Giza E£40 · 1–2 days active, Rest of Egypt E£75 · 3–5 days active, International Not offered off; then a Payout details card (Bank, Schedule, Currency).

### `members` — Members

**Surface:** Seller console — 252px dark rail on the left, 64px breadcrumb top bar. A tenant screen.

**Prompt:**

> Seller console — Members. Rail with Members selected, breadcrumb Admin / Members. Page head "Members" with "Nile Traders · 2 members" and an "Add member" primary button. Two columns. Left: a Members table — Member (avatar, email, role beneath), Role pill, Status pill, Joined, Manage — with two rows: owner@marketcore.test owner active Sep 19, member@marketcore.test member active Sep 20. A footer noting the last owner cannot be removed. Right: an "Add a member" form (Email, a Role select, a full-width "Add to organization" button, and a note that nothing sends email yet); then a "Tenant isolation" card explaining the organization travels as x-organization-id, a cross-tenant read answers 404 and a header naming someone else's tenant answers 403.

### `operations` — Operations

**Surface:** Seller console — 252px dark rail on the left, 64px breadcrumb top bar. A tenant screen.

**Prompt:**

> Seller console — Operations. Rail with Operations selected, breadcrumb Admin / Operations. Page head "Operations" with "Trace and recover failed work", a 24h/7d/30d segmented control and an "Export log" button. Four KPI cards: Events today 1,204 (+3.1%, sparkline), Duplicates suppressed 86 (idempotent no-ops), Job failures 3 (retrying, a down chip), Avg retry delay 4.2s (-0.6s). Then two tables side by side. "Webhook events", headed "Deduplicated by (provider, eventId)", with columns Event id, Type, Applied, Request id and a Filter action: two rows of the same payment_intent.succeeded event id — one "once", one "no-op" — and a charge.refunded row that is retrying. "Outbox jobs", headed "At-least-once, idempotent", with columns Job, Attempts, Status, Duration: publish.order.paid processed, publish.refund.succeeded retrying, publish.payout.paid queued.

---

## Batch 11 of 11 — reference: the system itself

`foundations` · `states`

2 screens in one generation.

### `foundations` — Foundations

**Surface:** Reference sheet — a plain documentation page on the app canvas. No rail, no top bar.

**Prompt:**

> Reference sheet — "Foundations — Quartz". A documentation page, no app chrome. An intro paragraph explaining the four layers: palette → semantic → components → screens, and that a component names a role, never a hue. Then four swatch groups, each a row of cards showing a colour block, the token name, its role in words and its hex value: Surface (canvas, panel, panel2, rail); Text (ink, muted, faint, accent); Edge (line, lineStrong, controlEdge — the last annotated "control boundary · 3:1"); State (ok, bad, warn, info). Then a Type row showing the real specimens side by side: a display specimen, a title, body text, an uppercase label and a monospace price. Then a Components row: three button weights, a text field, four status pills and both delta chips. Then a Data motifs row showing share bars at three values, a sparkline, and the status pills again with the note that a pill is a dot and a word, never colour alone.

### `states` — States

**Surface:** Reference sheet — a plain documentation page on the app canvas. No rail, no top bar.

**Prompt:**

> Reference sheet — "States": the shapes a screen takes before and instead of data. A three-column grid of cards, each with a title and a one-line rationale. Loading — skeleton bars, never a spinner that hides the layout. Empty — an emblem, "No products yet" and a "New product" action. Error — one envelope: a banner with "Query failed" and a monospace request id, plus a note that every failure carries a code, a message and the request id. Form validation — a focusable error summary at the top of the form linking to the field, an invalid email field outlined in red, and an inline error message beneath it. Not found — a 404 emblem and a note that a product from another organization answers 404, never 403. Zero results — a warning banner "No products match "linen shirt"" with recovery chips. Nothing published yet — an honest empty catalogue with a "Start selling" action. Buyer — no orders — a new buyer's very first screen. Order — pending payment — the honest dead end until payment ships.

---

## After each batch

Paste the result back into the review chat. Check, in order:

1. **Is the chrome right?** No rail on a buyer screen, no organization name anywhere in the storefront.
2. **Is anything below 12px?** That is the most common regression, and it is what makes a design read as a wireframe.
3. **Does every text pair hold 4.5:1** in both themes? The measured table is in `DESIGN.md` §2.
4. **Does every state read as true?** If the domain cannot do it, the screen says so rather than mocking a happy path.

