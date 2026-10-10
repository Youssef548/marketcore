import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Writes beside this script, so the generator is portable and a rerun updates
// the committed board in place.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'ui');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

/* oklch -> hex (selvedge's real values, so Figma gets the true colours) */
function oklch(L, C, h) {
  const hr = (h * Math.PI) / 180; const a = C * Math.cos(hr), b = C * Math.sin(hr);
  const l = L + 0.3963377774 * a + 0.2158037573 * b, m = L - 0.1055613458 * a - 0.0638541728 * b, s = L - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l ** 3, m3 = m ** 3, s3 = s ** 3;
  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3, g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3, bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  const f = (x) => { x = Math.max(0, Math.min(1, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; };
  const to = (x) => Math.round(f(x) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(bl)}`;
}
const C = {
  canvas: oklch(0.958, 0.011, 89.7), panel: oklch(0.994, 0.006, 84.6), sunken: oklch(0.923, 0.017, 88),
  rule: oklch(0.864, 0.011, 89.7), ruleStrong: oklch(0.751, 0.01, 87.5),
  rail: oklch(0.287, 0.053, 262.6), railEdge: oklch(0.229, 0.048, 262.4), railHover: oklch(0.345, 0.047, 263), railActive: oklch(0.401, 0.042, 263.2),
  indigo300: oklch(0.72, 0.021, 263), indigo400: oklch(0.62, 0.11, 263), indigo600: oklch(0.401, 0.042, 263.2),
  ink: oklch(0.245, 0.012, 84.6), inkMuted: oklch(0.45, 0.015, 84.6), inkFaint: oklch(0.51, 0.01, 84.6),
  action: oklch(0.391, 0.08, 263.8), actionHover: oklch(0.497, 0.064, 264.2),
  attention: oklch(0.488, 0.13, 31.2), attentionWash: oklch(0.955, 0.022, 32),
  positive: oklch(0.479, 0.078, 161.1), positiveWash: oklch(0.955, 0.02, 155), paper: '#ffffff',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------------- components ---------------- */
const NAV = [
  { k: 'dashboard', t: 'Dashboard' }, { k: 'products', t: 'Products' }, { k: 'orders', t: 'Orders' },
  { k: 'refunds', t: 'Refunds' }, { k: 'payouts', t: 'Payouts' }, { k: 'members', t: 'Members' }, { k: 'operations', t: 'Operations' },
];
const rail = (active) => `
  <aside class="rail">
    <div class="brand"><span class="mark"></span><div><b>MarketCore</b><i>operator console</i></div></div>
    <div class="tenant">
      <span class="lbl">Organization</span>
      <button class="orgsel"><span class="dot"></span>Nile Traders<svg viewBox="0 0 10 6"><path d="M0 0l5 6 5-6z"/></svg></button>
    </div>
    <nav>${NAV.map(n => `<a class="${n.k === active ? 'on' : ''}">${n.t}</a>`).join('')}</nav>
    <div class="railfoot">v0.1 · phase 3 of 15</div>
  </aside>`;

const topbar = (title, sub, right = '') => `
  <header class="topbar">
    <div class="titles"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
    <div class="topright">${right}
      <div class="user"><span class="ava">Y</span><div><b>owner@marketcore.test</b><i>Owner · Nile Traders</i></div></div>
      <button class="btn ghost sm">Sign out</button>
    </div>
  </header>`;

const frame = (id, label, note, body, w = 1360, h = 880) =>
  `<figure class="frame-wrap"><figcaption><b>${esc(label)}</b><span>${esc(note)}</span><em>${w} × ${h}</em></figcaption><div class="frame" id="${id}" style="width:${w}px;height:${h}px">${body}</div></figure>`;

const app = (active, title, sub, content, right) =>
  `<div class="app">${rail(active)}<div class="main">${topbar(title, sub, right)}<div class="content">${content}</div></div></div>`;

const badge = (tone, text) => `<span class="badge ${tone}">${esc(text)}</span>`;
const track = (v, max, tone = 'ok') => {
  const pct = Math.max(4, Math.min(100, Math.round((v / max) * 100)));
  return `<div class="trackwrap"><div class="track"><i class="${tone}" style="width:${pct}%"></i></div><span>${v}</span></div>`;
};
const money = (minor, cur = 'EGP') => `${cur === 'EGP' ? 'E£' : '$'}${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

/* ---------------- frames ---------------- */

const foundations = () => {
  const sw = (name, val, role) => `<div class="sw"><span style="background:${val}"></span><b>${name}</b><i>${role}</i><code>${val}</code></div>`;
  const surfaces = [['canvas', C.canvas, 'app background'], ['panel', C.panel, 'cards, surfaces'], ['sunken', C.sunken, 'inset wells'], ['rail', C.rail, 'navigation plane']];
  const text = [['ink', C.ink, 'primary text'], ['ink-muted', C.inkMuted, 'secondary'], ['ink-faint', C.inkFaint, 'tertiary'], ['ink-on-action', C.paper, 'on indigo']];
  const edge = [['rule', C.rule, 'hairlines'], ['rule-strong', C.ruleStrong, 'control borders']];
  const state = [['action', C.action, 'primary action'], ['attention', C.attention, 'needs attention'], ['positive', C.positive, 'healthy / paid'], ['focus-ring', C.indigo400, 'focus']];
  const body = `
    <div class="doc">
      <div class="dochead"><h1>Foundations — selvedge</h1><p>One direction: indigo chrome, undyed-linen canvas, warm dark ink, a single indigo action colour and madder red reserved for attention. Components name <b>roles</b>, never hues, so the look is one file.</p></div>
      <section><h4>Surface</h4><div class="swrow">${surfaces.map(([n, v, r]) => sw(n, v, r)).join('')}</div></section>
      <section><h4>Text</h4><div class="swrow">${text.map(([n, v, r]) => sw(n, v, r)).join('')}</div></section>
      <section><h4>Edge</h4><div class="swrow">${edge.map(([n, v, r]) => sw(n, v, r)).join('')}</div></section>
      <section><h4>State &amp; control</h4><div class="swrow">${state.map(([n, v, r]) => sw(n, v, r)).join('')}</div></section>
      <section><h4>Type — system sans, one scale</h4>
        <div class="typerow"><span style="font-size:26px;font-weight:700">Page title</span><span style="font-size:15px">Body 15</span><span style="font-size:13px">UI 13</span><span class="lbl">LABEL 11</span><code class="mono">code 12.5</code></div>
      </section>
      <section><h4>Signature motifs</h4>
        <div class="motifs">
          <div><span class="motiflabel">status thread — 3px on the leading edge, coloured by state</span>
            <div class="threaddemo">${['positive', 'attention', 'sunken'].map(x => `<div class="threadrow"><i class="${x}"></i><span>row</span></div>`).join('')}</div></div>
          <div><span class="motiflabel">quantity track — length is stock, not decoration</span>
            <div class="trackdemo">${[track(10, 10), track(3, 10, 'warn'), track(0, 10, 'bad')].map(x => x).join('')}</div></div>
        </div>
      </section>
      <section><h4>Radius &amp; control</h4><div class="ctlrow"><code>--radius-brand 7px</code><button class="btn">Primary action</button><button class="btn ghost">Secondary</button><button class="btn quiet">Quiet</button><input class="input" style="width:200px" value="Text field" /><span class="badge published">published</span><span class="badge draft">draft</span><span class="badge attention">failed</span></div></section>
    </div>`;
  return frame('foundations', 'Foundations', 'Tokens, type, signature motifs', body, 1360, 1250);
};

const signin = () => `
  <div class="authwrap">
    <div class="authcard">
      <div class="brandbig"><span class="mark lg"></span><b>MarketCore</b></div>
      <h2>Sign in</h2><p class="muted">Use your organization account to continue.</p>
      <label class="field"><span class="lbl">Email</span><input class="input" value="owner@marketcore.test"></label>
      <label class="field"><span class="lbl">Password</span><input class="input" type="password" value="correct-horse-battery"></label>
      <div class="alertbad">That email and password don't match an account.</div>
      <button class="btn full">Sign in</button>
      <p class="authfoot">No account? <a>Create one</a></p>
    </div>
    <div class="authnote">Error state shown. The API answers the same way for an unknown email and a wrong password, so this screen never reveals which.</div>
  </div>`;

const register = () => `
  <div class="authwrap">
    <div class="authcard">
      <div class="brandbig"><span class="mark lg"></span><b>MarketCore</b></div>
      <h2>Create your account</h2><p class="muted">12 characters or more — a policy, not a suggestion.</p>
      <label class="field"><span class="lbl">Email</span><input class="input" placeholder="you@company.test"></label>
      <label class="field"><span class="lbl">Password</span><input class="input" placeholder="at least 12 characters"><em class="hint">12+ code points</em></label>
      <button class="btn full">Create account</button>
      <p class="authfoot">Already have one? <a>Sign in</a></p>
    </div>
  </div>`;

const products = () => {
  const rows = [
    ['Nile Cotton Shirt', 'published', 24900, 10, '2 min ago'],
    ['Giza Sheet Set', 'draft', 125000, 0, 'yesterday'],
    ['Ramie Table Runner', 'published', 18000, 3, '3 days ago'],
    ['Delta Olive Oil', 'published', 18900, 24, 'last week'],
  ];
  return app('products', 'Products', '4 products · 2 published', `
    <div class="toolbar">
      <input class="input search" placeholder="Search products…">
      <button class="btn ghost">Filter</button><span class="spacer"></span>
      <button class="btn">New product</button>
    </div>
    <div class="card">
      <table class="tbl big"><thead><tr><th>Product</th><th>Status</th><th>Price</th><th>Available</th><th>Updated</th></tr></thead><tbody>
      ${rows.map(([n, st, p, a, u]) => `
        <tr>
          <td class="thread ${st === 'published' ? 'positive' : 'sunken'}"><b>${n}</b></td>
          <td>${badge(st, st)}</td>
          <td class="mono">${money(p)}</td>
          <td>${track(a, 24, a === 0 ? 'bad' : a <= 3 ? 'warn' : 'ok')}</td>
          <td class="muted">${u}</td>
        </tr>`).join('')}
      </tbody></table>
      <div class="tblfoot">The 3px thread on the leading edge is the direction's signature — one row is findable by scanning the left margin.</div>
    </div>`);
};

const productDetail = () => app('products', 'Nile Cotton Shirt', 'Product · Nile Traders', `
  <div class="cols">
    <div class="stack">
      <div class="card pad">
        <div class="cardhead"><h3>Details</h3>${badge('published', 'published')}</div>
        <label class="field"><span class="lbl">Name</span><input class="input" value="Nile Cotton Shirt"></label>
        <div class="row2">
          <label class="field"><span class="lbl">Price</span><input class="input mono" value="249.00"></label>
          <label class="field"><span class="lbl">Currency</span><input class="input" value="EGP"></label>
        </div>
        <div class="actions"><button class="btn">Save changes</button><button class="btn ghost">Unpublish</button></div>
      </div>
    </div>
    <div class="stack">
      <div class="card pad">
        <div class="cardhead"><h3>Inventory</h3></div>
        <div class="bignum">10 <span>available</span></div>
        ${track(10, 10)}
        <div class="kv"><span>Reserved</span><b>0</b></div>
        <div class="kv"><span>Version</span><b class="mono">7</b></div>
        <p class="muted small">The database enforces <code>available ≥ 0</code> with a CHECK constraint — the API cannot sell what it does not have.</p>
      </div>
      <div class="card pad">
        <div class="cardhead"><h3>Publish rule</h3></div>
        <p class="muted small">A product may move DRAFT → PUBLISHED only when its price is at least 1 minor unit. Publishing a free product is refused, not silently allowed.</p>
      </div>
    </div>
  </div>`);

const orders = () => {
  const rows = [
    ['#1042', 'm.buyer@marketcore.test', 1, 24900, 'paid', 'fulfilling'],
    ['#1041', 's.ahmed@marketcore.test', 2, 49800, 'paid', 'completed'],
    ['#1040', 'k.hassan@marketcore.test', 1, 18900, 'processing', 'pending'],
    ['#1039', 'n.said@marketcore.test', 1, 24900, 'refunded', 'cancelled'],
  ];
  return app('orders', 'Orders', '4 orders · 1 needs attention', `
    <div class="toolbar"><input class="input search" placeholder="Search by order or buyer…"><button class="btn ghost">Status</button><span class="spacer"></span><button class="btn ghost">Export</button></div>
    <div class="card"><table class="tbl big"><thead><tr><th>Order</th><th>Buyer</th><th>Items</th><th>Total</th><th>Payment</th><th>Fulfilment</th></tr></thead><tbody>
    ${rows.map(([o, b, i, t, p, f]) => `<tr>
      <td class="thread ${p === 'refunded' ? 'attention' : 'positive'}"><b class="mono">${o}</b></td>
      <td>${b}</td><td>${i}</td><td class="mono">${money(t)}</td>
      <td>${badge(p === 'paid' ? 'published' : p === 'refunded' ? 'attention' : 'draft', p)}</td>
      <td>${badge('draft', f)}</td></tr>`).join('')}
    </tbody></table></div>`);
};

const orderDetail = () => app('orders', 'Order #1042', 'Placed 2 minutes ago · Nile Traders', `
  <div class="pillrow">${['pending payment', 'paid', 'fulfilling', 'completed'].map((s, i) => `<span class="pill ${i <= 1 ? 'done' : ''}">${s}</span>`).join('<i class="pillarrow">→</i>')}</div>
  <div class="cols">
    <div class="stack">
      <div class="card">
        <div class="cardhead"><h3>Items</h3></div>
        <table class="tbl"><thead><tr><th>Product</th><th>Qty</th><th>Unit</th><th>Line</th></tr></thead><tbody>
          <tr><td class="thread positive">Nile Cotton Shirt</td><td>1</td><td class="mono">${money(24900)}</td><td class="mono">${money(24900)}</td></tr>
        </tbody><tfoot><tr><td colspan="3" class="right muted">Total</td><td class="mono"><b>${money(24900)}</b></td></tr></tfoot></table>
      </div>
      <div class="card">
        <div class="cardhead"><h3>Ledger</h3>${badge('published', 'balanced')}</div>
        <table class="tbl"><thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>
          <tr><td>Platform cash</td><td class="mono pos">${money(24900)}</td><td class="mono">—</td></tr>
          <tr><td>Seller payable</td><td class="mono">—</td><td class="mono">${money(22410)}</td></tr>
          <tr><td>Platform revenue</td><td class="mono">—</td><td class="mono">${money(2490)}</td></tr>
        </tbody><tfoot><tr><td class="right muted">Signed sum</td><td colspan="2" class="mono pos">0.00</td></tr></tfoot></table>
        <div class="tblfoot">Append-only: entries are never edited. A correction is a compensating transaction, not a rewrite.</div>
      </div>
    </div>
    <div class="stack">
      <div class="card pad"><div class="cardhead"><h3>Payment</h3></div>
        <div class="kv"><span>Status</span><b>${badge('published', 'succeeded')}</b></div>
        <div class="kv"><span>Attempts</span><b>1</b></div>
        <div class="kv"><span>Provider ref</span><b class="mono small">pi_3Qk…9d2</b></div>
      </div>
      <div class="card pad"><div class="cardhead"><h3>Timeline</h3></div>
        <ul class="tl"><li><b>Payment captured</b><span>2 min ago · webhook applied once</span></li><li><b>Order created</b><span>2 min ago · inventory 10 → 9</span></li><li><b>Checkout</b><span>2 min ago · idempotency key reused 0×</span></li></ul>
      </div>
      <div class="card pad"><div class="cardhead"><h3>Actions</h3></div>
        <div class="actions col"><button class="btn ghost">Refund</button><button class="btn quiet">Cancel order</button></div>
      </div>
    </div>
  </div>`);

const refunds = () => app('refunds', 'Refunds', 'INV-5 — refunds never exceed the capture', `
  <div class="cols">
    <div class="stack">
      <div class="card"><table class="tbl big"><thead><tr><th>Refund</th><th>Order</th><th>Amount</th><th>Status</th></tr></thead><tbody>
        <tr><td class="thread positive">RF-0042</td><td class="mono">#1039</td><td class="mono">${money(24900)}</td><td>${badge('published', 'succeeded')}</td></tr>
        <tr><td class="thread attention">RF-0041</td><td class="mono">#1036</td><td class="mono">${money(9000)}</td><td>${badge('attention', 'failed')}</td></tr>
        <tr><td class="thread draft">RF-0040</td><td class="mono">#1032</td><td class="mono">${money(5000)}</td><td>${badge('draft', 'processing')}</td></tr>
      </tbody></table></div>
    </div>
    <div class="stack">
      <div class="card pad"><div class="cardhead"><h3>Request a refund</h3></div>
        <label class="field"><span class="lbl">Order</span><input class="input mono" value="#1039"></label>
        <label class="field"><span class="lbl">Amount</span><input class="input mono" value="249.00"><em class="hint">captured: 249.00 EGP</em></label>
        <div class="alertwarn">A refund above the captured total is refused before the provider is called.</div>
        <button class="btn full">Request refund</button>
      </div>
      <div class="card pad"><div class="cardhead"><h3>Ledger effect</h3></div>
        <p class="muted small">A refund posts a <b>reversing</b> transaction — seller payable and platform revenue are debited, platform cash credited. The original capture is never touched.</p>
      </div>
    </div>
  </div>`);

const payouts = () => app('payouts', 'Payouts', 'INV-8 — a payout is executed at most once', `
  <div class="stats">
    <div class="stat"><span class="lbl">Available</span><b>${money(615000)}</b><i class="pos">withdrawable now</i></div>
    <div class="stat"><span class="lbl">Pending settlement</span><b>${money(182400)}</b><i>clears in 2 days</i></div>
    <div class="stat"><span class="lbl">Paid out (all time)</span><b>${money(3487000)}</b><i>41 payouts</i></div>
  </div>
  <div class="toolbar"><span class="spacer"></span><button class="btn">Request payout</button></div>
  <div class="card"><table class="tbl big"><thead><tr><th>Payout</th><th>Amount</th><th>Status</th><th>Provider ref</th><th>Requested</th></tr></thead><tbody>
    <tr><td class="thread positive">PO-0031</td><td class="mono">${money(224100)}</td><td>${badge('published', 'paid')}</td><td class="mono small">tr_1Qk…</td><td class="muted">Mon</td></tr>
    <tr><td class="thread draft">PO-0032</td><td class="mono">${money(615000)}</td><td>${badge('draft', 'processing')}</td><td class="mono small">—</td><td class="muted">today</td></tr>
    <tr><td class="thread attention">PO-0030</td><td class="mono">${money(98000)}</td><td>${badge('attention', 'failed')}</td><td class="mono small">—</td><td class="muted">Fri</td></tr>
  </tbody></table>
  <div class="tblfoot">Two workers may race one payout; the state predicate — not the worker — is the guard, so exactly one provider transfer is initiated.</div></div>`);

const members = () => app('members', 'Members', 'Nile Traders · 2 members', `
  <div class="cols">
    <div class="stack">
      <div class="card"><table class="tbl big"><thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Joined</th></tr></thead><tbody>
        <tr><td class="thread positive"><b>owner@marketcore.test</b></td><td>${badge('published', 'owner')}</td><td>${badge('published', 'active')}</td><td class="muted">Sep 19</td></tr>
        <tr><td class="thread sunken"><b>member@marketcore.test</b></td><td>${badge('draft', 'member')}</td><td>${badge('published', 'active')}</td><td class="muted">Sep 20</td></tr>
      </tbody></table>
      <div class="tblfoot">The last owner cannot be removed — a count over sibling rows, enforced in a transaction, with its own test.</div></div>
    </div>
    <div class="stack">
      <div class="card pad"><div class="cardhead"><h3>Add a member</h3></div>
        <label class="field"><span class="lbl">Email</span><input class="input" placeholder="teammate@company.test"></label>
        <label class="field"><span class="lbl">Role</span><select class="input"><option>Member</option><option>Owner</option></select></label>
        <button class="btn full">Add to organization</button>
        <p class="muted small">Nothing sends email yet — this adds an existing MarketCore user by address.</p>
      </div>
      <div class="card pad"><div class="cardhead"><h3>Tenant isolation</h3></div>
        <p class="muted small">The organization is chosen in the rail and attached as <code>x-organization-id</code>. A cross-tenant read answers <b>404</b>; a header naming someone else's tenant answers <b>403</b>.</p>
      </div>
    </div>
  </div>`);

const operations = () => app('operations', 'Operations', 'Trace and recover failed work', `
  <div class="toolbar"><span class="pill done">All systems normal</span><span class="spacer"></span><input class="input search" placeholder="Filter by request id…"></div>
  <div class="cols">
    <div class="stack">
      <div class="card"><div class="cardhead"><h3>Webhook events</h3><span class="muted small">deduplicated by (provider, eventId)</span></div>
        <table class="tbl"><thead><tr><th>Event</th><th>Type</th><th>Applied</th></tr></thead><tbody>
          <tr><td class="thread positive mono small">evt_1Qk…9d2</td><td>payment_intent.succeeded</td><td>${badge('published', 'once')}</td></tr>
          <tr><td class="thread sunken mono small">evt_1Qk…9d2</td><td>payment_intent.succeeded</td><td>${badge('draft', 'duplicate — no-op')}</td></tr>
          <tr><td class="thread attention mono small">evt_1Qk…11a</td><td>charge.refunded</td><td>${badge('attention', 'retrying')}</td></tr>
        </tbody></table></div>
    </div>
    <div class="stack">
      <div class="card"><div class="cardhead"><h3>Outbox jobs</h3><span class="muted small">at-least-once, idempotent</span></div>
        <table class="tbl"><thead><tr><th>Job</th><th>Attempts</th><th>Request id</th></tr></thead><tbody>
          <tr><td class="thread positive">publish.order.paid</td><td>1</td><td class="mono small">req_9616c9…</td></tr>
          <tr><td class="thread attention">publish.refund.succeeded</td><td>3</td><td class="mono small">req_2bb178…</td></tr>
          <tr><td class="thread draft">publish.payout.paid</td><td>—</td><td class="mono small">req_053540…</td></tr>
        </tbody></table>
        <div class="tblfoot">A job killed between commit and publication stays claimable and is retried — processed exactly once after recovery.</div>
      </div>
    </div>
  </div>`);

const statesFrame = () => {
  const body = `
    <div class="doc">
      <div class="dochead"><h1>States</h1><p>The shapes a screen takes before and instead of data. Empty and error are designed, not defaulted — they are where a user learns what to do.</p></div>
      <div class="stategrid">
        <div class="card pad"><span class="lbl">Loading</span><div class="skel" style="width:60%"></div><div class="skel" style="width:90%"></div><div class="skel" style="width:75%"></div><div class="skel" style="width:40%"></div></div>
        <div class="card pad empty"><span class="emblem"></span><b>No products yet</b><p class="muted small">Products you add to Nile Traders appear here.</p><button class="btn">New product</button></div>
        <div class="card pad"><span class="lbl">Error</span><div class="alertbad"><b>Query failed</b><span class="mono small">req_2bb178…</span></div><p class="muted small">Every failure carries one envelope: a code to branch on, a message, and the request id that joins it to a log line.</p></div>
        <div class="card pad empty"><span class="emblem slash"></span><b>404 — not found</b><p class="muted small">A product from another organization answers 404, never 403: an id is a probe, and 403 would confirm it exists.</p></div>
      </div>
    </div>`;
  return frame('states', 'States', 'Loading · empty · error · not found', body, 1360, 620);
};

/* ---------------- document ---------------- */
const css = `
:root{
  --canvas:${C.canvas};--panel:${C.panel};--sunken:${C.sunken};--rule:${C.rule};--rule-strong:${C.ruleStrong};
  --rail:${C.rail};--rail-edge:${C.railEdge};--rail-hover:${C.railHover};--rail-active:${C.railActive};
  --ink:${C.ink};--ink-muted:${C.inkMuted};--ink-faint:${C.inkFaint};--indigo300:${C.indigo300};--focus:${C.indigo400};
  --action:${C.action};--action-hover:${C.actionHover};--attention:${C.attention};--attention-wash:${C.attentionWash};
  --positive:${C.positive};--positive-wash:${C.positiveWash};--paper:${C.paper};--radius:7px;
}
*{box-sizing:border-box}
body{margin:0;background:#eceae4;color:var(--ink);
  font:400 15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.boardhead{max-width:1360px;margin:0 auto;padding:34px 24px 8px}
.boardhead h1{margin:0;font-size:26px}.boardhead p{color:var(--ink-muted);max-width:90ch;margin:8px 0 0}
.board{padding:10px 24px 70px;display:flex;flex-direction:column;gap:34px;align-items:center}
.frame-wrap{margin:0;width:1360px;max-width:100%}
figcaption{display:flex;gap:12px;align-items:baseline;padding:0 2px 8px;font-size:12px;color:var(--ink-muted)}
figcaption b{color:var(--ink);font-size:12.5px}figcaption em{margin-left:auto;color:var(--ink-faint);font-style:normal;font-family:ui-monospace,Menlo,monospace}
.frame{background:var(--canvas);border:1px solid #d7d2c6;border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.05)}
.app{display:flex;height:100%}
.muted{color:var(--ink-muted)}.muted.small,.small{font-size:12px}
.pos{color:var(--positive)}.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px}
.lbl{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-muted);font-weight:600}
.link{color:var(--action);font-size:12.5px;text-decoration:none;font-weight:600}
/* rail */
.rail{width:248px;flex:0 0 248px;background:var(--rail);color:var(--paper);display:flex;flex-direction:column;padding:20px 16px}
.brand{display:flex;gap:10px;align-items:center;padding:2px 6px 18px}
.brand b{display:block;font-size:15px;letter-spacing:-.01em}.brand i{font-style:normal;font-size:10.5px;color:var(--indigo300);letter-spacing:.06em;text-transform:uppercase}
.mark{width:26px;height:26px;border-radius:7px;background:var(--rail-active);display:inline-block;position:relative}
.mark:after{content:"";position:absolute;inset:7px 7px 7px 7px;border-left:3px solid #fff;opacity:.9}
.mark.lg{width:34px;height:34px;border-radius:9px}
.tenant{padding:0 6px 16px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:12px}
.tenant .lbl{color:var(--indigo300)}
.orgsel{margin-top:7px;width:100%;display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#fff;border-radius:var(--radius);padding:9px 11px;font:inherit;font-size:13.5px}
.orgsel .dot{width:8px;height:8px;border-radius:50%;background:var(--positive)}
.orgsel svg{width:10px;height:6px;margin-left:auto;fill:var(--indigo300)}
nav{display:flex;flex-direction:column;gap:2px}
nav a{padding:9px 12px;border-radius:var(--radius);color:var(--indigo300);font-size:13.5px;text-decoration:none}
nav a.on{background:var(--railActive);color:#fff;font-weight:600}
.railfoot{margin-top:auto;padding:12px 8px 2px;font-size:10.5px;color:var(--indigo300);opacity:.75;border-top:1px solid rgba(255,255,255,.08)}
/* main */
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.topbar{height:66px;flex:0 0 66px;background:var(--panel);border-bottom:1px solid var(--rule);display:flex;align-items:center;padding:0 22px;gap:16px}
.titles h1{margin:0;font-size:19px;letter-spacing:-.01em}.titles p{margin:1px 0 0;font-size:12px;color:var(--ink-muted)}
.topright{margin-left:auto;display:flex;align-items:center;gap:14px}
.user{display:flex;gap:9px;align-items:center}
.user .ava{width:30px;height:30px;border-radius:50%;background:var(--sunken);border:1px solid var(--rule-strong);display:grid;place-items:center;font-weight:700;font-size:12.5px}
.user b{display:block;font-size:12.5px}.user i{font-style:normal;font-size:10.5px;color:var(--ink-muted)}
.content{flex:1;padding:22px;overflow:hidden}
/* controls */
.btn{background:var(--action);color:#fff;border:1px solid transparent;border-radius:var(--radius);padding:9px 15px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.btn.ghost{background:transparent;color:var(--ink);border-color:var(--rule-strong)}
.btn.quiet{background:transparent;color:var(--ink-muted);border-color:transparent}
.btn.sm{padding:6px 11px;font-size:12px}.btn.full{width:100%;padding:11px}
.input{height:38px;border:1px solid var(--rule-strong);border-radius:var(--radius);padding:0 12px;background:#fff;font:inherit;font-size:13.5px;color:var(--ink);width:100%}
.input:focus{outline:2px solid var(--focus);outline-offset:1px;border-color:var(--focus)}
.search{max-width:300px}
.field{display:block;margin:0 0 14px}
.field .lbl{display:block;margin-bottom:6px}
.field .hint{display:block;margin-top:5px;font-size:11px;color:var(--ink-faint);font-style:normal}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.actions{display:flex;gap:10px;margin-top:6px}.actions.col{flex-direction:column}
.toolbar{display:flex;gap:10px;align-items:center;margin-bottom:14px}.spacer{flex:1}
.pillrow{display:flex;align-items:center;gap:6px;margin-bottom:16px;font-size:12px}
.pill{padding:4px 10px;border-radius:999px;background:var(--sunken);color:var(--ink-muted);border:1px solid var(--rule)}
.pill.done{background:var(--positive-wash);color:var(--positive);border-color:var(--positive)}
.pillarrow{color:var(--ink-faint);font-style:normal}
/* cards + tables */
.card{background:var(--panel);border:1px solid var(--rule);border-radius:10px;overflow:hidden}
.card.pad{padding:16px}
.cardhead{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--rule)}
.cardhead h3{margin:0;font-size:13px;letter-spacing:.01em}.cardhead .link,.cardhead .badge,.cardhead span{margin-left:auto}
.tbl{width:100%;border-collapse:collapse}
.tbl th{text-align:left;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-faint);font-weight:600;padding:11px 16px;border-bottom:1px solid var(--rule)}
.tbl td{padding:12px 16px;font-size:13.5px;border-bottom:1px solid var(--rule)}
.tbl tbody tr:last-child td{border-bottom:0}
.tbl.big td{padding:15px 16px}
.tbl tfoot td{padding:12px 16px;border-top:1px solid var(--rule-strong);background:var(--sunken)}
.tbl .right{text-align:right}
.tblfoot{padding:11px 16px;font-size:11.5px;color:var(--ink-muted);border-top:1px dashed var(--rule-strong)}
/* the signature thread */
.thread{position:relative}
.thread:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px}
.thread.positive:before{background:var(--positive)}
.thread.attention:before{background:var(--attention)}
.thread.sunken:before{background:var(--rule-strong)}
.thread.draft:before{background:var(--rule-strong)}
/* badges */
.badge{display:inline-block;font-size:11px;font-weight:600;padding:2.5px 8px;border-radius:3px;text-transform:lowercase}
.badge.published{background:var(--positive-wash);color:var(--positive)}
.badge.draft{background:var(--sunken);color:var(--ink-muted)}
.badge.attention{background:var(--attention-wash);color:var(--attention)}
/* quantity track */
.trackwrap{display:flex;align-items:center;gap:9px}
.track{width:78px;height:6px;border-radius:3px;background:var(--sunken);overflow:hidden}
.track i{display:block;height:100%}
.track i.ok{background:var(--positive)}.track i.warn{background:var(--attention)}.track i.bad{background:var(--attention);opacity:.5}
.trackwrap span{font-size:12.5px;font-variant-numeric:tabular-nums}
/* layout helpers */
.cols{display:grid;grid-template-columns:1.55fr 1fr;gap:16px;align-items:start}
.stack{display:flex;flex-direction:column;gap:16px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}
.stat{background:var(--panel);border:1px solid var(--rule);border-radius:10px;padding:14px 16px}
.stat b{display:block;font-size:22px;margin:6px 0 3px;letter-spacing:-.02em}
.stat i{font-style:normal;font-size:11.5px;color:var(--ink-muted)}.stat i.pos{color:var(--positive)}.stat i.warn{color:var(--attention)}
.kv{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--rule);font-size:13px}
.kv:last-child{border-bottom:0}.kv span{color:var(--ink-muted)}.kv b{font-size:13px}
.bignum{font-size:34px;font-weight:700;letter-spacing:-.02em;margin:4px 0 10px}.bignum span{font-size:12px;font-weight:400;color:var(--ink-muted)}
.lowrow{display:flex;justify-content:space-between;align-items:center;padding:11px 16px;border-bottom:1px solid var(--rule);font-size:13px}
.lowrow:last-child{border-bottom:0}
.session{padding:13px 16px;display:flex;flex-direction:column;gap:10px;font-size:13px}
.session b{font-size:13.5px}
.tl{list-style:none;margin:0;padding:0}
.tl li{padding:9px 0 9px 16px;position:relative;border-left:2px solid var(--rule)}
.tl li:before{content:"";position:absolute;left:-5px;top:14px;width:8px;height:8px;border-radius:50%;background:var(--positive);border:2px solid var(--panel)}
.tl b{display:block;font-size:12.5px}.tl span{font-size:11.5px;color:var(--ink-muted)}
.alertbad,.alertwarn{border-radius:var(--radius);padding:10px 12px;font-size:12.5px;margin:0 0 14px}
.alertbad{background:var(--attention-wash);color:var(--attention);border:1px solid var(--attention)}
.alertwarn{background:var(--attention-wash);color:var(--attention);border:1px dashed var(--attention)}
/* auth */
.authwrap{height:100%;display:grid;place-items:center;background:var(--canvas);position:relative}
.authcard{width:380px;background:var(--panel);border:1px solid var(--rule);border-radius:12px;padding:28px}
.authcard h2{margin:18px 0 4px;font-size:21px}
.brandbig{display:flex;gap:10px;align-items:center;font-size:17px}
.authfoot{margin:16px 0 0;font-size:12.5px;color:var(--ink-muted);text-align:center}
.authfoot a{color:var(--action);font-weight:600}
.authnote{position:absolute;bottom:22px;font-size:11.5px;color:var(--ink-faint);max-width:520px;text-align:center}
/* foundations + states */
.doc{padding:26px 30px}
.dochead h1{margin:0 0 6px;font-size:22px}.dochead p{margin:0 0 18px;color:var(--ink-muted);max-width:100ch;font-size:13.5px}
.doc section{margin-bottom:18px}
.doc h4{margin:0 0 9px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint)}
.swrow{display:flex;gap:12px;flex-wrap:wrap}
.sw{border:1px solid var(--rule);border-radius:8px;padding:10px;width:180px;background:var(--panel)}
.sw span{display:block;height:38px;border-radius:5px;border:1px solid rgba(0,0,0,.08)}
.sw b{display:block;margin-top:8px;font-size:12.5px}.sw i{font-style:normal;font-size:11px;color:var(--ink-muted);display:block}
.sw code{font-size:10.5px;color:var(--ink-faint)}
.typerow{display:flex;gap:22px;align-items:baseline;background:var(--panel);border:1px solid var(--rule);border-radius:8px;padding:14px 16px}
.typerow .mono{color:var(--ink-muted)}
.motifs{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.motiflabel{display:block;font-size:11.5px;color:var(--ink-muted);margin-bottom:9px}
.threaddemo,.trackdemo{background:var(--panel);border:1px solid var(--rule);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
.threadrow{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--ink-muted);background:var(--sunken);border-radius:4px;padding:6px 10px;position:relative}
.threadrow i{width:3px;height:16px;display:inline-block;border-radius:2px}
.threadrow i.positive{background:var(--positive)}.threadrow i.attention{background:var(--attention)}.threadrow i.sunken{background:var(--rule-strong)}
.ctlrow{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--panel);border:1px solid var(--rule);border-radius:8px;padding:12px 14px}
.stategrid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.stategrid .card{min-height:180px;display:flex;flex-direction:column;gap:10px}
.skel{height:13px;border-radius:4px;background:var(--sunken)}
.empty{align-items:center;justify-content:center;text-align:center}
.emblem{width:38px;height:38px;border-radius:9px;background:var(--sunken);display:inline-block}
.emblem.slash{background:repeating-linear-gradient(45deg,var(--rule-strong),var(--rule-strong) 4px,var(--sunken) 4px,var(--sunken) 8px)}
.empty b{font-size:14px}
`;

const screens = [
  foundations(),
  frame('signin', 'Sign in', 'auth · error state shown', signin(), 1360, 780),
  frame('register', 'Register', 'auth · password policy', register(), 1360, 780),
  frame('dashboard', 'Dashboard', 'session · overview', app('dashboard', 'Dashboard', 'Nile Traders · last 30 days', `<div class="stats">${[['Revenue', money(4829000), '+12.4% vs prev', 'pos'], ['Orders', '128', '+9 this week', 'pos'], ['Low stock', '2', '1 out of stock', 'warn'], ['Payout available', money(615000), 'settles Friday']].map(([l, v, d, t]) => `<div class="stat"><span class="lbl">${l}</span><b>${v}</b><i class="${t}">${d}</i></div>`).join('')}</div><div class="cols"><div class="card"><div class="cardhead"><h3>Recent orders</h3><a class="link">View all</a></div><table class="tbl"><thead><tr><th>Order</th><th>Buyer</th><th>Total</th><th>Payment</th></tr></thead><tbody><tr><td class="thread positive"><b>#1042</b></td><td class="muted">m.buyer@…</td><td class="mono">${money(24900)}</td><td>${badge('published', 'paid')}</td></tr><tr><td class="thread positive"><b>#1041</b></td><td class="muted">s.ahmed@…</td><td class="mono">${money(49800)}</td><td>${badge('published', 'paid')}</td></tr><tr><td class="thread draft"><b>#1040</b></td><td class="muted">k.hassan@…</td><td class="mono">${money(18900)}</td><td>${badge('draft', 'pending')}</td></tr><tr><td class="thread attention"><b>#1039</b></td><td class="muted">n.said@…</td><td class="mono">${money(24900)}</td><td>${badge('attention', 'refunded')}</td></tr></tbody></table></div><div class="card"><div class="cardhead"><h3>Low stock</h3></div><div class="lowrow"><span>Nile Cotton Shirt</span>${track(3, 10, 'warn')}</div><div class="lowrow"><span>Ramie Table Runner</span>${track(0, 10, 'bad')}</div><div class="session"><div><span class="lbl">Signed in as</span><b>owner@marketcore.test</b></div><div><span class="lbl">Acting in</span><b>Nile Traders</b> ${badge('published', 'OWNER')}</div></div></div></div>`)),
  frame('products', 'Products', 'catalog · the signature thread', products()),
  frame('product', 'Product detail', 'catalog · inventory + publish rule', productDetail()),
  frame('orders', 'Orders', 'orders · states', orders()),
  frame('order', 'Order detail', 'ledger for one order', orderDetail()),
  frame('refunds', 'Refunds', 'INV-5', refunds()),
  frame('payouts', 'Payouts', 'INV-8', payouts()),
  frame('members', 'Members', 'tenancy · roles', members()),
  frame('operations', 'Operations', 'webhooks · outbox', operations()),
  statesFrame(),
];

const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MarketCore — UI/UX design (selvedge)</title><style>${css}</style></head><body>
<div class="boardhead"><h1>MarketCore — UI design</h1>
<p>The operator console, designed to <b>selvedge</b> — the direction in <code>packages/ui</code>. Same tokens the code uses (converted from <code>tokens.css</code>), so these screens and the build agree. Content uses the real seed data: Nile Traders, <i>Nile Cotton Shirt</i> at E£249.00, stock 10.</p></div>
<div class="board">${screens.join('\n')}</div>
</body></html>`;
fs.writeFileSync(path.join(OUT, 'design-board.html'), doc);
console.log('wrote design-board.html with', screens.length, 'frames');
