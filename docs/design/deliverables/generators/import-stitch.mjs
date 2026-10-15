import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Brings a Stitch redesign of the board back into the repo, unchanged.
 *
 *   node import-stitch.mjs <list_screens.json> <html-dir>
 *
 * <list_screens.json> is the Stitch MCP `list_screens` result for project
 * 3383911874392417631; <html-dir> holds each screen's downloaded `htmlCode`, named
 * `<screen-id>.html` (the last segment of the screen's resource name).
 *
 * Writes ui/stitch/{plain,craft}/<board-id>.html — both passes Stitch made, byte for
 * byte — and ui/stitch/manifest.json with the viewport Stitch rendered each at. The
 * board's Stitch tabs show these in iframes; port-stitch.mjs turns a pass into the
 * fragments gen-ui.mjs renders.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI = path.join(HERE, '..', 'ui');
const [listPath, htmlDir] = process.argv.slice(2);
if (!listPath || !htmlDir) {
  console.error('usage: node import-stitch.mjs <list_screens.json> <html-dir>');
  process.exit(1);
}

/* board id → the Stitch titles of its two passes. `craft` is the `[Senior Craft]` edit,
   `plain` the first generation. Titles, not ids: they are what a person sees in Stitch. */
const MAP = {
  signin: ['MarketCore — Sign In (Error State) [Senior Craft]', 'MarketCore — Sign In (Error State)'],
  register: ['MarketCore — Register [Senior Craft]', 'MarketCore — Register'],
  onboarding: ['MarketCore — First Run Onboarding [Senior Craft]', 'MarketCore — First Run Onboarding'],
  'shop-home': ['MarketCore — Home [Senior Craft]', 'MarketCore — Home'],
  storefront: ['MarketCore — Browse [Senior Craft]', 'MarketCore — Browse'],
  'shop-category': ['MarketCore — Category (Textiles) [Senior Craft]', 'MarketCore — Category (Textiles)'],
  'shop-search': ['MarketCore — Search [Senior Craft]', 'MarketCore — Search'],
  'shop-seller': ['MarketCore — Seller Store (Nile Traders) [Senior Craft]', 'MarketCore — Seller Store (Nile Traders)'],
  'shop-product': ['MarketCore — Product Detail [Senior Craft]', 'MarketCore — Product Detail'],
  'shop-product-reviews': ['MarketCore — Product Reviews [Senior Craft]', 'MarketCore — Product Reviews'],
  'storefront-mobile': ['MarketCore — Mobile Storefront [Senior Craft]', 'MarketCore — Mobile Storefront (392px Frame)'],
  'shop-cart': ['MarketCore — Cart [Senior Craft]', 'MarketCore — Cart (/cart)'],
  checkout: ['MarketCore — Checkout [Senior Craft]', 'MarketCore — Checkout (/checkout)'],
  'shop-confirmation': ['MarketCore — Order Placed [Senior Craft]', 'MarketCore — Order Placed (/orders/1042/placed)'],
  'my-orders': ['MarketCore — My Orders [Senior Craft]', 'MarketCore — My orders (/account/orders)'],
  'shop-order': ['MarketCore — Order Detail [Senior Craft]', 'MarketCore — Order detail (/account/orders/1042)'],
  'account-profile': ['MarketCore — Profile & Security [Senior Craft]', 'MarketCore — Profile & security (/account)'],
  'account-addresses': ['MarketCore — Addresses [Senior Craft]', 'MarketCore — Addresses (/account/addresses)'],
  'account-payments': ['MarketCore — Payment Methods [Senior Craft]', 'MarketCore — Payment methods (/account/payments)'],
  'account-wishlist': ['MarketCore — Wishlist [Senior Craft]', 'MarketCore — Wishlist (/account/wishlist)'],
  dashboard: ['MarketCore Seller — Overview Dashboard (/admin) [Senior Craft]', 'MarketCore Seller — Overview Dashboard (/admin)'],
  products: ['MarketCore Seller — Products (/admin/products) [Senior Craft]', 'MarketCore Seller — Products (/admin/products)'],
  product: ['MarketCore Seller — Product Detail (/admin/products/6642) [Senior Craft]', 'MarketCore Seller — Product Detail (/admin/products/6642)'],
  'product-new': ['MarketCore Seller — New Product (/admin/products/new) [Senior Craft]', 'MarketCore Seller — New Product (/admin/products/new)'],
  'product-media': ['MarketCore Seller — Media & Variants (/admin/products/6642/media) [Senior Craft]', 'MarketCore Seller — Media & variants (/admin/products/6642/media)'],
  inventory: ['MarketCore Seller — Inventory (/admin/inventory) [Senior Craft]', 'MarketCore Seller — Inventory (/admin/inventory)'],
  promotions: ['MarketCore Seller — Promotions (/admin/promotions) [Senior Craft]', 'MarketCore Seller — Promotions (/admin/promotions)'],
  orders: ['MarketCore Seller — Orders (/admin/orders) [Senior Craft]', 'MarketCore Seller — Orders (/admin/orders)'],
  order: ['MarketCore Seller — Order Detail (/admin/orders/1042) [Senior Craft]', 'MarketCore Seller — Order Detail (/admin/orders/1042)'],
  fulfil: ['MarketCore Seller — Fulfil an Order (/admin/orders/1042/fulfil) [Senior Craft]', 'MarketCore Seller — Fulfil an Order (/admin/orders/1042/fulfil)'],
  refunds: ['MarketCore Seller — Refunds (/admin/refunds) [Senior Craft]', 'MarketCore Seller — Refunds (/admin/refunds)'],
  payouts: ['MarketCore Seller — Payouts (/admin/payouts) [Senior Craft]', 'MarketCore Seller — Payouts (/admin/payouts)'],
  'store-settings': ['MarketCore Seller — Store Settings (/admin/settings) [Senior Craft]', 'MarketCore Seller — Store Settings (/admin/settings)'],
  members: ['MarketCore Seller — Members (/admin/members) [Senior Craft]', 'MarketCore Seller — Members (/admin/members)'],
  operations: ['MarketCore Seller — Operations (/admin/operations) [Senior Craft]', 'MarketCore Seller — Operations (/admin/operations)'],
  foundations: ['MarketCore — Foundations (/design/foundations) [Senior Craft]', 'MarketCore — Foundations (/design/foundations)'],
  // Two screens carry this craft title; the other is a Tailwind rewrite, not our markup.
  states: ['id:eae755db91ad44ed83392301bb744689', 'MarketCore — States (/design/states)'],
};

const list = JSON.parse(fs.readFileSync(listPath, 'utf8')).screens;
const byTitle = new Map(list.map((s) => [s.title, s]));
const find = (ref) => (ref.startsWith('id:') ? list.find((s) => s.name.endsWith('/' + ref.slice(3))) : byTitle.get(ref));

for (const d of ['craft', 'plain']) fs.rmSync(path.join(UI, 'stitch', d), { recursive: true, force: true });
for (const d of ['craft', 'plain']) fs.mkdirSync(path.join(UI, 'stitch', d), { recursive: true });

const manifest = {};
for (const [id, titles] of Object.entries(MAP)) {
  manifest[id] = {};
  titles.forEach((ref, i) => {
    const variant = i === 0 ? 'craft' : 'plain';
    const s = find(ref);
    if (!s) throw new Error(`no Stitch screen "${ref}" (for ${id})`);
    const title = s.title;
    const html = fs.readFileSync(path.join(htmlDir, s.name.split('/').pop() + '.html'), 'utf8');
    fs.writeFileSync(path.join(UI, 'stitch', variant, id + '.html'), html);
    // Stitch reports device pixels at 2×; the page was laid out at half that.
    manifest[id][variant] = { title, screen: s.name, w: s.width / 2, h: s.height / 2 };
  });
}
fs.writeFileSync(path.join(UI, 'stitch', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`embedded ${Object.keys(MAP).length} screens × 2 passes → ui/stitch/`);
