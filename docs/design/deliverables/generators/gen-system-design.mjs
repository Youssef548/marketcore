import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Writes beside this script, so the generator is portable and a rerun updates
// the committed SVGs in place.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'system-design');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

/* ---------- oklch -> hex, so the diagrams carry exact values ---------- */
function oklch(L, C, h) {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr), b = C * Math.sin(hr);
  const l = L + 0.3963377774 * a + 0.2158037573 * b;
  const m = L - 0.1055613458 * a - 0.0638541728 * b;
  const s = L - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l ** 3, m3 = m ** 3, s3 = s ** 3;
  let r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  let bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  const f = (x) => { x = Math.max(0, Math.min(1, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; };
  const to = (x) => Math.round(f(x) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(bl)}`;
}
const P = {
  linen50: oklch(0.994, 0.006, 84.6), linen100: oklch(0.958, 0.011, 89.7), linen200: oklch(0.923, 0.017, 88),
  linen300: oklch(0.864, 0.011, 89.7), linen400: oklch(0.751, 0.01, 87.5),
  umber400: oklch(0.51, 0.01, 84.6), umber500: oklch(0.45, 0.015, 84.6), umber900: oklch(0.245, 0.012, 84.6),
  indigo300: oklch(0.72, 0.021, 263), indigo400: oklch(0.62, 0.11, 263), indigo500: oklch(0.497, 0.064, 264.2),
  indigo600: oklch(0.401, 0.042, 263.2), indigo700: oklch(0.391, 0.08, 263.8), indigo800: oklch(0.345, 0.047, 263),
  indigo900: oklch(0.287, 0.053, 262.6), indigo950: oklch(0.229, 0.048, 262.4),
  madder600: oklch(0.488, 0.13, 31.2), madder100: oklch(0.955, 0.022, 32),
  moss600: oklch(0.479, 0.078, 161.1), moss100: oklch(0.955, 0.02, 155),
  paper: oklch(1, 0, 0),
};
const INK = P.umber900, MUTED = P.umber500, FAINT = P.umber400, LINE = P.linen300, PANEL = P.linen50, CANVAS = P.linen100;
const FONT = 'Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, Menlo, Consolas, monospace';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function wrap(t, max) { const w = String(t).split(/\s+/); const out = []; let c = ''; for (const x of w) { if ((c + ' ' + x).trim().length > max && c) { out.push(c); c = x; } else c = (c + ' ' + x).trim(); } if (c) out.push(c); return out; }

/* ---------- primitives ---------- */
function t(x, y, s, o = {}) {
  return `<text x="${x}" y="${y}" font-family="${o.mono ? MONO : FONT}" font-size="${o.size || 12}" font-weight="${o.weight || 400}" fill="${o.fill || INK}" text-anchor="${o.anchor || 'start'}"${o.ls ? ` letter-spacing="${o.ls}"` : ''}>${esc(s)}</text>`;
}
function lines(x, y, arr, o = {}) {
  return arr.map((l, i) => t(x, y + i * (o.lh || 15), l, o)).join('');
}
function box(x, y, w, h, o = {}) {
  const rx = o.rx ?? 8;
  const head = o.band ? `<rect x="${x}" y="${y}" width="${w}" height="${o.band}" rx="${rx}" fill="${o.bandFill || P.indigo700}"/>` : '';
  const body = o.bandfill ? '' : '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${o.fill || PANEL}" stroke="${o.stroke || LINE}" stroke-width="${o.sw || 1.3}"/>` + head + body;
}
function bandBox(x, y, w, h, o = {}) {
  const band = o.band || 30;
  return box(x, y, w, h, { ...o, rx: o.rx ?? 8 }) +
    (o.title ? `<path d="M ${x} ${y + band} h ${w}" stroke="${o.stroke || LINE}" stroke-width="1.3"/>` +
      t(x + 14, y + band / 2 + 5, o.title, { weight: 700, size: 12.5, fill: o.titleFill || P.indigo900 }) : '');
}
function marker(id, color) { return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`; }
function arrow(x1, y1, x2, y2, o = {}) {
  const m = o.marker || 'ar';
  const dash = o.dash ? ` stroke-dasharray="5 4"` : '';
  const col = o.color || INK;
  return `<path d="M ${x1} ${y1} L ${x2} ${y2}" fill="none" stroke="${col}" stroke-width="${o.sw || 1.4}"${dash} marker-end="url(#${m})" opacity="${o.op ?? 0.8}"/>`;
}
function ortho(x1, y1, x2, y2, o = {}) {
  const mid = o.mid ?? (x1 + x2) / 2;
  const dash = o.dash ? ` stroke-dasharray="5 4"` : '';
  return `<path d="M ${x1} ${y1} H ${mid} V ${y2} H ${x2}" fill="none" stroke="${o.color || INK}" stroke-width="${o.sw || 1.4}"${dash} marker-end="url(#${o.marker || 'ar'})" opacity="${o.op ?? 0.8}"/>`;
}
function chip(x, y, label, color, w) {
  const width = w || label.length * 6.4 + 16;
  return `<rect x="${x}" y="${y}" width="${width}" height="19" rx="3" fill="${color}" opacity="0.14"/><rect x="${x}" y="${y}" width="${width}" height="19" rx="3" fill="none" stroke="${color}" stroke-width="1" opacity="0.5"/>` +
    t(x + width / 2, y + 13.5, label, { size: 10.5, weight: 600, fill: color, anchor: 'middle', ls: '0.04em' });
}
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#ffffff"/><defs>${marker('ar', INK)}${marker('a2', P.indigo700)}${marker('a3', P.madder600)}${marker('a4', MUTED)}</defs>${body}</svg>`;
function title(txt, sub, w) { return t(44, 40, txt, { size: 20, weight: 700 }) + (sub ? t(44, 62, sub, { size: 12, fill: MUTED }) : ''); }

/* =================== structural diagrams =================== */

function contextDiagram() {
  const W = 1180, H = 660; let s = title('MarketCore — system context', 'Who uses it and what it depends on (C4 level 1)', W);
  const cx = 640, cy = 210;
  s += box(430, 150, 420, 190, { fill: PANEL, stroke: P.indigo900, sw: 1.8 });
  s += t(640, 186, 'MarketCore', { size: 18, weight: 700, anchor: 'middle', fill: P.indigo900 });
  s += t(640, 208, 'multi-seller marketplace — operator console + buyer storefront', { size: 11.5, fill: MUTED, anchor: 'middle' });
  s += lines(640, 246, ['Storefront · one cart across sellers', 'All-or-nothing checkout · one order per seller', 'One charge, split by the double-entry ledger'], { size: 11.5, fill: MUTED, anchor: 'middle', lh: 17 });
  s += lines(640, 320, ['INV-1…INV-15 — consistency under', 'retries, duplicates, races and crashes'], { size: 11, fill: P.indigo700, anchor: 'middle', lh: 15, weight: 600 });

  const actor = (x, y, name, role) => box(x, y, 210, 74, { fill: P.linen50, stroke: LINE }) +
    t(x + 16, y + 30, name, { size: 13, weight: 700 }) + t(x + 16, y + 50, role, { size: 11, fill: MUTED });
  s += actor(60, 120, 'Buyer', 'no membership · cart · refund ask');
  s += actor(60, 220, 'Seller / Member', 'products · orders · ledger');
  s += actor(60, 320, 'Organization Owner', 'members · roles · audit');
  s += actor(60, 420, 'Operations User', 'trace · recover failed work');
  s += actor(910, 220, 'Developer Reviewer', 'run · test · inspect');
  s += actor(910, 420, 'Provider (Stripe)', 'payment · refund · payout');

  s += arrow(270, 157, 430, 200, { marker: 'a2' });
  s += arrow(270, 257, 430, 240, { marker: 'a2' });
  s += arrow(270, 357, 430, 275, { marker: 'a2' });
  s += arrow(270, 457, 430, 310, { marker: 'a2' });
  s += arrow(910, 257, 850, 240, { marker: 'a2' });
  s += arrow(850, 300, 910, 440, { marker: 'a3' });
  s += t(870, 380, 'interface', { size: 10.5, fill: MUTED, anchor: 'middle' });
  s += t(870, 394, 'port', { size: 10.5, fill: MUTED, anchor: 'middle' });

  // Chips laid out left to right with a 10px gap, so no two overlap.
  const chipRow = (y, labels) => { let x = 440; return labels.map((l) => { const c = chip(x, y, l, P.madder600); x += l.length * 6.4 + 16 + 10; return c; }).join(''); };
  s += chipRow(470, ['INV-1 oversell', 'INV-2 idempotency', 'INV-4 webhooks', 'INV-6 ledger']);
  s += chipRow(500, ['INV-8 payouts', 'INV-9 tenant isolation', 'INV-10 outbox']);
  s += chipRow(530, ['INV-11 all or nothing', 'INV-12 buyer isolation', 'INV-15 restock once']);
  s += t(440, 575, 'The product is technical evidence: each invariant is proven by a runnable command.', { size: 11.5, fill: MUTED });
  return svg(W, H, s);
}

function containerDiagram() {
  const W = 1240, H = 820; let s = title('MarketCore — containers', 'Modular monolith + separately runnable worker, one database (C4 level 2)', W);
  const B = (x, y, w, h, tt, tech, sh) => bandBox(x, y, w, h, { title: tt, band: 30, fill: PANEL, stroke: P.indigo900 }) +
    t(x + 14, y + 52, tech, { size: 11, fill: MUTED }) + (sh ? lines(x + 14, y + 72, sh, { size: 11, fill: MUTED, lh: 15 }) : '');

  s += B(70, 110, 260, 108, 'Browser', 'React 19 · Next.js 15 client', ['storefront + operator UI — never', 'holds a credential a script can read']);
  s += B(470, 110, 300, 108, 'Web — BFF', 'Next.js route handlers', ['buyer storefront at / · operator at /admin;', 'only API caller; httpOnly cookie tokens']);
  s += B(470, 300, 300, 150, 'API — modular monolith', 'NestJS · REST /api/v1', ['Auth · Organizations · Catalog ·', 'Inventory · Storefront · Cart ·', 'Orders + Checkout · Payments ·', 'Ledger · Refunds · Payouts · Outbox ·', 'Audit · Observability']);
  s += B(70, 300, 260, 150, 'Worker', 'interval process · phase 4', ['cancels checkouts unpaid 30 min;', 'BullMQ + outbox claims, phase 10;', 'idempotent under at-least-once']);
  s += B(470, 560, 300, 96, 'PostgreSQL 16', 'source of truth', ['carts · checkouts · orders · inventory ·', 'payments · ledger · outbox']);
  s += B(880, 560, 290, 96, 'Redis', 'execution dependency · phase 10', ['jobs + cache only — never the', 'source of truth for money']);
  s += B(880, 300, 290, 108, 'Payment provider', 'Stripe (test mode)', ['behind a PaymentProvider port;', 'deterministic simulator swaps in']);

  s += arrow(330, 150, 470, 150, { marker: 'ar' }); s += t(400, 142, 'HTTPS', { size: 10.5, fill: MUTED, anchor: 'middle' });
  s += arrow(540, 218, 540, 300, { marker: 'a2' }); s += t(596, 262, 'BFF → API, server-to-server', { size: 10.5, fill: MUTED, anchor: 'middle' });
  s += ortho(250, 450, 470, 604, { marker: 'ar', mid: 360 }); s += t(300, 520, 'cancel · outbox', { size: 10.5, fill: MUTED, anchor: 'middle' });
  s += t(300, 536, 'SQL', { size: 10.5, fill: MUTED, anchor: 'middle' });
  s += arrow(540, 450, 540, 560, { marker: 'ar' }); s += t(596, 508, 'SQL / transactions', { size: 10.5, fill: MUTED, anchor: 'middle' });
  s += arrow(880, 610, 770, 610, { marker: 'ar' }); s += t(825, 602, 'jobs / cache', { size: 10.5, fill: MUTED, anchor: 'middle' });
  s += arrow(770, 356, 880, 356, { marker: 'a3' }); s += t(825, 348, 'capture / refund', { size: 10.5, fill: MUTED, anchor: 'middle' });
  s += arrow(880, 396, 770, 396, { marker: 'ar', dash: true }); s += t(825, 412, 'webhooks', { size: 10.5, fill: MUTED, anchor: 'middle' });

  s += `<rect x="70" y="700" width="1100" height="74" rx="8" fill="${P.linen50}" stroke="${LINE}"/>`;
  s += t(90, 726, 'The boundary that forces packages/runtime', { size: 12, weight: 700, fill: P.indigo900 });
  s += t(90, 748, 'The worker cannot import apps/api, so shared plumbing (env, Prisma module, request ids, JSON logger) lives in packages/runtime — and the rule is a build error, not a convention.', { size: 11, fill: MUTED });
  return svg(W, H, s);
}

function moduleDiagram() {
  // Release 2 storefront modules (CR-001, D68) are listed like every other future module, after phase 11.
  const DY = 160; // the module list grew by five rows; everything below it moves down together
  const W = 1240, H = 900 + DY; let s = title('MarketCore — modules and package boundaries', 'What owns what, and the two rules the build enforces', W);
  const MODS = [['Auth', '2'], ['Organizations', '2'], ['Catalog', '3'], ['Inventory', '3'], ['Storefront', '4'], ['Cart', '4'],
    ['Orders + Checkout', '4'], ['Payments', '6'], ['Ledger', '8'], ['Refunds', '9'], ['Outbox', '10'], ['Payouts', '11'],
    ['Audit', '12'], ['Observability', '1,12'], ['Delivery', 'R2'], ['Reviews', 'R2'], ['Wishlist', 'R2'], ['Promotions', 'R2'], ['Search', 'R2']];
  s += bandBox(70, 110, 480, 300 + DY, { title: 'apps/api — modules by phase', band: 30, fill: PANEL, stroke: P.indigo900 });
  MODS.forEach(([n, ph], i) => {
    const x = 90 + (i % 2) * 230, y = 156 + Math.floor(i / 2) * 40;
    const done = ph === '2' || ph === '3';
    const r2 = ph === 'R2';
    s += `<rect x="${x}" y="${y}" width="214" height="30" rx="6" fill="${done ? P.moss100 : P.linen100}" stroke="${done ? P.moss600 : LINE}"${r2 ? ' stroke-dasharray="4 3"' : ''}/>`;
    s += t(x + 12, y + 20, n, { size: 12, weight: done ? 700 : 400, fill: done ? P.moss600 : r2 ? MUTED : INK });
    s += t(x + 200, y + 20, r2 ? 'Release 2' : 'phase ' + ph, { size: 10, fill: MUTED, anchor: 'end' });
  });
  s += t(90, 396 + DY, 'shipped', { size: 10.5, fill: P.moss600, weight: 600 });
  s += `<rect x="140" y="${388 + DY}" width="12" height="10" rx="2" fill="${P.moss100}" stroke="${P.moss600}"/>`;
  s += t(160, 396 + DY, 'planned — nothing is scaffolded ahead of its phase', { size: 10.5, fill: MUTED });
  s += `<rect x="455" y="${388 + DY}" width="12" height="10" rx="2" fill="${P.linen100}" stroke="${LINE}" stroke-dasharray="3 2"/>`;
  s += t(473, 396 + DY, 'Release 2', { size: 10.5, fill: MUTED });

  s += bandBox(70, 440 + DY, 300, 130, { title: 'apps/web', band: 30, fill: PANEL, stroke: P.indigo900 });
  s += lines(90, 492 + DY, ['one BFF, two surfaces:', 'buyer storefront at / (CR-001)', 'operator UI under /admin'], { size: 11.5, fill: MUTED, lh: 17 });
  s += bandBox(410, 440 + DY, 300, 130, { title: 'apps/worker', band: 30, fill: PANEL, stroke: P.indigo900 });
  s += lines(430, 492 + DY, ['phase 4: plain interval process —', 'cancels checkouts unpaid 30 min', 'phase 10: BullMQ, outbox claim + retry'], { size: 11.5, fill: MUTED, lh: 17 });

  const PKGS = [['runtime', 'env · Prisma module · request ids · logger', true],
  ['domain', 'pure rules: TenantContext, state machines, money', true],
  ['contracts', 'zod schemas — the wire format, source of truth', true],
  ['database', 'Prisma wiring; prisma/schema one file per model', true],
  ['api-client', 'typed client the web app and tests share', true],
  ['ui', 'the design system — Quartz tokens + components', true],
  ['payments', 'PaymentProvider port + simulator + Stripe (phase 6)', false],
  ['config', 'shared tsconfig / tooling presets', true],
  ['eslint-config', 'the boundary rules, encoded and enforced', true]];
  s += bandBox(750, 110, 420, 460 + DY, { title: 'packages/*', band: 30, fill: PANEL, stroke: P.indigo900 });
  PKGS.forEach(([n, d, shipped], i) => {
    const y = 158 + i * 45;
    s += t(770, y, n, { size: 12.5, weight: 700, fill: shipped ? INK : MUTED, mono: true });
    s += t(770, y + 16, d, { size: 10.5, fill: MUTED });
  });

  s += `<rect x="70" y="${610 + DY}" width="1100" height="120" rx="8" fill="${P.linen50}" stroke="${LINE}"/>`;
  s += t(92, 640 + DY, 'Two rules, enforced by the build', { size: 13, weight: 700, fill: P.madder600 });
  s += lines(92, 666 + DY, ['①  an app may never import another app          ②  a package may never import an app',
    'Both fail ESLint with boundaries/element-types, so the rule is a build error rather than a convention.'],
    { size: 11.5, fill: MUTED, lh: 18 });
  s += t(92, 712 + DY, 'Known gap: a package→app import whose path does not resolve passes lint and tsc — recorded in the README limitations.', { size: 10.5, fill: FAINT });

  s += bandBox(70, 750 + DY, 1100, 120, { title: 'A request, end to end', band: 30, fill: PANEL, stroke: P.indigo900 });
  const chain = ['Browser', 'Web BFF route handler', 'API guard chain', 'Controller', 'Service', 'Repository', 'PostgreSQL'];
  chain.forEach((c, i) => {
    const x = 92 + i * 154;
    s += `<rect x="${x}" y="${798 + DY}" width="140" height="46" rx="7" fill="${P.linen100}" stroke="${LINE}"/>`;
    s += t(x + 70, 818 + DY, c, { size: 11, anchor: 'middle', weight: 600 });
    s += t(x + 70, 834 + DY, ['UI', 'x-org-id or buyer', 'deny by default', 'translate', 'coordinate', 'Prisma only', 'truth'][i], { size: 9.5, anchor: 'middle', fill: MUTED });
    if (i < chain.length - 1) s += arrow(x + 140, 821 + DY, x + 154, 821 + DY, { marker: 'ar', sw: 1.2 });
  });
  return svg(W, H, s);
}

function erdDiagram() {
  const W = 1620, H = 1030; let s = title('MarketCore — entity map', '23 aggregates, created in the phase that uses them (from docs/domain-model.md, CR-001)', W);
  const groups = [
    { name: 'Identity & tenancy', color: P.indigo700, x: 40, entities: [
      { n: 'User', f: ['id', 'email ⧗', 'passwordHash', 'status', 'phase 1'] },
      { n: 'Organization', f: ['id', 'name', 'slug ⧗', 'status', 'phase 2'] },
      { n: 'OrganizationMember', f: ['organizationId', 'userId', 'role', '⧗ (org, user)', 'phase 2'] },
      { n: 'Session', f: ['id', 'userId', 'expiresAt', 'revokedAt', 'phase 2'] },
      { n: 'RefreshToken', f: ['sessionId', 'tokenHash ⧗', 'expiresAt', 'usedAt', 'phase 2'] },
    ] },
    { name: 'Catalog & inventory', color: P.moss600, x: 350, entities: [
      { n: 'Product', f: ['id', 'organizationId', 'priceMinor', 'currency', 'phase 3'] },
      { n: 'Inventory', f: ['productId ⧗', 'available', 'reserved (stays 0)', 'version', 'phase 3'] },
    ] },
    // Drawn under Catalog & inventory in the same column (see `stacked` below).
    { name: 'Cart & checkout', color: P.madder600, x: 350, below: 'Catalog & inventory', entities: [
      { n: 'Cart', f: ['id', 'buyerId ⧗', 'updatedAt', 'phase 4'] },
      { n: 'CartItem', f: ['cartId', 'productId', 'quantity 1–10', '⧗ (cart, product)', 'phase 4'] },
      { n: 'Checkout', f: ['id', 'buyerId', 'status', 'totalMinor', 'currency (one)', 'phase 4'] },
    ] },
    { name: 'Orders & payments', color: P.madder600, x: 660, entities: [
      { n: 'Order', f: ['id', 'checkoutId', 'organizationId', 'buyerId', 'totalMinor', 'phase 4'] },
      { n: 'OrderItem', f: ['orderId', 'productId', 'quantity', 'unitPriceMinor', 'phase 4'] },
      { n: 'IdempotencyKey', f: ['buyerId', 'key', '⧗ (buyer, key)', 'response', 'phase 5'] },
      { n: 'Payment', f: ['id', 'checkoutId', 'amountMinor', 'providerRef', 'phase 6'] },
      { n: 'PaymentAttempt', f: ['paymentId', 'attempt', 'status', 'request', 'phase 6'] },
      { n: 'WebhookEvent', f: ['provider', 'eventId', 'type', 'status', 'phase 6'] },
    ] },
    { name: 'Ledger', color: P.indigo900, x: 970, entities: [
      { n: 'LedgerAccount', f: ['organizationId', 'type', 'currency', 'ownerRef', 'phase 8'] },
      { n: 'LedgerTransaction', f: ['type', 'referenceType', 'referenceId', 'occurredAt', 'phase 8'] },
      { n: 'LedgerEntry', f: ['transactionId', 'accountId', 'signedAmountMinor', 'BigInt', 'phase 8'] },
      { n: 'Refund', f: ['paymentId', 'status', 'amountMinor', 'providerRef', 'phase 9'] },
    ] },
    { name: 'Operations', color: P.umber500, x: 1280, entities: [
      { n: 'OutboxEvent', f: ['aggregateType', 'aggregateId', 'type', 'status', 'phase 10'] },
      { n: 'Payout', f: ['organizationId', 'status', 'amountMinor', 'providerRef', 'phase 11'] },
      { n: 'AuditLog', f: ['actor', 'organization', 'action', 'requestId', 'phase 12'] },
    ] },
  ];
  const draw = (g, y0) => {
    let y = y0; let out = '';
    out += t(g.x, y - 12, g.name.toUpperCase(), { size: 10.5, weight: 700, fill: g.color, ls: '0.09em' });
    for (const e of g.entities) {
      const h = 30 + e.f.length * 15;
      out += `<rect x="${g.x}" y="${y}" width="280" height="${h}" rx="7" fill="#ffffff" stroke="${g.color}" stroke-width="1.4"/>`;
      out += `<rect x="${g.x}" y="${y}" width="280" height="26" rx="7" fill="${g.color}" opacity="0.13"/>`;
      out += t(g.x + 12, y + 18, e.n, { size: 12, weight: 700, fill: g.color });
      // the last field is the phase, drawn faint and not monospaced
      const last = e.f.length - 1;
      e.f.forEach((f, i) => out += t(g.x + 14, y + 42 + i * 15, f, { size: 10.5, fill: i === last ? FAINT : MUTED, mono: i !== last }));
      y += h + 18;
    }
    return { out, y };
  };
  const ends = new Map();
  groups.forEach((g) => {
    const y0 = g.below ? ends.get(g.below) + 30 : 150;
    const r = draw(g, y0); s += r.out; ends.set(g.name, r.y);
  });
  s += t(40, 932, '⧗ unique · BigInt for ledger entries (wire: string codec) · every money-bearing aggregate carries its own currency · append-only where INV-7 applies', { size: 10.5, fill: FAINT });
  s += t(40, 956, 'Relations: Member → User/Organization · Product → Organization · Inventory → Product (1:1) · Cart → User (1:1) · CartItem → Cart/Product · Checkout → User (buyer)', { size: 10.5, fill: MUTED });
  s += t(40, 974, 'Order → Checkout (one per seller) · OrderItem → Order/Product · Payment → Checkout (one charge) · Refund → Payment · LedgerEntry → Transaction/Account', { size: 10.5, fill: MUTED });
  s += t(40, 998, 'Release 2, not drawn: Address · Review · WishlistItem · Promotion · Category — see docs/domain-model.md.', { size: 10.5, fill: FAINT });
  return svg(W, H, s);
}

/* =================== sequence diagrams =================== */

function sequence(cfg) {
  const { title: tt, sub, actors, steps, note } = cfg;
  const LEFT = 60, GAP = Math.min(200, Math.floor((1180 - LEFT * 2) / (actors.length - 1)));
  const headW = Math.min(160, GAP - 20), top = 118, y0 = 190, stepH = 44;
  // minW widens the canvas to the right so a long self-message is not clipped.
  const W = Math.max(cfg.minW || 0, LEFT * 2 + GAP * (actors.length - 1) + headW);
  const noteLines = note ? wrap(note, Math.floor((W - LEFT * 2 - 30) / 5.9)) : [];
  const noteH = note ? noteLines.length * 17 + 28 : 0;
  const H = y0 + steps.length * stepH + 46 + noteH;
  const X = (i) => LEFT + i * GAP + headW / 2;
  let s = title(tt, sub, W);
  actors.forEach((a, i) => {
    const x = X(i) - headW / 2;
    s += `<rect x="${x}" y="${top}" width="${headW}" height="44" rx="7" fill="${P.linen50}" stroke="${P.indigo900}" stroke-width="1.3"/>`;
    s += t(X(i), top + 20, a.n, { size: 12, weight: 700, anchor: 'middle' });
    s += t(X(i), top + 35, a.d || '', { size: 9.5, fill: MUTED, anchor: 'middle' });
    s += `<path d="M ${X(i)} ${top + 44} V ${H - 30}" stroke="${LINE}" stroke-width="1.2" stroke-dasharray="5 5"/>`;
  });
  let y = y0;
  steps.forEach((st) => {
    if (st.type === 'note') {
      s += `<rect x="${X(st.at) - headW / 2 - 6}" y="${y - 16}" width="${st.w || 250}" height="34" rx="5" fill="${P.madder100}" stroke="${P.madder600}" opacity="0.9"/>`;
      s += t(X(st.at) - headW / 2 + 8, y + 5, st.text, { size: 10.5, fill: P.madder600, weight: 600 });
      y += stepH; return;
    }
    if (st.type === 'self') {
      // self-messages are written { from, to: from }; reading only `at` drew them at NaN
      const x = X(st.at ?? st.from), loop = headW / 2 + 26;
      const lw = st.text.length * 5.5 + 10;
      s += `<path d="M ${x} ${y - 8} h ${loop} v 26 h ${-loop}" fill="none" stroke="${st.color || INK}" stroke-width="1.3" marker-end="url(#${st.marker || 'ar'})"/>`;
      s += `<rect x="${x + loop + 8}" y="${y - 2}" width="${lw}" height="15" fill="#ffffff"/>`;
      s += t(x + loop + 12, y + 10, st.text, { size: 10.5, fill: st.color || MUTED });
      y += stepH; return;
    }
    const a = X(st.from), b = X(st.to);
    if (a === b) { return; }
    const dash = st.type === 'return';
    s += arrow(a, y, b, y, { marker: st.marker || (st.type === 'return' ? 'a4' : 'ar'), dash, color: st.color || INK });
    const mx = (a + b) / 2;
    const lw = st.text.length * 5.6 + 12;
    s += `<rect x="${mx - lw / 2}" y="${y - 16}" width="${lw}" height="15" fill="#ffffff"/>`;
    s += t(mx, y - 8, st.text, { size: 10.8, anchor: 'middle', fill: st.color || INK, weight: st.bold ? 600 : 400 });
    y += stepH;
  });
  if (note) {
    y += 8;
    s += `<rect x="${LEFT}" y="${y - 16}" width="${W - LEFT * 2}" height="${noteH}" rx="6" fill="${P.moss100}" stroke="${P.moss600}" opacity="0.9"/>`;
    s += lines(LEFT + 15, y + 4, noteLines, { size: 11, fill: P.moss600, weight: 600, lh: 17 });
  }
  return svg(W, H, s);
}

const seqRotation = () => sequence({
  title: 'Sequence — refresh rotation and reuse detection',
  sub: 'What keeps a session alive, and what kills it (ADR 011, web session)',
  actors: [{ n: 'Browser', d: 'single tab' }, { n: 'Web BFF', d: 'route handler' }, { n: 'API', d: 'AuthService' }, { n: 'Database', d: 'Session / RefreshToken' }],
  steps: [
    { from: 0, to: 1, text: 'GET /api/session (access token stale)' },
    { from: 1, to: 2, text: 'POST /auth/refresh · refresh cookie' },
    { from: 1, to: 1, type: 'self', text: 'single-flight: one rotation for N concurrent calls', color: P.indigo700, marker: 'a2' },
    { from: 2, to: 3, text: 'loadByTokenHash(sha256)' },
    { from: 2, to: 2, type: 'self', text: 'decideRefreshTokenUse(record, now)' },
    { from: 3, to: 2, type: 'return', text: 'record' },
    { from: 2, to: 3, text: 'claimAndRotate — usedAt IS NULL predicate' },
    { from: 3, to: 2, type: 'return', text: 'rotated = true (exactly one wins)' },
    { from: 2, to: 1, type: 'return', text: 'new access + refresh' },
    { from: 1, to: 0, type: 'return', text: '200 · replace both cookies' },
    { from: 0, to: 1, text: 'REPLAY: same refresh token again' },
    { from: 1, to: 2, text: 'POST /auth/refresh' },
    { from: 2, to: 3, text: 'revoke session — reason REUSE_DETECTED', color: P.madder600, marker: 'a3' },
    { from: 2, to: 0, type: 'return', text: '401 — the whole session dies', color: P.madder600 },
  ],
  note: 'Observable: six concurrent session loads produce exactly one /auth/refresh. A replayed token revokes the family, not just the request. Proven by pnpm --filter web test and the behavioural suite.',
});

const seqCheckout = () => sequence({
  title: 'Sequence — multi-seller checkout, all or nothing',
  sub: 'INV-1 never negative · INV-11 every seller’s order or none · 100 buyers race the last unit (phase 4)',
  actors: [{ n: 'Buyers ×100', d: 'each from their own cart' }, { n: 'API', d: 'checkout use case' }, { n: 'Database', d: 'PostgreSQL 16' }],
  minW: 900,
  steps: [
    { from: 0, to: 1, text: 'POST /checkout · Idempotency-Key (buyer-scoped) · cart: seller A + seller B lines' },
    { from: 1, to: 2, text: 'BEGIN' },
    { from: 1, to: 2, text: 'SELECT inventory … WHERE product_id IN (cart) ORDER BY product_id FOR UPDATE', bold: true },
    { from: 2, to: 1, type: 'return', text: 'every row locked, in one fixed order — overlapping carts cannot deadlock' },
    { from: 1, to: 1, type: 'self', text: 'every line: available ≥ quantity ?  one short line fails the whole checkout', color: P.indigo700, marker: 'a2' },
    { from: 1, to: 2, text: 'UPDATE inventory SET available = available - qty, version + 1 (each line)' },
    { from: 1, to: 2, text: 'INSERT Checkout + one Order per seller + OrderItems (prices snapshotted)' },
    { from: 1, to: 2, text: 'INSERT OutboxEvent (same transaction)' },
    { from: 1, to: 2, text: 'COMMIT' },
    { from: 2, to: 1, type: 'return', text: '1 commit — 1 checkout, 2 orders, Pending payment', color: P.moss600, marker: 'a4' },
    { from: 1, to: 0, type: 'return', text: 'exactly 1 × 201 Created · order placed' },
    { from: 1, to: 0, type: 'return', text: '99 × 409 · rollback: 0 orders, 0 stock change, not charged', color: P.madder600 },
    { from: 0, to: 0, type: 'self', text: 'losers land on the cart, the line flagged Sold out', color: P.madder600, marker: 'a3' },
  ],
  note: 'Observable: 100 buyers for the last unit leave one checkout, stock 0 — never negative — and 99 Sold out carts. A 3-seller cart with one short line leaves 0 orders and every stock unchanged. Gate: pnpm --filter api test:concurrency.',
});

const seqAutoCancel = () => sequence({
  title: 'Sequence — abandoned checkout auto-cancelled',
  sub: 'INV-15: an abandoned checkout restores its stock exactly once (phase 4 worker, D70)',
  actors: [{ n: 'Worker run A', d: 'interval process' }, { n: 'Worker run B', d: 'overlapping run' }, { n: 'Database', d: 'Checkout / Order / Inventory' }],
  steps: [
    { from: 0, to: 2, text: 'find checkouts Pending payment with placedAt < now − 30 min' },
    { from: 0, to: 2, text: 'BEGIN · UPDATE checkout SET status = Cancelled WHERE id = C AND status = Pending payment', bold: true },
    { from: 1, to: 2, text: 'same conditional UPDATE for C (concurrent) — waits on the row' },
    { from: 2, to: 0, type: 'return', text: 'count = 1 — this run owns the cancellation', color: P.moss600 },
    { from: 0, to: 2, text: 'orders of C → Cancelled · inventory available += qty (each line)' },
    { from: 0, to: 2, text: 'COMMIT' },
    { from: 2, to: 1, type: 'return', text: 'status re-checked after the lock: count = 0', color: P.madder600 },
    { from: 1, to: 1, type: 'self', text: 'stop — no restock, nothing to do', color: P.madder600, marker: 'a3' },
  ],
  note: 'Observable: two concurrent cancellation runs over one expired checkout restore each product’s stock once. The status predicate, not a lock service or a queue, is the guard — so the phase-4 worker needs no Redis.',
});

const seqWebhook = () => sequence({
  title: 'Sequence — a payment webhook, delivered twice',
  sub: 'INV-4: each business side effect at most once (phases 6–8)',
  actors: [{ n: 'Provider', d: 'Stripe' }, { n: 'API', d: 'webhook controller' }, { n: 'Database', d: 'PostgreSQL' }, { n: 'Worker', d: 'phase 10' }],
  steps: [
    { from: 0, to: 1, text: 'POST /webhooks  payment_intent.succeeded  (eventId evt_1)' },
    { from: 1, to: 2, text: 'INSERT WebhookEvent (provider, eventId) — unique ⧗' },
    { from: 2, to: 1, type: 'return', text: 'inserted' },
    { from: 1, to: 2, text: 'checkout payment Pending → Succeeded · every order → Paid' },
    { from: 1, to: 2, text: 'INSERT LedgerTransaction: seller payables + platform revenue (sum = 0)' },
    { from: 1, to: 2, text: 'INSERT OutboxEvent (same transaction)' },
    { from: 1, to: 0, type: 'return', text: '200 OK' },
    { from: 0, to: 1, text: 'RETRY: same event evt_1 delivered again' },
    { from: 1, to: 2, text: 'INSERT WebhookEvent — unique violation' },
    { from: 2, to: 1, type: 'return', text: 'already seen', color: P.madder600 },
    { from: 1, to: 1, type: 'self', text: 'no transition, no ledger entry — 200, no work', color: P.madder600, marker: 'a3' },
    { from: 1, to: 0, type: 'return', text: '200 OK (idempotent)' },
    { from: 3, to: 2, text: 'worker later claims the outbox row' },
  ],
  note: 'Observable: repeated delivery produces one state transition and one ledger transaction. The provider event id, not the payload, is the key.',
});

const seqOutbox = () => sequence({
  title: 'Sequence — outbox recovery after a crash',
  sub: 'INV-10: a committed event is processed exactly once after recovery (phase 10)',
  actors: [{ n: 'API', d: 'business tx' }, { n: 'Database', d: 'outbox table' }, { n: 'Worker', d: 'BullMQ, phase 10' }, { n: 'Provider', d: 'external effect' }],
  minW: 940,
  steps: [
    { from: 0, to: 1, text: 'BEGIN · business state + OutboxEvent(status=pending) · COMMIT' },
    { from: 2, to: 1, text: 'claim pending rows  (SKIP LOCKED, lease)' },
    { from: 1, to: 2, type: 'return', text: 'row claimed' },
    { from: 2, to: 3, text: 'perform the side effect' },
    { from: 2, to: 2, type: 'self', text: '✗ process killed before marking processed', color: P.madder600, marker: 'a3' },
    { from: 2, to: 1, type: 'self', text: 'lease expires — row becomes claimable again', color: P.indigo700, marker: 'a2' },
    { from: 2, to: 1, text: 'claim again (retry)' },
    { from: 2, to: 3, text: 'side effect — must be idempotent (same operation key)' },
    { from: 2, to: 1, text: 'UPDATE status = processed' },
    { from: 1, to: 2, type: 'return', text: 'processed' },
  ],
  note: 'Observable: killed between commit and publication, the event is still processed exactly once after recovery. Publication may repeat; the consumer is idempotent regardless (architecture rule 6).',
});

const seqPayout = () => sequence({
  title: 'Sequence — two workers race one payout',
  sub: 'INV-8: a payout is executed at most once (phase 11)',
  actors: [{ n: 'Worker A', d: 'payout processor' }, { n: 'Worker B', d: 'payout processor' }, { n: 'Database', d: 'Payout row' }, { n: 'Provider', d: 'transfer' }],
  steps: [
    { from: 0, to: 2, text: 'claim payout P — WHERE status = requested' },
    { from: 1, to: 2, text: 'claim payout P — WHERE status = requested (concurrent)' },
    { from: 2, to: 0, type: 'return', text: 'updateMany count = 1 · Requested → Processing', color: P.moss600 },
    { from: 2, to: 1, type: 'return', text: 'count = 0 — lost the race', color: P.madder600 },
    { from: 1, to: 1, type: 'self', text: 'stop — no provider call', color: P.madder600, marker: 'a3' },
    { from: 0, to: 3, text: 'exactly one provider transfer' },
    { from: 3, to: 0, type: 'return', text: 'transfer id' },
    { from: 0, to: 2, text: 'Processing → Paid' },
  ],
  note: 'Observable: under concurrent claims, exactly one provider transfer is initiated per payout. The state predicate — not the worker — is the guard.',
});

/* =================== emit =================== */
const files = [
  { sec: 'Structure', name: '01-context', svg: contextDiagram() },
  { sec: 'Structure', name: '02-containers', svg: containerDiagram() },
  { sec: 'Structure', name: '03-modules', svg: moduleDiagram() },
  { sec: 'Structure', name: '04-entity-map', svg: erdDiagram() },
  { sec: 'Behaviour', name: '05-seq-refresh-rotation', svg: seqRotation() },
  { sec: 'Behaviour', name: '06-seq-checkout-all-or-nothing', svg: seqCheckout() },
  { sec: 'Behaviour', name: '07-seq-auto-cancel', svg: seqAutoCancel() },
  { sec: 'Behaviour', name: '08-seq-webhook-dedupe', svg: seqWebhook() },
  { sec: 'Behaviour', name: '09-seq-outbox-recovery', svg: seqOutbox() },
  { sec: 'Behaviour', name: '10-seq-payout-race', svg: seqPayout() },
];
files.forEach(f => fs.writeFileSync(path.join(OUT, f.name + '.svg'), f.svg));

const sec = (name) => files.filter(f => f.sec === name);
const card = (f) => `<section class="card"><h2><span>${f.sec}</span>${f.name.replace(/^\d+-/, '').replace(/-/g, ' ')} <code>${f.name}.svg</code></h2><div class="cv"><img src="${f.name}.svg" alt="${f.name}"></div></section>`;
const index = `<!doctype html><meta charset="utf-8"><title>MarketCore — system design</title>
<style>
:root{--canvas:${CANVAS};--panel:${PANEL};--ink:${INK};--muted:${MUTED};--faint:${FAINT};--line:${LINE};--rail:${P.indigo900}}
body{margin:0;background:var(--canvas);color:var(--ink);font:15px/1.55 Helvetica,Arial,sans-serif}
.top{background:var(--rail);color:${P.linen50};padding:26px 44px}
.top h1{margin:0;font-size:23px}.top p{margin:6px 0 0;color:${P.indigo300};max-width:90ch}
.top nav{display:flex;gap:18px;margin-top:14px;font-size:12.5px}.top a{color:${P.linen100};text-decoration:none;border-bottom:1px solid ${P.indigo600};padding-bottom:2px}
h3.sec{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:34px 44px 4px}
.grid{padding:8px 44px 60px;display:grid;gap:30px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.card h2{margin:0;padding:12px 16px;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted);font-weight:600;text-transform:capitalize;display:flex;gap:10px;align-items:baseline}
.card h2 span{background:${P.indigo900};color:${P.linen100};font-size:10px;padding:2px 7px;border-radius:3px;letter-spacing:.06em;text-transform:uppercase}
.card h2 code{color:var(--faint);font-weight:400}
.cv{padding:16px;overflow:auto}img{display:block}
.legend{margin:0 44px;display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted)}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
</style>
<div class="top"><h1>MarketCore — system design</h1>
<p>Structure and behaviour for the whole project: C4 context and containers, the module map and its enforced boundaries, the entity map, and the sequences behind each race the project exists to prove. Colours here follow the diagrams' own categorical palette rather than the app's brand tokens — in a diagram a colour is a legend. SVG — import into Figma or Miro.</p>
<nav><a href="#structure">Structure</a><a href="#behaviour">Behaviour</a></nav></div>
<div class="legend"><span><i style="background:${P.indigo700}"></i>control / identity</span><span><i style="background:${P.moss600}"></i>shipped</span><span><i style="background:${P.madder600}"></i>attention / failure</span><span><i style="background:${P.umber500}"></i>operations</span></div>
<h3 class="sec" id="structure">Structure</h3><div class="grid">${sec('Structure').map(card).join('')}</div>
<h3 class="sec" id="behaviour">Behaviour</h3><div class="grid">${sec('Behaviour').map(card).join('')}</div>`;
fs.writeFileSync(path.join(OUT, 'index.html'), index);
console.log('wrote', files.length, 'svgs + index.html to', OUT);
console.log(files.map(f => ' - ' + f.name + '.svg').join('\n'));
