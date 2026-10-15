import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Writes beside this script: ui/design-board.html, ui/tokens.json and ui/DESIGN.md.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'ui');
// Remove only this script's own outputs, never the directory. `ui/screens/` and
// `before-after.html` are produced by other generators, and wiping `ui/` deleted them —
// the kind of "cleanup" that destroys work it did not create.
fs.mkdirSync(OUT, { recursive: true });
for (const name of ['design-board.html', 'tokens.json', 'DESIGN.md']) {
  fs.rmSync(path.join(OUT, name), { force: true });
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (m) => `E£${(m / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const compact = (m) => `E£${Math.round(m / 100).toLocaleString('en-US')}`;

/* ================================================================= skins */
const SKINS = [
  {
    id: 'quartz', name: 'Quartz', kind: 'Light · indigo', primary: true,
    note: 'The chosen direction. Cool near-white canvas, dark rail, DM Sans, DM Mono numerals, one indigo action.',
    v: {
      canvas: '#f6f7fb', panel: '#ffffff', panel2: '#f1f3f9', rail: '#0b0d14',
      railInk: '#eef1f7', railMuted: '#8b93a7', ink: '#0a0b12', muted: '#5a6272', faint: '#676e7a',
      line: '#e6e8ef', lineStrong: '#d5d9e2', controlEdge: '#838b9a', accent: '#4f46e5', accentInk: '#ffffff', accentWash: '#eef0ff',
      ok: '#117f3a', okWash: '#e8f7ee', bad: '#d11b43', badWash: '#fdecef', warn: '#a55a05', warnWash: '#fdf3e4',
      info: '#097499', r: '12px', rSm: '8px',
      shadow: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)', grid: '#eef0f5',
      font: 'DM Sans, system-ui, sans-serif', fontMono: 'DM Mono, ui-monospace, monospace',
    },
  },
  {
    id: 'graphite', name: 'Graphite', kind: 'Dark · periwinkle',
    note: 'The same system, dark-first — kept as the Operations theme for long low-light sessions.',
    v: {
      canvas: '#0b0d12', panel: '#12151c', panel2: '#171b24', rail: '#070910',
      railInk: '#e8ebf2', railMuted: '#78829a', ink: '#e9ecf3', muted: '#98a2b8', faint: '#7d8596',
      line: '#1e232e', lineStrong: '#2a3140', controlEdge: '#5e687c', accent: '#7c8cff', accentInk: '#0a0d18', accentWash: 'rgba(124,140,255,.15)',
      ok: '#34d399', okWash: 'rgba(52,211,153,.15)', bad: '#fb7185', badWash: 'rgba(251,113,133,.15)',
      warn: '#fbbf24', warnWash: 'rgba(251,191,36,.15)', info: '#38bdf8', r: '12px', rSm: '8px',
      shadow: 'none', grid: '#1b202a',
      font: 'DM Sans, system-ui, sans-serif', fontMono: 'DM Mono, ui-monospace, monospace',
    },
  },
];
const vars = (v) => Object.entries(v).map(([k, val]) => `--${k}:${val}`).join(';');

/* ================================================================= icons */
/*
 * Decorative by default. Every icon here sits beside a visible label or inside a
 * control that carries its own accessible name, so it is hidden from the
 * accessibility tree — an unlabelled glyph read aloud is noise, not information.
 */
const ico = (d, sz = 16) => `<svg class="i" viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
const I = {
  grid: ico('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  chart: ico('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  box: ico('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/>'),
  layers: ico('<path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/>'),
  receipt: ico('<path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z"/><path d="M9 7h6M9 11h6"/>'),
  undo: ico('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>'),
  bank: ico('<path d="M3 10l9-6 9 6"/><path d="M5 10v9M19 10v9M9 19v-5h6v5M2 21h20"/>'),
  users: ico('<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0112 0"/><path d="M16 5.5a3 3 0 010 5.6M18 20a5.5 5.5 0 00-3-4.9"/>'),
  activity: ico('<path d="M3 12h4l3 8 4-16 3 8h4"/>'),
  search: ico('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 15),
  bell: ico('<path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M10.5 20a2 2 0 003 0"/>', 17),
  down: ico('<path d="M6 9l6 6 6-6"/>', 14),
  up: ico('<path d="M6 15l6-6 6 6"/>', 14),
  sliders: ico('<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>', 15),
  download: ico('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>', 15),
  plus: ico('<path d="M12 5v14M5 12h14"/>', 15),
  check: ico('<path d="M20 6L9 17l-5-5"/>', 15),
  lock: ico('<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>', 15),
  cart: ico('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.3 11.2a1.6 1.6 0 001.6 1.3h8.7a1.6 1.6 0 001.6-1.3L21 8H6"/>', 16),
  store: ico('<path d="M3 9l1.6-5h14.8L21 9"/><path d="M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9"/><path d="M3 9h18"/><path d="M9 20v-6h6v6"/>', 16),
  arrowr: ico('<path d="M5 12h14M13 6l6 6-6 6"/>', 15),
  heart: ico('<path d="M12 20s-7-4.6-9.3-9A5 5 0 0112 5.3 5 5 0 0121.3 11C19 15.4 12 20 12 20z"/>', 16),
  truck: ico('<rect x="2" y="7" width="12" height="9" rx="1"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="6.5" cy="18" r="1.7"/><circle cx="17.5" cy="18" r="1.7"/>', 16),
  tag: ico('<path d="M3 12l9-9h7v7l-9 9z"/><circle cx="16" cy="8" r="1.4"/>', 15),
  credit: ico('<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/>', 16),
  pin: ico('<path d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>', 15),
  image: ico('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M4 17l5-4 4 3 3-2 4 3"/>', 15),
  trash: ico('<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>', 15),
  chat: ico('<path d="M4 5h16v11H8l-4 4z"/>', 15),
  clock: ico('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', 14),
  star: ico('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>', 14),
  x: ico('<path d="M6 6l12 12M18 6L6 18"/>', 14),
};

/* ================================================================= charts */
/* A counter, not Math.random: the gradient id only has to be unique within the page, and
   a random one made every rerun produce a different design-board.html — so the committed
   artefact churned on each build and "the output is exactly what the generator produces"
   was not true. */
let sparkSeq = 0;
function sparkline(data, color, w = 132, h = 38) {
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((d, i) => [(i / (data.length - 1)) * w, h - 4 - ((d - min) / span) * (h - 10)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const id = 'sg' + (++sparkSeq).toString(36);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${w} ${h} L0 ${h} Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function barChart(series, labels, w = 720, h = 200, label = 'Bar chart') {
  const pad = { l: 46, r: 8, t: 12, b: 26 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(...series.flat()) * 1.12;
  let g = '';
  for (let i = 0; i <= 4; i++) { const y = pad.t + (ih / 4) * i; g += `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="var(--grid)"/><text x="${pad.l - 8}" y="${y + 3.5}" class="ax" text-anchor="end">${Math.round((max / 4) * (4 - i))}k</text>`; }
  const groups = series[0].length, gw = iw / groups, bw = Math.min(16, (gw - 10) / series.length);
  let bars = '';
  series.forEach((s, si) => s.forEach((v, i) => {
    const bh = (v / max) * ih, x = pad.l + i * gw + gw / 2 - (series.length * bw) / 2 + si * bw;
    bars += `<rect x="${x}" y="${pad.t + ih - bh}" width="${bw - 2}" height="${bh}" rx="3" fill="var(--accent)" opacity="${si === 0 ? 1 : .35}"/>`;
  }));
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">${g}${bars}${labels.map((l, i) => `<text x="${pad.l + i * gw + gw / 2}" y="${h - 8}" class="ax" text-anchor="middle">${l}</text>`).join('')}</svg>`;
}
function donut(parts, size = 128, label = 'Donut chart') {
  const r = size / 2 - 12, c = size / 2, circ = 2 * Math.PI * r;
  let off = 0, seg = '';
  const cols = ['var(--accent)', 'var(--info)', 'var(--ok)', 'var(--faint)'];
  parts.forEach((p, i) => {
    const len = (p.v / 100) * circ;
    seg += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${cols[i % cols.length]}" stroke-width="13" stroke-dasharray="${len - 3} ${circ - len + 3}" stroke-dashoffset="${-off}" transform="rotate(-90 ${c} ${c})" stroke-linecap="round"/>`;
    off += len;
  });
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(label)}">${seg}<text x="${c}" y="${c + 1}" text-anchor="middle" class="dn-big">${esc(parts[0].label)}</text><text x="${c}" y="${c + 16}" text-anchor="middle" class="dn-sm">${esc(parts[0].sub || '')}</text></svg>`;
}

/* ============================================================= components */
const delta = (v, good = true) => `<span class="delta ${good ? 'up' : 'down'}">${good ? I.up : I.down}${esc(v)}</span>`;
const bar = (pct, tone = 'accent') => `<span class="sharebar"><i style="width:${pct}%;background:var(--${tone})"></i></span>`;
const status = (tone, text) => `<span class="st ${tone}"><i></i>${esc(text)}</span>`;
const ava = (ini, tone) => `<span class="av ${tone || ''}">${esc(ini)}</span>`;
const kpi = (label, value, d, good, spark, tone) => `
  <div class="kpi"><div class="kpitop"><span class="kpi-label">${esc(label)}</span>${d ? delta(d, good) : ''}</div>
  <div class="kpi-val">${esc(value)}</div><div class="kpi-spark">${spark ? sparkline(spark, tone || 'var(--accent)') : ''}</div></div>`;

function tableCard(title, sub, cols, rows, foot, toolbar) {
  return `<section class="card"><header class="cardhead"><div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${toolbar || ''}</header>
    <div class="tblwrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody>${foot ? `<tfoot><tr>${foot}</tr></tfoot>` : ''}</table></div></section>`;
}

const rail = (active) => `
  <aside class="rail">
    <div class="railtop"><span class="logo"></span><div class="ws"><b>Nile Traders</b><i>MarketCore</i></div>${I.down}</div>
    <label class="railsearch">${I.search}<input placeholder="Search" aria-label="Search"><kbd>⌘K</kbd></label>
    <nav>
      <span class="navhead">Overview</span>
      <a class="nav ${active === 'dashboard' ? 'on' : ''}">${I.grid}Dashboard</a>
      <a class="nav ${active === 'reports' ? 'on' : ''}">${I.chart}Reports</a>
      <span class="navhead">Catalog</span>
      <a class="nav ${active === 'products' ? 'on' : ''}">${I.box}Products<span class="count">4</span></a>
      <a class="nav ${active === 'inventory' ? 'on' : ''}">${I.layers}Inventory</a>
      <a class="nav ${active === 'promotions' ? 'on' : ''}">${I.tag}Promotions</a>
      <span class="navhead">Money</span>
      <a class="nav ${active === 'orders' ? 'on' : ''}">${I.receipt}Orders<span class="count">128</span></a>
      <a class="nav ${active === 'refunds' ? 'on' : ''}">${I.undo}Refunds</a>
      <a class="nav ${active === 'payouts' ? 'on' : ''}">${I.bank}Payouts</a>
      <span class="navhead">Admin</span>
      <a class="nav ${active === 'members' ? 'on' : ''}">${I.users}Members</a>
      <a class="nav ${active === 'store' ? 'on' : ''}">${I.store}Store settings</a>
      <a class="nav ${active === 'operations' ? 'on' : ''}">${I.activity}Operations<span class="count warn">3</span></a>
    </nav>
    <div class="railuser">${ava('JP', 'inv')}<div><b>owner@marketcore.test</b><i>Owner</i></div>${I.down}</div>
  </aside>`;

const topbar = (crumbs) => `
  <header class="topbar">
    <div class="crumbs">${crumbs.map((c, i) => i ? `<span>${esc(c)}</span>` : `<span class="dimx">${esc(c)}</span>`).join('<i>/</i>')}</div>
    <label class="topsearch">${I.search}<input placeholder="Search products, orders, request ids…" aria-label="Search"><kbd>⌘K</kbd></label>
    <button class="iconbtn" aria-label="Notifications, 3 unread">${I.bell}<i class="badge" aria-hidden="true">3</i></button>
    <div class="userchip">${ava('JP', 'inv')}<div><b>Jordan Park</b><i>Owner · Nile Traders</i></div>${I.down}</div>
  </header>`;

const pagehead = (title, sub, right) => `<div class="pagehead"><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div><div class="headctl">${right || ''}</div></div>`;
const seg = (items, on = 1) => `<div class="seg">${items.map((t, i) => `<button class="${i === on ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>`;
const shell = (active, crumbs, head, content) => `<div class="shell">${rail(active)}<div class="main">${topbar(crumbs)}<div class="page">${head}${content}</div></div></div>`;

/*
 * The buyer's chrome — deliberately NOT the rail.
 *
 * A rail is a tenant console: it names the organization and its catalog. A buyer
 * has no tenant, so reusing it would quietly assert a membership the buyer does
 * not have. This is the public surface: search across every seller, an account
 * chip, and no tenant anywhere — which is also why the checkout request carries
 * no `x-organization-id`.
 */
const shopbar = (active, signedIn) => `
  <header class="shopbar">
    <span class="shopbrand"><span class="logo"></span><b>MarketCore</b></span>
    <label class="shopsearch">${I.search}<input placeholder="Search products and sellers…" aria-label="Search products and sellers"><kbd>⌘K</kbd></label>
    <div class="shopright">
      <a class="shopicon ${active === 'wishlist' ? 'on' : ''}" aria-label="Wishlist, 3 saved products">${I.heart}<i class="sbadge" aria-hidden="true">3</i></a>
      <a class="shopicon ${active === 'cart' ? 'on' : ''}" aria-label="Cart, 2 items">${I.cart}<i class="sbadge" aria-hidden="true">2</i></a>
      ${signedIn
        ? `<span class="shopuser">${ava('MB', 'inv')}<b>Mariam B.</b>${I.down}</span>`
        : `<a class="shoplink">Start selling</a><button class="btn ghost">Sign in</button>`}
    </div>
  </header>
  <nav class="catbar">
    <a class="cat on">All</a><a class="cat">Textiles</a><a class="cat">Home</a><a class="cat">Food</a><a class="cat">Beauty</a><a class="cat deals">Deals</a>
    <span class="catpush"></span>
    <a class="cat">Sell on MarketCore</a><a class="cat">Help</a>
  </nav>`;

/** Filled stars — a rating is social proof, and it belongs next to the title. */
const stars = (r, count, sz = 13) => {
  const cells = Array.from({ length: 5 }, (_, i) =>
    `<svg class="stari ${i < Math.round(r) ? 'on' : ''}" viewBox="0 0 24 24" width="${sz}" height="${sz}"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>`).join('');
  return `<span class="rating">${cells}<b>${r.toFixed(1)}</b>${count != null ? `<span class="rcount">(${count})</span>` : ''}</span>`;
};

/** Quantity is buttons plus an editable field, and every control is named. */
const qty = (v) => `<span class="qtybox"><button aria-label="Decrease quantity">−</button><input value="${v}" inputmode="numeric" aria-label="Quantity"><button aria-label="Increase quantity">+</button></span>`;

/*
 * The buyer's account. Personal settings, deliberately apart from the
 * organization's: research is clear that keeping "mine" and "the company's"
 * in one screen is how people change the wrong thing.
 */
const ACCT_NAV = [
  ['profile', 'Profile & security'], ['addresses', 'Addresses'], ['payments', 'Payment methods'],
  ['orders', 'Orders'], ['wishlist', 'Wishlist'], ['reviews', 'My reviews'], ['returns', 'Returns'],
];
const acctShell = (active, head, content) => `
  <div class="shop">${shopbar(active, true)}
    <div class="acctwrap">
      <aside class="acctnav">
        <div class="accthead">${ava('MB', 'inv')}<div><b>Mariam Buyer</b><i>mariam@shopper.test</i></div></div>
        ${ACCT_NAV.map(([id, label]) => `<a class="anav ${active === id ? 'on' : ''}">${esc(label)}</a>`).join('')}
        <a class="anav">Sign out</a>
      </aside>
      <div class="acctmain">${head}${content}</div>
    </div>
  </div>`;

/* ================================================================= screens */
function dashboard() {
  const kpis = [
    kpi('Revenue · 30d', money(4829000), '14.2%', true, [3, 4, 3.6, 5, 4.4, 6, 7.2], 'var(--accent)'),
    kpi('Orders', '128', '8.1%', true, [8, 7, 9, 8.4, 11, 10, 13], 'var(--info)'),
    kpi('Avg order value', money(37700), '5.4%', true, [5, 5.4, 5.2, 6, 5.8, 6.3, 6.6], 'var(--ok)'),
    kpi('Low stock', '2', '1 out of stock', false, [1, 1, 2, 1, 3, 2, 2], 'var(--warn)'),
  ].join('');
  const orders = [
    ['#1042', 'Mariam Buyer', 'MB', 'paid', 24900, 'fulfilling', 100],
    ['#1041', 'Sara Ahmed', 'SA', 'paid', 49800, 'completed', 100],
    ['#1040', 'Khaled Hassan', 'KH', 'processing', 18900, 'pending', 45],
    ['#1039', 'Nour Said', 'NS', 'refunded', 24900, 'cancelled', 100],
  ].map(([id, who, ini, pay, tot, ful, pr]) => `<tr>
    <td class="mono">${id}</td>
    <td><span class="who">${ava(ini)}<span>${who}<i>${id}</i></span></span></td>
    <td class="num mono">${money(tot)}</td>
    <td>${status(pay === 'paid' ? 'ok' : pay === 'refunded' ? 'bad' : 'warn', pay)}</td>
    <td>${status(ful === 'completed' ? 'ok' : ful === 'pending' ? 'warn' : 'neutral', ful)}</td>
    <td>${bar(pr, pay === 'refunded' ? 'bad' : 'accent')}</td></tr>`).join('');
  const top = [['Nile Cotton Shirt', 62, 24900], ['Ramie Table Runner', 24, 18000], ['Giza Sheet Set', 14, 125000]]
    .map(([nm, p, pr]) => `<li><span class="tl-n">${nm}</span><span class="tl-p">${p}%</span>${bar(p * 1.6)}<span class="tl-m mono">${money(pr)}</span></li>`).join('');
  return shell('dashboard', ['Dashboard', 'Overview'],
    pagehead('Overview', 'Revenue, orders and stock health for Nile Traders.', seg(['7d', '30d', '90d', '1Y']) + `<button class="btn ghost">${I.download}Export</button>`),
    `<div class="kpis">${kpis}</div>
     <div class="grid2">
       <section class="card"><header class="cardhead"><div><h3>Revenue</h3><p>Captured, by week — EGP</p></div>
         <div class="legend"><span><i style="background:var(--accent)"></i>This quarter</span><span><i style="background:var(--accent);opacity:.35"></i>Last quarter</span></div></header>
         <div class="cardpad">${barChart([[42, 58, 51, 74, 66, 88, 79], [36, 44, 40, 52, 49, 61, 57]], ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7'])}</div></section>
       <section class="card"><header class="cardhead"><div><h3>Revenue by plan</h3><p>Share of captured</p></div></header>
         <div class="cardpad donutwrap">${donut([{ v: 56, label: '56%', sub: 'Cotton' }, { v: 28, label: '' }, { v: 16, label: '' }])}
           <ul class="legendlist">${[['Cotton', 56, 'accent'], ['Olive oil', 28, 'info'], ['Other', 16, 'ok']].map(([t, p, c]) => `<li><i style="background:var(--${c})"></i><span>${t}</span><b>${p}%</b></li>`).join('')}</ul></div></section>
     </div>
     <div class="grid2">
       ${tableCard('Recent orders', 'Latest 4 of 128', [{ t: 'Order' }, { t: 'Buyer' }, { t: 'Total', num: true }, { t: 'Payment' }, { t: 'Fulfilment' }, { t: 'Progress' }], orders, `<td colspan="6" class="tf">Showing 4 of 128 · updated 2 min ago</td>`, `<button class="btn quiet">View all</button>`)}
       <section class="card"><header class="cardhead"><div><h3>Top products</h3><p>By units, 30d</p></div></header><ul class="toplist">${top}</ul></section>
     </div>`);
}

function products() {
  const kpis = [
    kpi('Published', '2', null, true, null, 'var(--ok)'), kpi('Draft', '1', null, true, null, 'var(--faint)'),
    kpi('Out of stock', '1', 'needs attention', false, null, 'var(--bad)'),
    kpi('Inventory value', compact(1245000), '6.2%', true, [4, 4.4, 4.1, 4.8, 5.2, 5, 5.4], 'var(--accent)'),
  ].join('');
  const rows = [
    ['Nile Cotton Shirt', 'SKU-6642', 'published', 24900, 10, [4, 6, 5, 8, 7, 11, 9], 'up', '18.4%'],
    ['Giza Sheet Set', 'SKU-7711', 'draft', 125000, 0, [0, 0, 0, 0, 0, 0, 0], '—', '—'],
    ['Ramie Table Runner', 'SKU-8820', 'published', 18000, 3, [8, 7, 9, 6, 10, 8, 7], 'down', '12.1%'],
    ['Delta Olive Oil', 'SKU-9931', 'published', 18900, 24, [3, 4, 5, 4, 6, 5, 7], 'up', '9.3%'],
  ].map(([nm, sku, st, pr, av, spark, dir, pct]) => `<tr>
    <td><span class="who"><em class="dot ${st === 'published' ? 'ok' : 'draft'}"></em><span>${nm}<i>${sku}</i></span></span></td>
    <td>${status(st === 'published' ? 'ok' : 'neutral', st)}</td>
    <td class="num mono">${money(pr)}</td>
    <td><span class="stock">${bar(Math.round((av / 24) * 100), av === 0 ? 'bad' : av <= 3 ? 'warn' : 'ok')}<b class="mono">${av}</b></span></td>
    <td>${sparkline(spark, av === 0 ? 'var(--faint)' : 'var(--accent)', 96, 30)}</td>
    <td>${dir === '—' ? '<span class="dash">—</span>' : delta(pct, dir === 'up')}</td>
    <td><button class="btn quiet sm">Edit</button></td></tr>`).join('');
  return shell('products', ['Catalog', 'Products'],
    pagehead('Products', '4 products · Nile Traders', `<label class="inline-search">${I.search}<input placeholder="Search products…" aria-label="Search products"></label><button class="btn ghost">${I.sliders}Filter</button><button class="btn">${I.plus}New product</button>`),
    `<div class="kpis">${kpis}</div>
     ${tableCard('All products', null, [{ t: 'Product' }, { t: 'Status' }, { t: 'Price', num: true }, { t: 'Available' }, { t: 'Sales · 30d' }, { t: 'Trend' }, { t: '' }], rows, `<td colspan="7" class="tf">Inventory is enforced by a database CHECK — the API cannot sell what it does not have.</td>`)}`);
}

function productDetail() {
  return shell('products', ['Catalog', 'Products', 'Nile Cotton Shirt'],
    pagehead('Nile Cotton Shirt', 'SKU-6642 · Nile Traders · phase 3',
      status('ok', 'published') + `<button class="btn ghost">Duplicate</button><button class="btn">Save changes</button>`),
    `<div class="grid2">
      <div class="stack">
        <section class="card"><header class="cardhead"><div><h3>Details</h3></div></header>
          <div class="cardpad form">
            <label class="fld"><span>Name</span><input class="input" value="Nile Cotton Shirt"></label>
            <div class="row2">
              <label class="fld"><span>Price</span><input class="input mono" value="249.00"><em>EGP · minor units 24900</em></label>
              <label class="fld"><span>Currency</span><input class="input" value="EGP"><em>carried on the aggregate</em></label>
            </div>
            <label class="fld"><span>Slug</span><input class="input mono" value="nile-cotton-shirt"><em>unique per organization</em></label>
          </div>
        </section>
        <section class="card"><header class="cardhead"><div><h3>Sales · 30 days</h3><p>Units per day</p></div>${delta('18.4%', true)}</header>
          <div class="cardpad">${barChart([[4, 6, 5, 8, 7, 11, 9, 6, 8, 10, 7, 9]], ['1', '', '', '4', '', '', '7', '', '', '10', '', '12'])}</div></section>
      </div>
      <div class="stack">
        <section class="card"><header class="cardhead"><div><h3>Inventory</h3></div></header>
          <div class="cardpad">
            <div class="bignum">10<span>available</span></div>
            ${bar(42, 'ok')}
            <div class="kv"><span>Reserved</span><b class="mono">0</b></div>
            <div class="kv"><span>Version</span><b class="mono">7</b></div>
            <div class="kv"><span>Constraint</span><b>available ≥ 0</b></div>
          </div></section>
        <section class="card"><header class="cardhead"><div><h3>Publish rule</h3></div></header>
          <div class="cardpad"><p class="note">DRAFT → PUBLISHED is allowed only when the price is at least 1 minor unit. Publishing a free product is refused, not silently allowed.</p></div></section>
      </div>
    </div>`);
}

function orders() {
  const rows = [
    ['#1042', 'Mariam Buyer', 'MB', 'paid', 'fulfilling', 24900],
    ['#1041', 'Sara Ahmed', 'SA', 'paid', 'completed', 49800],
    ['#1040', 'Khaled Hassan', 'KH', 'processing', 'pending', 18900],
    ['#1039', 'Nour Said', 'NS', 'refunded', 'cancelled', 24900],
  ].map(([id, who, ini, p, f, t]) => `<tr>
    <td><span class="who">${ava(ini)}<span>${who}<i>${id}</i></span></span></td>
    <td>${status(p === 'paid' ? 'ok' : p === 'refunded' ? 'bad' : 'warn', p)}</td>
    <td>${status(f === 'completed' ? 'ok' : f === 'pending' ? 'warn' : 'neutral', f)}</td>
    <td class="num mono">${money(t)}</td>
    <td class="dim mono">${money(2240)}</td>
    <td class="num"><button class="btn quiet sm">Open</button></td></tr>`).join('');
  return shell('orders', ['Money', 'Orders'],
    pagehead('Orders', '4 orders · 1 needs attention', seg(['All', 'Paid', 'Pending']) + `<button class="btn ghost">${I.download}Export</button>`),
    `${tableCard('Orders', null, [{ t: 'Buyer' }, { t: 'Payment' }, { t: 'Fulfilment' }, { t: 'Total', num: true }, { t: 'Fee' }, { t: '' }], rows, `<td colspan="6" class="tf">Totals are immutable after creation; corrections are compensating ledger entries.</td>`)}`);
}

function orderDetail() {
  const items = `<tr><td><span class="who"><em class="dot ok"></em><span>Nile Cotton Shirt<i>SKU-6642</i></span></span></td><td class="num">1</td><td class="num mono">${money(24900)}</td><td class="num mono">${money(24900)}</td></tr>`;
  const ledger = [
    ['Platform cash', 24900, null], ['Seller payable', null, 22410], ['Platform revenue', null, 2490],
  ].map(([a, d, c]) => `<tr><td>${a}</td><td class="num mono okc">${d ? money(d) : '—'}</td><td class="num mono">${c ? money(c) : '—'}</td></tr>`).join('');
  return shell('orders', ['Money', 'Orders', '#1042'],
    pagehead('Order #1042', 'Placed 2 minutes ago · Nile Traders', status('ok', 'paid')),
    `<div class="flow">${['Pending payment', 'Paid', 'Fulfilling', 'Completed'].map((s, i) => `<span class="fstep ${i <= 1 ? 'done' : ''}"><i>${i <= 1 ? I.check : ''}</i>${s}</span>`).join('<em>→</em>')}</div>
     <div class="grid2">
       <div class="stack">
         ${tableCard('Items', null, [{ t: 'Product' }, { t: 'Qty', num: true }, { t: 'Unit', num: true }, { t: 'Line', num: true }], items, `<td colspan="3" class="right dim">Total</td><td class="num mono"><b>${money(24900)}</b></td>`)}
         ${tableCard('Ledger', 'Signed entries sum to zero, per currency', [{ t: 'Account' }, { t: 'Debit', num: true }, { t: 'Credit', num: true }], ledger, `<td class="right dim">Signed sum</td><td colspan="2" class="num mono okc">0.00</td>`, status('ok', 'balanced'))}
       </div>
       <div class="stack">
         <section class="card"><header class="cardhead"><div><h3>Payment</h3></div></header><div class="cardpad">
           <div class="kv"><span>Status</span><b>${status('ok', 'succeeded')}</b></div>
           <div class="kv"><span>Attempts</span><b class="mono">1</b></div>
           <div class="kv"><span>Provider ref</span><b class="mono">pi_3Qk…9d2</b></div>
           <div class="kv"><span>Captured</span><b class="mono">${money(24900)}</b></div>
         </div></section>
         <section class="card"><header class="cardhead"><div><h3>Timeline</h3></div></header>
           <ul class="tl"><li><b>Payment captured</b><span>2 min ago · webhook applied once</span></li><li><b>Order created</b><span>2 min ago · inventory 10 → 9</span></li><li><b>Checkout</b><span>2 min ago · idempotency key reused 0×</span></li></ul></section>
         <section class="card"><header class="cardhead"><div><h3>Actions</h3></div></header>
           <div class="cardpad actions"><button class="btn ghost">Refund order</button><button class="btn quiet">Cancel</button></div></section>
       </div>
     </div>`);
}

function refunds() {
  const rows = [
    ['RF-0042', '#1039', 24900, 'succeeded', 100], ['RF-0041', '#1036', 9000, 'failed', 36], ['RF-0040', '#1032', 5000, 'processing', 20],
  ].map(([id, o, a, st, p]) => `<tr><td class="mono">${id}</td><td class="mono">${o}</td><td class="num mono">${money(a)}</td>
    <td>${status(st === 'succeeded' ? 'ok' : st === 'failed' ? 'bad' : 'warn', st)}</td><td>${bar(p, st === 'failed' ? 'bad' : 'accent')}</td></tr>`).join('');
  return shell('refunds', ['Money', 'Refunds'],
    pagehead('Refunds', 'INV-5 — a refund never exceeds what was captured', `<button class="btn">${I.plus}New refund</button>`),
    `<div class="grid2">
      ${tableCard('Refunds', null, [{ t: 'Refund' }, { t: 'Order' }, { t: 'Amount', num: true }, { t: 'Status' }, { t: 'Settled' }], rows)}
      <div class="stack">
        <section class="card"><header class="cardhead"><div><h3>Request a refund</h3></div></header><div class="cardpad form">
          <label class="fld"><span>Order</span><input class="input mono" value="#1039"></label>
          <label class="fld"><span>Amount</span><input class="input mono" value="249.00"><em>captured: 249.00 EGP</em></label>
          <div class="alertwarn">A refund above the captured total is refused before the provider is called.</div>
          <button class="btn full">Request refund</button>
        </div></section>
        <section class="card"><header class="cardhead"><div><h3>Ledger effect</h3></div></header>
          <div class="cardpad"><p class="note">A refund posts a <b>reversing</b> transaction — seller payable and platform revenue are debited, platform cash credited. The original capture is never edited.</p></div></section>
      </div>
    </div>`);
}

function payouts() {
  const kpis = [
    kpi('Available', money(615000), 'withdrawable now', true, null, 'var(--ok)'),
    kpi('Pending settlement', money(182400), 'clears in 2 days', true, null, 'var(--info)'),
    kpi('Paid out · all time', money(3487000), '41 payouts', true, [20, 24, 22, 28, 31, 30, 36], 'var(--accent)'),
    kpi('Failed payouts', '1', 'needs a retry', false, null, 'var(--bad)'),
  ].join('');
  const rows = [
    ['PO-0031', 224100, 'paid', 'tr_1Qk…', 'Mon'], ['PO-0032', 615000, 'processing', '—', 'today'], ['PO-0030', 98000, 'failed', '—', 'Fri'],
  ].map(([id, a, st, ref, when]) => `<tr><td class="mono">${id}</td><td class="num mono">${money(a)}</td>
    <td>${status(st === 'paid' ? 'ok' : st === 'failed' ? 'bad' : 'warn', st)}</td><td class="mono dim">${ref}</td><td class="dim">${when}</td></tr>`).join('');
  return shell('payouts', ['Money', 'Payouts'],
    pagehead('Payouts', 'INV-8 — a payout is executed at most once', `<button class="btn">${I.plus}Request payout</button>`),
    `<div class="kpis">${kpis}</div>
     ${tableCard('Payout history', null, [{ t: 'Payout' }, { t: 'Amount', num: true }, { t: 'Status' }, { t: 'Provider ref' }, { t: 'Requested' }], rows, `<td colspan="5" class="tf">Two workers may race one payout; the state predicate — not the worker — is the guard, so exactly one provider transfer is initiated.</td>`)}`);
}

function members() {
  const rows = [
    ['owner@marketcore.test', 'OP', 'owner', 'active', 'Sep 19'], ['member@marketcore.test', 'MB', 'member', 'active', 'Sep 20'],
  ].map(([em, ini, role, st, when]) => `<tr><td><span class="who">${ava(ini)}<span>${em}<i>${role}</i></span></span></td>
    <td>${status(role === 'owner' ? 'ok' : 'neutral', role)}</td><td>${status('ok', st)}</td><td class="dim">${when}</td>
    <td><button class="btn quiet sm">Manage</button></td></tr>`).join('');
  return shell('members', ['Admin', 'Members'],
    pagehead('Members', 'Nile Traders · 2 members', `<button class="btn">${I.plus}Add member</button>`),
    `<div class="grid2">
      ${tableCard('Members', null, [{ t: 'Member' }, { t: 'Role' }, { t: 'Status' }, { t: 'Joined' }, { t: '' }], rows, `<td colspan="5" class="tf">The last owner cannot be removed — a count over sibling rows, enforced in a transaction.</td>`)}
      <div class="stack">
        <section class="card"><header class="cardhead"><div><h3>Add a member</h3></div></header><div class="cardpad form">
          <label class="fld"><span>Email</span><input class="input" placeholder="teammate@company.test"></label>
          <label class="fld"><span>Role</span><select class="input"><option>Member</option><option>Owner</option></select></label>
          <button class="btn full">Add to organization</button>
          <p class="note">Nothing sends email yet — this adds an existing MarketCore user by address.</p>
        </div></section>
        <section class="card"><header class="cardhead"><div><h3>Tenant isolation</h3></div></header>
          <div class="cardpad"><p class="note">The organization is chosen in the rail and attached as <code>x-organization-id</code>. A cross-tenant read answers <b>404</b>; a header naming someone else's tenant answers <b>403</b>.</p></div></section>
      </div>
    </div>`);
}

function operations() {
  const kpis = [
    kpi('Events today', '1,204', '3.1%', true, [30, 42, 38, 51, 47, 58, 62], 'var(--accent)'),
    kpi('Duplicates suppressed', '86', 'idempotent no-ops', true, [4, 6, 5, 8, 7, 9, 8], 'var(--info)'),
    kpi('Job failures', '3', 'retrying', false, [0, 1, 0, 2, 1, 4, 3], 'var(--bad)'),
    kpi('Avg retry delay', '4.2s', '0.6s', true, [6, 5, 5.4, 4.8, 4.4, 4.6, 4.2], 'var(--ok)'),
  ].join('');
  const ev = [
    ['evt_1Qk…9d2', 'payment_intent.succeeded', 'once', 'req_9616c9…'],
    ['evt_1Qk…9d2', 'payment_intent.succeeded', 'duplicate', 'req_2bb178…'],
    ['evt_1Qk…11a', 'charge.refunded', 'retrying', 'req_053540…'],
  ].map(([id, type, st, req]) => `<tr><td class="mono">${id}</td><td>${type}</td>
    <td>${status(st === 'once' ? 'ok' : st === 'duplicate' ? 'neutral' : 'warn', st === 'duplicate' ? 'no-op' : st)}</td>
    <td class="mono dim">${req}</td></tr>`).join('');
  const jobs = [
    ['publish.order.paid', 1, 'ok', '1.2s'], ['publish.refund.succeeded', 3, 'warn', '8.4s'], ['publish.payout.paid', 0, 'neutral', '—'],
  ].map(([j, at, tone, dur]) => `<tr><td class="mono">${j}</td><td class="num mono">${at}</td>
    <td>${status(tone, tone === 'ok' ? 'processed' : tone === 'warn' ? 'retrying' : 'queued')}</td><td class="num mono dim">${dur}</td></tr>`).join('');
  return shell('operations', ['Admin', 'Operations'],
    pagehead('Operations', 'Trace and recover failed work', seg(['24h', '7d', '30d']) + `<button class="btn ghost">${I.download}Export log</button>`),
    `<div class="kpis">${kpis}</div>
     <div class="grid2">
       ${tableCard('Webhook events', 'Deduplicated by (provider, eventId)', [{ t: 'Event id' }, { t: 'Type' }, { t: 'Applied' }, { t: 'Request id' }], ev, null, `<button class="btn quiet">Filter</button>`)}
       ${tableCard('Outbox jobs', 'At-least-once, idempotent', [{ t: 'Job' }, { t: 'Attempts', num: true }, { t: 'Status' }, { t: 'Duration', num: true }], jobs)}
     </div>`);
}

function onboarding() {
  return `<div class="authwrap"><div class="authcard">
    <div class="brandbig"><span class="logo"></span><b>MarketCore</b></div>
    <h2>You&rsquo;re not in an organization yet</h2>
    <p class="authsub">MarketCore keeps products, orders and money inside an organization. Create one and you are its owner.</p>
    <label class="fld"><span>Organization name</span><input class="input" placeholder="Nile Traders"></label>
    <button class="btn full">Create organization</button>
    <p class="authfoot">Wrong account? <a>Sign out</a></p>
  </div><div class="authnote">Shown <b>instead of</b> the shell, not inside it: without a tenant every control in the shell is inert. One field, because the API derives the slug.</div></div>`;
}

function signin() {
  return `<div class="authwrap"><div class="authcard">
    <div class="brandbig"><span class="logo"></span><b>MarketCore</b></div>
    <h2>Sign in</h2><p class="authsub">Use your organization account to continue.</p>
    <label class="fld"><span>Email</span><input class="input" value="owner@marketcore.test"></label>
    <label class="fld"><span>Password</span><input class="input" value="correct-horse-battery"></label>
    <div class="alertbad">That email and password don't match an account.</div>
    <button class="btn full">Sign in</button>
    <p class="authfoot">No account? <a>Create one</a></p>
  </div><div class="authnote">Error state shown. The API answers identically for an unknown email and a wrong password, so this screen never reveals which.</div></div>`;
}
function register() {
  return `<div class="authwrap"><div class="authcard">
    <div class="brandbig"><span class="logo"></span><b>MarketCore</b></div>
    <h2>Create your account</h2><p class="authsub">12 characters or more — a policy, not a suggestion.</p>
    <label class="fld"><span>Email</span><input class="input" type="email" autocomplete="email" placeholder="you@company.test"></label>
    <label class="fld"><span>Password</span><input class="input" type="password" autocomplete="new-password" aria-describedby="pw-hint" placeholder="at least 12 characters"><em id="pw-hint">12+ code points · shown as a hint, linked by aria-describedby</em></label>
    <button class="btn full">Create account</button>
    <p class="authfoot">Already have one? <a>Sign in</a></p>
  </div></div>`;
}

function foundations(skin) {
  const v = skin.v;
  const sw = (n, k, role) => `<div class="sw"><i style="background:var(--${k})"></i><b>${n}</b><span class="swrole">${role}</span><code>${esc(v[k])}</code></div>`;
  const groups = [
    ['Surface', [['canvas', 'canvas', 'app background'], ['panel', 'panel', 'cards'], ['panel2', 'panel2', 'inset wells'], ['rail', 'rail', 'navigation plane']]],
    ['Text', [['ink', 'ink', 'primary'], ['muted', 'muted', 'secondary'], ['faint', 'faint', 'tertiary'], ['accent', 'accent', 'action']]],
    ['Edge', [['line', 'line', 'hairline'], ['lineStrong', 'lineStrong', 'decorative border'], ['controlEdge', 'control-edge', 'control boundary · 3:1']]],
    ['State', [['ok', 'ok', 'healthy / paid'], ['bad', 'bad', 'failed'], ['warn', 'warn', 'needs attention'], ['info', 'info', 'informational']]],
  ];
  return `<div class="doc"><div class="dochead"><h1>Foundations — ${skin.name}</h1>
    <p>One direction, four layers: <b>palette</b> → <b>semantic</b> → <b>components</b> → <b>screens</b>. A component names a role (<code>var(--accent)</code>), never a hue, so the look is one token set. The dark skin is the same structure with different values.</p></div>
    ${groups.map(([t, items]) => `<section><h4>${t}</h4><div class="swrow">${items.map(([n, k, r]) => sw(n, k, r)).join('')}</div></section>`).join('')}
    <section><h4>Type</h4><div class="typerow">
      <span class="t1">Nile Traders</span><span class="t2">Page title · 24</span><span class="t3">Body · 13.5</span>
      <span class="lblx">LABEL 11</span><span class="mono">E£249.00 · DM Mono</span></div></section>
    <section><h4>Components</h4><div class="ctlrow">
      <button class="btn">Primary</button><button class="btn ghost">Secondary</button><button class="btn quiet">Quiet</button>
      <input class="input" style="width:170px" placeholder="Text field">
      ${status('ok', 'paid')}${status('warn', 'processing')}${status('bad', 'failed')}${status('neutral', 'draft')}
      ${delta('14.2%', true)}${delta('12.1%', false)}</div></section>
    <section><h4>Data motifs</h4><div class="motifs">
      <div><span class="motiflabel">share bar + sparkline — length and shape carry the number</span><div class="motifbox">${bar(62)}${bar(24, 'info')}${bar(14, 'ok')}${sparkline([4, 6, 5, 8, 7, 11, 9], 'var(--accent)', 200, 40)}</div></div>
      <div><span class="motiflabel">status pill — a dot, a word, one hue; never colour alone</span><div class="motifbox col">${status('ok', 'once')}${status('neutral', 'no-op')}${status('warn', 'retrying')}${status('bad', 'failed')}</div></div>
    </div></section></div>`;
}
function states() {
  return `<div class="doc"><div class="dochead"><h1>States</h1><p>The shapes a screen takes before and instead of data — including the marketplace's own: a search that found nothing, a catalog with nothing published, a buyer who has bought nothing, and an order that cannot yet be paid. Empty and error are designed, not defaulted.</p></div>
    <div class="stategrid">
      <section class="card"><header class="cardhead"><div><h3>Loading</h3><p>skeleton, never a spinner that hides the layout</p></div></header><div class="cardpad">
        <div class="skel" style="width:32%"></div><div class="skel" style="width:72%"></div><div class="skel" style="width:54%"></div><div class="skel" style="width:64%"></div></div></section>
      <section class="card"><header class="cardhead"><div><h3>Empty</h3><p>a first action, not a dead end</p></div></header>
        <div class="cardpad empty"><span class="emblem"></span><b>No products yet</b><p class="note">Products you add to Nile Traders appear here.</p><button class="btn">${I.plus}New product</button></div></section>
      <section class="card"><header class="cardhead"><div><h3>Error</h3><p>one envelope, a code to branch on</p></div></header><div class="cardpad">
        <div class="alertbad"><b>Query failed</b><span class="mono">req_2bb178…</span></div>
        <p class="note">Every failure carries the same shape: a code, a message, and the request id that joins it to a log line.</p></div></section>
      <section class="card"><header class="cardhead"><div><h3>Form validation</h3><p>inline error + a focusable summary</p></div></header>
        <div class="cardpad form">
          <div class="alertbad" role="alert" tabindex="-1">
            <b>There is a problem</b>
            <a class="erreflink" href="#f-email">Enter an email address</a>
          </div>
          <label class="fld"><span>Email <span class="req">*</span></span>
            <input class="input invalid" id="f-email" value="mariam@" aria-invalid="true" aria-describedby="f-email-err" autocomplete="email" type="email">
          </label>
          <p class="errtxt" id="f-email-err">Enter a complete email address, like name@example.com</p>
          <div><button class="btn">Save changes</button></div>
        </div></section>
      <section class="card"><header class="cardhead"><div><h3>Not found</h3><p>404, never 403</p></div></header>
        <div class="cardpad empty"><span class="emblem slash"></span><b>404 — not found</b><p class="note">A product from another organization answers 404: an id is a probe, and 403 would confirm it exists.</p></div></section>
      <section class="card"><header class="cardhead"><div><h3>Zero results</h3><p>a search that found nothing is a recovery surface</p></div></header>
        <div class="cardpad">
          <div class="alertwarn"><b>No products match “linen shirt”</b></div>
          <p class="note" style="margin:10px 0">Relax the query, or drop <b>Under E£200</b>. 10–15% of searches return nothing — a dead end here loses the buyer for good.</p>
          <div class="chips"><span class="chip">Clear filters</span><span class="chip">Shirts</span><span class="chip">Nile Traders</span></div>
        </div></section>
      <section class="card"><header class="cardhead"><div><h3>Nothing published yet</h3><p>thin inventory, stated honestly</p></div></header>
        <div class="cardpad empty"><span class="emblem"></span><b>No products for sale yet</b><p class="note">Two sellers exist and none have published. We say so, rather than padding the grid with listings that aren’t real.</p><button class="btn ghost">Start selling ${I.arrowr}</button></div></section>
      <section class="card"><header class="cardhead"><div><h3>Buyer — no orders</h3><p>a new buyer’s very first screen</p></div></header>
        <div class="cardpad empty"><span class="emblem"></span><b>No orders yet</b><p class="note">Orders you place, from any seller, appear here with their status.</p><button class="btn ghost">Browse the marketplace ${I.arrowr}</button></div></section>
      <section class="card"><header class="cardhead"><div><h3>Order — pending payment</h3><p>the honest dead end until payment ships</p></div></header>
        <div class="cardpad">
          <div class="kv"><span>Order</span><b class="mono">#1042</b></div>
          <div class="kv"><span>Status</span><b>${status('warn', 'pending payment')}</b></div>
          <p class="note" style="margin-top:10px">The buyer has an order they cannot pay yet. It must say what happens next and who to ask — an unpaid order with no explanation is worse than no order at all.</p>
        </div></section>
    </div></div>`;
}

/* ---- the buyer surface: a marketplace on one account, no tenant ---- */
function storefront() {
  const items = [
    ['Nile Cotton Shirt', 'Nile Traders', 24900, 'in', 't1', 'NC', true, 42],
    ['Delta Olive Oil', 'Delta Goods', 18900, 'in', 't3', 'DO', true, 18],
    ['Ramie Table Runner', 'Nile Traders', 18000, 'low', 't2', 'RT', false, 7],
    ['Giza Sheet Set', 'Nile Traders', 125000, 'out', 't2', 'GS', false, 'new'],
  ];
  const card = ([name, seller, price, stock, tone, ini, seeded, sold]) => `
    <a class="pcard ${stock === 'out' ? 'off' : ''}">
      <div class="pthumb ${tone}"><span class="ph-label">image</span>${ini}</div>
      <div class="pmeta">
        <span class="pseller">${esc(seller)} · ${seeded ? 'seeded' : 'example'}</span>
        <b class="pname">${esc(name)}</b>
        <div class="prow"><span class="pprice">${money(price)}</span>
          ${stock === 'out' ? status('bad', 'out of stock') : stock === 'low' ? status('warn', 'low stock') : status('ok', 'in stock')}</div>
        <div class="prow"><span class="tchip">${sold === 'new' ? 'New seller' : sold + ' sold'}</span><span class="tchip">${esc(seller)}</span></div>
      </div></a>`;
  return `<div class="shop">
    ${shopbar('browse', false)}
    <div class="shopbody">
      <div class="shophero">
        <h1>Find something worth buying</h1>
        <p>Every published product from every seller. Two are the real seed rows; the rest are examples, because the catalog is thin today.</p>
        <div class="chips">${['All', 'In stock', 'Under E£200', 'Nile Traders', 'Delta Goods'].map((c, i) => `<span class="chip ${i === 0 ? 'on' : ''}">${c}</span>`).join('')}</div>
      </div>
      <div class="resbar"><b>4 products</b><span>from 2 sellers</span>
        <span class="sortctl">Sort <b>Recommended ${I.down}</b></span></div>
      <div class="pgrid">${items.map(card).join('')}</div>
    </div>
    <div class="shopfoot">The filters above are the ones the domain can actually support — <b>price, availability, seller</b> — not invented categories. Only <b>published</b> products appear; a draft answers <code>404</code>.</div>
  </div>`;
}

function shopProduct() {
  const thumbs = ['Main', 'In scale', 'Fabric', 'On model'];
  const specs = [
    ['Material', '100% Egyptian cotton'], ['Fit', 'Regular'], ['Colour', 'Ecru'],
    ['Care', 'Machine wash 30°'], ['SKU', 'SKU-6642-ECR-M'], ['Returns', '14 days, free'],
  ].map(([k, v]) => `<tr><td class="dim" style="width:42%">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('');
  return `<div class="shop">
    ${shopbar('browse', false)}
    <div class="shopbody">
      <div class="crumbs"><span class="dimx">Browse</span><i>/</i><span>Textiles</span><i>/</i><span>Shirts</span><i>/</i><span>Nile Cotton Shirt</span></div>
      <div class="pdp">
        <div class="gallery">
          <div class="gmain"><span class="zoomtag">${I.search}Click to zoom</span>NC</div>
          <div class="gthumbs">${thumbs.map((t, i) => `<div class="gthumb ${i === 0 ? 'on' : ''}">${t === 'Main' ? 'NC' : t.slice(0, 2)}</div>`).join('')}</div>
          <p class="note">Ordered by buying question: plain → in scale → fabric close-up → on model. <b>Images are a proposed domain addition</b> — the seed has none, which is why every tile is a monogram.</p>
        </div>
        <div class="pdpinfo">
          <span class="psellerbig">Nile Traders</span>
          <h1>Nile Cotton Shirt</h1>
          <div class="prow" style="gap:12px">${stars(4.6, 128)}<span class="tchip">42 sold</span></div>
          <span class="bigprice">${money(24900)}</span>
          <p class="pdesc">Long-staple Egyptian cotton, cut for everyday wear. Sold and shipped by Nile Traders.</p>

          <div class="vgroup"><span class="vlabel">Colour — Ecru</span>
            <div class="swatches">
              <span class="swatch on" style="background:#e8e2d3"></span>
              <span class="swatch" style="background:#26324a"></span>
              <span class="swatch out" style="background:#6b6f4a"></span>
            </div>
            <span class="vnote">Olive is sold out, and shown struck through rather than removed. A returning buyer who can’t find it assumes you stopped making it.</span>
          </div>

          <div class="vgroup"><span class="vlabel">Size</span>
            <div class="sizes"><button class="sizebtn">S</button><button class="sizebtn on">M</button><button class="sizebtn">L</button><button class="sizebtn out">XL</button><span class="sizeguide">Size guide</span></div>
          </div>

          <div class="kv"><span>Availability</span><b>${status('ok', 'In stock · 8 left')}</b></div>
          <div class="kv"><span>Delivery</span><b>Arrives Tue 14 – Thu 16 Oct</b></div>

          <div style="display:flex;gap:10px;align-items:center;margin-top:4px">
            ${qty(1)}
            <button class="btn" style="flex:1;justify-content:center">${I.cart}Add to cart</button>
            <button class="btn ghost" style="padding:9px 11px" aria-label="Save to wishlist">${I.heart}</button>
          </div>
          <p class="note">Swatches and size buttons, not dropdowns: a dropdown hides every option and costs two taps. Availability sits by the button — the most-missed element on the whole page (~62% of stores). Rating sits under the title (~59% miss it).</p>
        </div>
      </div>
      <div class="grid2">
        ${tableCard('Specifications', 'A complete spec table is its own kind of proof', [{ t: 'Attribute' }, { t: 'Value' }], specs)}
        <section class="card"><header class="cardhead"><div><h3>Buy with confidence</h3></div></header><div class="cardpad">
          <div class="kv"><span>Sold by</span><b>Nile Traders</b></div>
          <div class="kv"><span>Seller rating</span><b>${stars(4.6, 128)}</b></div>
          <div class="kv"><span>Returns</span><b>Free within 14 days</b></div>
          <div class="kv"><span>Dispatch</span><b>Same day before 2pm</b></div>
          <div class="kv"><span>Replies in</span><b>Under 2 hours</b></div>
        </div></section>
      </div>
    </div>
  </div>`;
}

function shopProductReviews() {
  const bars = [[5, 78], [4, 14], [3, 5], [2, 2], [1, 1]];
  const barsHtml = bars.map(([n, pct]) => `<div class="revbar"><span>${n}★</span><span class="track"><i style="width:${pct}%"></i></span><span>${pct}%</span></div>`).join('');
  const body = [
    ['Sara A.', 5, '2 Oct 2026', true, 'Fabric is genuinely soft and the fit is true to size. Washed it three times, no shrinkage.'],
    ['Khaled H.', 4, '24 Sep 2026', true, 'Good shirt, a touch long in the body for me. Delivery was quick and tracked.'],
    ['Nour S.', 5, '11 Sep 2026', false, 'Bought a second after seeing a friend wear one. Would buy again.'],
  ].map(([who, r, when, verified, text]) => `
    <div class="review">
      <div class="revmeta">${ava(who.slice(0, 2).toUpperCase(), 'inv')}<b>${esc(who)}</b>${stars(r, null, 12)}<span class="dim">${when}</span>${verified ? `<span class="verified">${I.check}Verified purchase</span>` : ''}</div>
      <p class="pdesc">${esc(text)}</p>
    </div>`).join('');
  const rel = [
    ['Ramie Table Runner', 'Nile Traders', 18000], ['Delta Olive Oil', 'Delta Goods', 18900], ['Giza Sheet Set', 'Nile Traders', 125000],
  ].map(([n, s, p]) => `<a class="pcard"><div class="pthumb t2">${n.slice(0, 2)}</div><div class="pmeta"><span class="pseller">${esc(s)}</span><b class="pname">${esc(n)}</b><div class="prow"><span class="pprice">${money(p)}</span></div></div></a>`).join('');
  return `<div class="shop">
    ${shopbar('browse', false)}
    <div class="shopbody">
      <div class="crumbs"><span class="dimx">Nile Cotton Shirt</span><i>/</i><span>Reviews</span></div>
      <div class="grid2">
        <div class="stack">
          <section class="card"><header class="cardhead"><div><h3>Ratings &amp; reviews</h3><p>128 reviews · sortable and filterable</p></div></header>
            <div class="cardpad">
              <div class="revhead">
                <div><div class="bigrate">4.6</div>${stars(4.6, null, 15)}<p class="note" style="margin-top:6px">128 verified reviews</p></div>
                <div>${barsHtml}</div>
              </div>
            </div>
          </section>
          <section class="card"><header class="cardhead"><div><h3>Most recent</h3></div><div class="chips" style="margin:0"><span class="chip on">All</span><span class="chip">With photos</span><span class="chip">5★</span></div></header>
            <div class="cardpad">${body}</div></section>
        </div>
        <div class="stack">
          <section class="card"><header class="cardhead"><div><h3>You may also like</h3><p>Cross-sell, below the decision — never inside the buy box</p></div></header>
            <div class="cardpad"><div class="pgrid" style="grid-template-columns:1fr 1fr;gap:12px">${rel}</div></div></section>
          <section class="card"><header class="cardhead"><div><h3>Why reviews matter</h3></div></header>
            <div class="cardpad"><p class="note">A product with five reviews is ~270% more likely to be bought than one with none — and ~380% on higher-priced items. Ratings read as most credible between 4.0 and 4.7; a perfect 5.0 reads as suspicious. Verified-buyer badges lift purchase odds another ~15%.</p></div></section>
        </div>
      </div>
    </div>
  </div>`;
}

function shopHome() {
  const cats = [['Textiles', '142 products', 'TX'], ['Home', '88 products', 'HM'], ['Food', '64 products', 'FD'], ['Beauty', '31 products', 'BT']];
  const featured = [
    ['Nile Cotton Shirt', 'Nile Traders', 24900, 4.6, 128, 't1'],
    ['Delta Olive Oil', 'Delta Goods', 18900, 4.8, 64, 't3'],
    ['Ramie Table Runner', 'Nile Traders', 18000, 4.4, 22, 't2'],
    ['Giza Sheet Set', 'Nile Traders', 125000, 4.9, 18, 't2'],
  ];
  const card = ([n, s, p, r, c, tone]) => `
    <a class="pcard"><div class="pthumb ${tone}"><span class="ph-label">image</span>${n.slice(0, 2).toUpperCase()}</div>
      <div class="pmeta"><span class="pseller">${esc(s)}</span><b class="pname">${esc(n)}</b>
        <div class="prow">${stars(r, c, 12)}</div>
        <div class="prow"><span class="pprice">${money(p)}</span>${status('ok', 'in stock')}</div>
      </div></a>`;
  return `<div class="shop">
    ${shopbar('home', false)}
    <div class="shopbody">
      <div class="shophero">
        <h1>Everything from every seller, one checkout</h1>
        <p>Two sellers today. Browse by category, filter by what matters, and buy without leaving the page.</p>
        <div class="chips"><span class="chip on">Free delivery over E£500</span><span class="chip">14-day returns</span><span class="chip">Verified sellers</span></div>
      </div>
      <div class="homerow">${cats.map(([n, c, i]) => `<div class="catcard"><span class="cemblem">${i}</span><div><b>${n}</b><i>${c}</i></div></div>`).join('')}</div>
      <div class="resbar"><b>Featured this week</b><span>curated, not “newest”</span><span class="sortctl">Sort <b>Recommended ${I.down}</b></span></div>
      <div class="pgrid">${featured.map(card).join('')}</div>
    </div>
    <div class="shopfoot"><b>Categories are a proposed domain addition</b> — nothing in the schema groups products yet, so this nav is the target, not the current state.</div>
  </div>`;
}

function shopCategory() {
  const items = [
    ['Nile Cotton Shirt', 'Nile Traders', 24900, 'in', 't1', 'NC', 4.6, 128],
    ['Ramie Table Runner', 'Nile Traders', 18000, 'low', 't2', 'RT', 4.4, 22],
    ['Giza Sheet Set', 'Nile Traders', 125000, 'out', 't2', 'GS', 4.9, 18],
    ['Delta Linen Napkins', 'Delta Goods', 12000, 'in', 't3', 'DL', 4.7, 41],
    ['Siwa Cotton Towel', 'Delta Goods', 9500, 'in', 't4', 'ST', 4.3, 12],
    ['Fayoum Wool Throw', 'Nile Traders', 46000, 'in', 't1', 'FW', 4.8, 9],
    ['Tanta Bath Mat', 'Delta Goods', 14000, 'low', 't3', 'TB', 4.1, 6],
    ['Asyut Cushion Cover', 'Nile Traders', 16000, 'in', 't2', 'AC', 4.5, 33],
  ];
  const card = ([n, s, p, stock, tone, ini, r, c]) => `
    <a class="pcard ${stock === 'out' ? 'off' : ''}"><div class="pthumb ${tone}"><span class="ph-label">image</span>${ini}</div>
      <div class="pmeta"><span class="pseller">${esc(s)}</span><b class="pname">${esc(n)}</b>
        <div class="prow">${stars(r, c, 12)}</div>
        <div class="prow"><span class="pprice">${money(p)}</span>${stock === 'out' ? status('bad', 'out') : stock === 'low' ? status('warn', 'low') : status('ok', 'in stock')}</div>
      </div></a>`;
  const fb = (label, on) => `<div class="frow"><span class="fbox ${on ? 'on' : ''}">${on ? I.check : ''}</span><span>${esc(label)}</span></div>`;
  return `<div class="shop">
    ${shopbar('browse', false)}
    <div class="shopbody">
      <div class="crumbs"><span class="dimx">Browse</span><i>/</i><span>Textiles</span><i>/</i><span>Shirts &amp; linen</span></div>
      <div class="catwrap">
        <aside class="filters">
          <div class="fgroup"><h4>Category</h4>${fb('Shirts', true)}${fb('Bedding')}${fb('Table linen', true)}${fb('Towels')}</div>
          <div class="fgroup"><h4>Price</h4>
            <div class="frow"><span>Under E£200</span><span class="cnt">3</span></div>
            <div class="frow"><span>E£200 – E£1,000</span><span class="cnt">4</span></div>
            <div class="frow"><span>Over E£1,000</span><span class="cnt">1</span></div>
          </div>
          <div class="fgroup"><h4>Seller</h4>${fb('Nile Traders', true)}${fb('Delta Goods')}</div>
          <div class="fgroup"><h4>Availability</h4>${fb('In stock', true)}${fb('Include out of stock')}</div>
          <div class="fgroup"><h4>Rating</h4>${fb('4★ and up', true)}${fb('3★ and up')}</div>
        </aside>
        <div class="stack">
          <div class="resbar"><b>8 results</b><span>in Shirts &amp; linen</span><span class="sortctl">Sort <b>Recommended ${I.down}</b></span></div>
          <div class="pgrid">${items.map(card).join('')}</div>
          <div class="pager" aria-label="Pagination"><button class="pgbtn" aria-label="Previous page">‹</button><button class="pgbtn on" aria-current="page">1</button><button class="pgbtn">2</button><button class="pgbtn">3</button><button class="pgbtn" aria-label="Next page">›</button></div>
        </div>
      </div>
    </div>
    <div class="shopfoot">Filters are the ones that matter most and stay visible: <b>price, category, seller, availability, rating</b>. Applied filters survive the back button — losing them is a leading cause of search abandonment.</div>
  </div>`;
}

function shopSearch() {
  return `<div class="shop">
    ${shopbar('browse', false)}
    <div class="shopbody">
      <label class="searchbig">${I.search}<input value="cotton" aria-label="Search products and sellers"><span class="shoplink">Clear</span></label>
      <div class="suggest">
        <div class="suggestrow head">Suggestions</div>
        <div class="suggestrow">${I.search}<span>cotton <b>shirt</b></span><span class="dim">12 results</span></div>
        <div class="suggestrow">${I.search}<span>cotton <b>towels</b></span><span class="dim">4 results</span></div>
        <div class="suggestrow head">Sellers</div>
        <div class="suggestrow">${I.store}<span>Nile Traders</span><span class="dim">2 products</span></div>
        <div class="suggestrow">${I.store}<span>Delta Goods</span><span class="dim">1 product</span></div>
        <div class="suggestrow head">Recent</div>
        <div class="suggestrow">${I.clock}<span>olive oil</span><span class="dim">2 days ago</span></div>
      </div>
      <p class="note">Autocomplete cuts zero-result searches by 30–40% by steering people toward inventory that exists before they commit to a query. Spelling correction, category and seller suggestions, and recent searches all live here.</p>
    </div>
  </div>`;
}

function shopCart() {
  const rows = [
    ['NC', 'Nile Cotton Shirt', 'Nile Traders · Ecru / M', 24900, 1, 't1'],
    ['DO', 'Delta Olive Oil', 'Delta Goods · 500ml', 18900, 2, 't3'],
  ].map(([ini, n, sub, p, q, tone]) => `
    <div class="cartrow">
      <div class="cartthumb">${ini}</div>
      <div class="cartname"><b>${esc(n)}</b><i>${esc(sub)}</i><span class="sizeguide" style="display:inline-block;margin-top:4px">Save for later</span></div>
      ${qty(q)}
      <div class="mono" style="text-align:right">${money(p * q)}</div>
      <button class="shopicon" style="width:30px;height:30px" aria-label="Remove ${esc(n)} from cart">${I.trash}</button>
    </div>`).join('');
  return `<div class="shop">
    ${shopbar('cart', true)}
    <div class="shopbody">
      <div class="pagehead"><div><h1>Your cart</h1><p>2 items from 2 sellers</p></div><div class="headctl"><a class="shoplink">Continue shopping</a></div></div>
      <div class="grid2">
        <section class="card"><header class="cardhead"><div><h3>Items</h3><p>Sold and shipped by each seller</p></div><button class="btn quiet">${I.heart}Save for later</button></header>
          <div class="cardpad">${rows}</div></section>
        <div class="stack">
          <section class="card"><header class="cardhead"><div><h3>Summary</h3></div></header>
            <div class="cardpad">
              <div class="kv"><span>Subtotal</span><b class="mono">${money(62700)}</b></div>
              <div class="kv"><span>Delivery</span><b>Free over E£500</b></div>
              <div class="kv"><span>Total</span><b class="mono">${money(62700)}</b></div>
              <button class="btn full" style="margin-top:14px">Checkout ${I.arrowr}</button>
              <label class="fld" style="margin-top:14px"><span>Promo code <span class="opt">(optional)</span></span><input class="input" placeholder="Enter a code"></label>
            </div></section>
          <section class="card"><header class="cardhead"><div><h3>Cart is a proposed addition</h3></div></header>
            <div class="cardpad"><p class="note">Nothing in the domain holds a cart today — the first slice was single-item checkout. A real marketplace needs this row, plus <b>saved-for-later</b> and <b>promo codes</b>.</p></div></section>
        </div>
      </div>
    </div>
  </div>`;
}

function shopConfirmation() {
  return `<div class="shop">
    ${shopbar('orders', true)}
    <div class="shopbody">
      <section class="card"><div class="confirm">
        <span class="tick">${I.check}</span>
        <h2 style="margin:0;font-size:23px">Order placed</h2>
        <p class="pdesc" style="max-width:52ch">Order <b class="mono">#1042</b> is confirmed. Payment is still <b>pending</b>, and the seller has been notified.</p>
        <div class="chips" style="justify-content:center"><span class="chip on">Order #1042</span><span class="chip">Nile Cotton Shirt · E£249.00</span><span class="chip">Nile Traders</span></div>
        <div style="display:flex;gap:10px;margin-top:6px"><button class="btn">Track this order</button><button class="btn ghost">Continue shopping</button></div>
      </div></section>
      <div class="grid2">
        <section class="card"><header class="cardhead"><div><h3>What happens next</h3></div></header><div class="cardpad">
          <ul class="tl"><li><b>Order confirmed</b><span>just now · stock reserved, seller notified</span></li>
          <li><b>Payment</b><span>pending — the payment slice lands next</span></li>
          <li><b>Dispatch</b><span>same day when paid before 2pm</span></li>
          <li><b>Delivery</b><span>estimated Tue 14 – Thu 16 Oct</span></li></ul>
        </div></section>
        <section class="card"><header class="cardhead"><div><h3>Confirmation email</h3></div></header>
          <div class="cardpad"><p class="note">A real store sends this immediately. <b>Nothing here sends email yet</b> — no invitations, no receipts, no dispatch notices. That is a gap, not a detail.</p>
          <div class="kv"><span>Receipt</span><b class="mono">#1042.pdf</b></div></div></section>
      </div>
    </div>
  </div>`;
}

function shopOrderDetail() {
  const items = `<tr><td><span class="who"><em class="dot ok"></em><span>Nile Cotton Shirt<i>Ecru / M · Nile Traders</i></span></span></td><td class="num">1</td><td class="num mono">${money(24900)}</td></tr>`;
  return `<div class="shop">
    ${shopbar('orders', true)}
    <div class="shopbody">
      <div class="crumbs"><span class="dimx">My orders</span><i>/</i><span>#1042</span></div>
      <div class="pagehead"><div><h1>Order #1042</h1><p>Placed 10 Oct 2026 · Nile Traders</p></div><div class="headctl">${status('warn', 'pending payment')}<button class="btn ghost">${I.download}Invoice</button></div></div>
      <div class="flow"><span class="fstep done"><i>${I.check}</i>Placed</span><em>→</em><span class="fstep">Paid</span><em>→</em><span class="fstep">Shipped</span><em>→</em><span class="fstep">Delivered</span></div>
      <div class="grid2">
        <div class="stack">
          ${tableCard('Items', null, [{ t: 'Product' }, { t: 'Qty', num: true }, { t: 'Line', num: true }], items, `<td colspan="2" class="right dim">Total</td><td class="num mono"><b>${money(24900)}</b></td>`)}
          <section class="card"><header class="cardhead"><div><h3>Tracking</h3><p>Nothing to track until the order is paid and dispatched</p></div></header>
            <div class="cardpad"><div class="emptyrow"><span class="emblem"></span><div><b style="font-size:14.5px">No shipment yet</b><p class="note">A tracking number appears here once the seller dispatches. Tracking requires a carrier integration that doesn’t exist.</p></div></div></div></section>
        </div>
        <div class="stack">
          <section class="card"><header class="cardhead"><div><h3>Delivering to</h3></div></header>
            <div class="cardpad">
              <div class="kv"><span>Name</span><b>Mariam Buyer</b></div>
              <div class="kv"><span>Address</span><b>12 Corniche El Nil, Cairo</b></div>
              <div class="kv"><span>Email</span><b class="mono">mariam@shopper.test</b></div>
            </div></section>
          <section class="card"><header class="cardhead"><div><h3>Need help?</h3></div></header>
            <div class="cardpad actions"><button class="btn ghost">${I.chat}Contact seller</button><button class="btn quiet">${I.undo}Request a return</button></div>
            <div class="cardpad" style="padding-top:0"><p class="note">A return can only be requested once the order is paid. The buyer-facing return flow is a proposed addition — today refunds are seller-driven only.</p></div></section>
        </div>
      </div>
    </div>
  </div>`;
}

function checkout() {
  const line = `<tr><td><span class="who"><em class="dot ok"></em><span>Nile Cotton Shirt<i>Nile Traders</i></span></span></td><td class="num">1</td><td class="num mono">${money(24900)}</td></tr>`;
  return `<div class="shop">
    ${shopbar('browse', true)}
    <div class="shopbody">
      <div class="pagehead"><div><h1>Checkout</h1><p>Signed in as Mariam Buyer · belongs to no organization</p></div><div class="headctl">${status('warn', 'step 2 of 3')}</div></div>
      <div class="flow"><span class="fstep done"><i>${I.check}</i>Cart</span><em>→</em><span class="fstep done"><i>${I.check}</i>Details</span><em>→</em><span class="fstep">Payment</span></div>
      <div class="grid2">
        <div class="stack">
          ${tableCard('Your order', null, [{ t: 'Item' }, { t: 'Qty', num: true }, { t: 'Line', num: true }], line, `<td colspan="2" class="right dim">Total</td><td class="num mono"><b>${money(24900)}</b></td>`)}
          <section class="card"><header class="cardhead"><div><h3>Delivery details</h3><p>Required fields are marked; the rest are named as optional</p></div></header>
            <div class="cardpad form">
              <label class="fld"><span>Full name <span class="req">*</span></span><input class="input" value="Mariam Buyer"></label>
              <label class="fld"><span>Email <span class="req">*</span></span><input class="input" value="mariam@shopper.test"></label>
              <label class="fld"><span>Address <span class="req">*</span></span><input class="input" placeholder="Street, city, postal code"><em>Not in the domain yet — a checkout with no address is not a checkout.</em></label>
              <label class="fld"><span>Phone <span class="opt">(optional — used only for delivery updates)</span></span><input class="input" placeholder="+20 …"></label>
            </div></section>
        </div>
        <div class="stack">
          <section class="card"><header class="cardhead"><div><h3>Summary</h3></div></header>
            <div class="cardpad">
              <div class="kv"><span>Subtotal</span><b class="mono">${money(24900)}</b></div>
              <div class="kv"><span>Delivery</span><b>Free</b></div>
              <div class="kv"><span>Total</span><b class="mono">${money(24900)}</b></div>
              <button class="btn full" style="margin-top:14px">Place order ${I.arrowr}</button>
              <p class="note" style="margin-top:12px">The 10% platform fee is taken from the <b>seller’s</b> proceeds, so the buyer pays the listed price. A fee line on this screen would be a lie — an earlier draft had one, and the total did not add up.</p>
            </div></section>
          <section class="card"><header class="cardhead"><div><h3>Not built yet — be honest about it</h3></div></header>
            <div class="cardpad">
              <p class="note"><b>Payment</b> is the next slice, so this order lands in <b>Pending payment</b>.<br>
              <b>Guest checkout</b> is deliberately absent — we chose one account. Baymard measures ~18% of shoppers abandoning rather than create one, so this is a real, costed trade-off.</p>
            </div></section>
        </div>
      </div>
    </div>
  </div>`;
}

function myOrders() {
  const rows = [
    ['#1042', 'Nile Cotton Shirt', 'Nile Traders', 'pending', '10 Oct 2026', 24900],
    ['#1031', 'Delta Olive Oil', 'Delta Goods', 'completed', '28 Sep 2026', 18900],
  ].map(([id, item, seller, st, when, t]) => `<tr>
    <td class="mono">${id}</td>
    <td><span class="who"><em class="dot ${st === 'pending' ? 'draft' : 'ok'}"></em><span>${esc(item)}<i>${esc(seller)}</i></span></span></td>
    <td>${status(st === 'completed' ? 'ok' : 'warn', st)}</td>
    <td class="dim">${when}</td>
    <td class="num mono">${money(t)}</td>
    <td class="num"><button class="btn quiet sm">Open</button></td></tr>`).join('');
  return `<div class="shop">
    ${shopbar('orders', true)}
    <div class="shopbody">
      <div class="pagehead"><div><h1>My orders</h1><p>Orders where you are the buyer — across every seller.</p></div></div>
      ${tableCard('Orders', null, [{ t: 'Order' }, { t: 'Item' }, { t: 'Status' }, { t: 'Placed' }, { t: 'Total', num: true }, { t: '' }], rows, `<td colspan="6" class="tf">Scoped to <code>buyerId = you</code>, never to a tenant — one buyer may buy from many sellers. A buyer with no orders yet gets the empty state in <b>States</b>, not a blank table.</td>`)}
    </div>
  </div>`;
}

function accountProfile() {
  return acctShell('profile',
    pagehead('Profile & security', 'Your personal account — separate from any organization you belong to.'),
    `<div class="grid2">
      <div class="stack">
        <section class="card"><header class="cardhead"><div><h3>Personal details</h3></div></header>
          <div class="cardpad form">
            <div class="row2">
              <label class="fld"><span>First name <span class="req">*</span></span><input class="input" value="Mariam"></label>
              <label class="fld"><span>Last name <span class="req">*</span></span><input class="input" value="Buyer"></label>
            </div>
            <label class="fld"><span>Email <span class="req">*</span></span><input class="input" value="mariam@shopper.test"><em>Changing this needs a verification email — which does not exist yet.</em></label>
            <label class="fld"><span>Phone <span class="opt">(optional — delivery updates only)</span></span><input class="input" placeholder="+20 …"></label>
            <div><button class="btn">Save changes</button></div>
          </div></section>
        <section class="card"><header class="cardhead"><div><h3>Password</h3></div></header>
          <div class="cardpad form">
            <label class="fld"><span>Current password <span class="req">*</span></span><input class="input" type="password" value="••••••••••••"></label>
            <label class="fld"><span>New password <span class="req">*</span></span><input class="input" type="password" placeholder="at least 12 characters"></label>
            <div><button class="btn ghost">Update password</button><span class="opt" style="margin-left:10px">signs out other sessions</span></div>
          </div></section>
      </div>
      <div class="stack">
        <section class="card"><header class="cardhead"><div><h3>Security</h3></div></header>
          <div class="cardpad">
            <div class="kv"><span>Two-factor authentication</span><b>${status('warn', 'off')}</b></div>
            <div class="kv"><span>Active sessions</span><b class="mono">2</b></div>
            <div class="kv"><span>This device</span><b>Chrome · Cairo</b></div>
            <button class="btn ghost" style="margin-top:12px">Sign out everywhere</button>
          </div></section>
        <section class="card"><header class="cardhead"><div><h3>Notifications</h3></div></header>
          <div class="cardpad">
            <div class="frow"><span class="fbox on">${I.check}</span><span>Order updates</span></div>
            <div class="frow"><span class="fbox on">${I.check}</span><span>Back-in-stock alerts</span></div>
            <div class="frow"><span class="fbox"></span><span>Price drops on wishlist</span></div>
            <div class="frow"><span class="fbox"></span><span>Seller marketing</span></div>
          </div></section>
        <section class="card"><header class="cardhead"><div><h3>Mine vs the organization’s</h3></div></header>
          <div class="cardpad"><p class="note">This is <b>your</b> account. The organizations you belong to have their own settings behind the seller console — research is blunt that mixing “mine” and “the company’s” on one screen is how people change the wrong thing.</p></div></section>
      </div>
    </div>`);
}

function accountAddresses() {
  const card = (label, name, line, def) => `
    <section class="card"><header class="cardhead"><div><h3>${esc(label)}</h3>${def ? `<p>${status('ok', 'default')}</p>` : ''}</div><button class="btn quiet sm">Edit</button></header>
      <div class="cardpad">
        <div class="kv"><span>Name</span><b>${esc(name)}</b></div>
        <div class="kv"><span>Address</span><b>${esc(line)}</b></div>
        <div class="kv"><span>Phone</span><b class="mono">+20 100 000 0000</b></div>
      </div></section>`;
  return acctShell('addresses',
    pagehead('Addresses', 'Where your orders go.', `<button class="btn">${I.plus}New address</button>`),
    `<div class="grid2">
      <div class="stack">
        ${card('Home', 'Mariam Buyer', '12 Corniche El Nil, Cairo, 11511', true)}
        ${card('Work', 'Mariam Buyer', '4 Tahrir Square, Cairo, 11511', false)}
      </div>
      <div class="stack">
        <section class="card"><header class="cardhead"><div><h3>New address</h3></div></header>
          <div class="cardpad form">
            <label class="fld"><span>Label <span class="opt">(optional)</span></span><input class="input" placeholder="Home"></label>
            <label class="fld"><span>Street <span class="req">*</span></span><input class="input" placeholder="12 Corniche El Nil"></label>
            <div class="row2">
              <label class="fld"><span>City <span class="req">*</span></span><input class="input" placeholder="Cairo"></label>
              <label class="fld"><span>Postal code <span class="req">*</span></span><input class="input mono" placeholder="11511"></label>
            </div>
            <div class="frow"><span class="fbox on">${I.check}</span><span>Make this my default address</span></div>
            <div><button class="btn full">Save address</button></div>
          </div></section>
        <section class="card"><header class="cardhead"><div><h3>Why this screen exists</h3></div></header>
          <div class="cardpad"><p class="note">There is <b>no address in the domain</b> — which is why the checkout had nowhere to send an order. An address book is the first thing that makes checkout real.</p></div></section>
      </div>
    </div>`);
}

function accountPayments() {
  return acctShell('payments',
    pagehead('Payment methods', 'Used at checkout. Card numbers never touch this app.', `<button class="btn">${I.plus}Add card</button>`),
    `<div class="grid2">
      <div class="stack">
        <section class="card"><header class="cardhead"><div><h3>Saved cards</h3></div><div>${status('ok', 'default')}</div></header>
          <div class="cardpad">
            <div class="cartrow" style="grid-template-columns:52px 1fr 120px 90px 30px">
              <span class="cemblem" style="width:52px;height:34px;border-radius:8px">${I.credit}</span>
              <div class="cartname"><b>Visa ending 4242</b><i>Expires 09 / 2028</i></div>
              <span class="dim mono">Default</span>
              <button class="btn quiet sm">Edit</button><button class="shopicon" style="width:30px;height:30px" aria-label="Remove Visa ending 4242">${I.trash}</button>
            </div>
            <div class="cartrow" style="grid-template-columns:52px 1fr 120px 90px 30px">
              <span class="cemblem" style="width:52px;height:34px;border-radius:8px">${I.credit}</span>
              <div class="cartname"><b>Mastercard ending 5100</b><i>Expires 03 / 2027</i></div>
              <span class="dim mono">Backup</span>
              <button class="btn quiet sm">Edit</button><button class="shopicon" style="width:30px;height:30px" aria-label="Remove Mastercard ending 5100">${I.trash}</button>
            </div>
          </div></section>
      </div>
      <div class="stack">
        <section class="card"><header class="cardhead"><div><h3>Add a card</h3></div></header>
          <div class="cardpad form">
            <label class="fld"><span>Card number <span class="req">*</span></span><input class="input mono" placeholder="4242 4242 4242 4242"></label>
            <div class="row2">
              <label class="fld"><span>Expiry <span class="req">*</span></span><input class="input mono" placeholder="MM / YY"></label>
              <label class="fld"><span>CVC <span class="req">*</span></span><input class="input mono" placeholder="123"></label>
            </div>
            <div class="frow"><span class="fbox on">${I.check}</span><span>Use as my default card</span></div>
            <div><button class="btn full">Save card</button></div>
          </div></section>
        <section class="card"><header class="cardhead"><div><h3>Cards are not built</h3></div></header>
          <div class="cardpad"><p class="note">This screen assumes a card vault held by the provider — the app stores a <b>token</b>, never a number. Nothing in the domain stores a payment method, and the provider adapter is phase 6.</p></div></section>
      </div>
    </div>`);
}

function accountWishlist() {
  const items = [
    ['Giza Sheet Set', 'Nile Traders', 125000, 't2', 'GS'], ['Ramie Table Runner', 'Nile Traders', 18000, 't1', 'RT'],
    ['Fayoum Wool Throw', 'Nile Traders', 46000, 't3', 'FW'],
  ].map(([n, s, p, tone, ini]) => `
    <a class="pcard"><div class="pthumb ${tone}"><span class="ph-label">image</span>${ini}</div>
      <div class="pmeta"><span class="pseller">${esc(s)}</span><b class="pname">${esc(n)}</b>
        <div class="prow"><span class="pprice">${money(p)}</span></div>
        <div class="prow" style="gap:8px"><button class="btn sm" style="flex:1;justify-content:center">${I.cart}Add to cart</button><button class="shopicon" style="width:32px;height:32px" aria-label="Remove ${esc(n)} from wishlist">${I.x}</button></div>
      </div></a>`).join('');
  return acctShell('wishlist',
    pagehead('Wishlist', '3 saved products across 1 seller.'),
    `<div class="pgrid">${items}</div>
     <div class="note">Saved products are a proposed addition — and a useful one: “back in stock” and “price dropped” alerts are why wishlists earn their keep.</div>`);
}

function productNew() {
  return shell('products', ['Catalog', 'Products', 'New'],
    pagehead('New product', 'Saved as a draft. Publishing is a separate, guarded step.',
      `<button class="btn ghost">Preview ${I.arrowr}</button><button class="btn quiet">Save draft</button><button class="btn">${I.check}Publish</button>`),
    `<div class="grid2">
      <div class="stack">
        <section class="card"><header class="cardhead"><div><h3>Details</h3></div></header>
          <div class="cardpad form">
            <label class="fld"><span>Name <span class="req">*</span></span><input class="input" placeholder="Nile Cotton Shirt"></label>
            <label class="fld"><span>Description <span class="opt">(optional)</span></span><input class="input" placeholder="What a buyer reads on the product page"></label>
            <div class="row2">
              <label class="fld"><span>Price <span class="req">*</span></span><input class="input mono" placeholder="249.00"><em>EGP · minor units 24900</em></label>
              <label class="fld"><span>Currency</span><select class="input"><option>EGP</option><option>USD</option><option>EUR</option></select></label>
            </div>
            <label class="fld"><span>Opening stock <span class="req">*</span></span><input class="input mono" placeholder="10"><em>A product with no inventory row cannot be sold — the marketplace would list something it cannot fulfil.</em></label>
          </div></section>
      </div>
      <div class="stack">
        <section class="card"><header class="cardhead"><div><h3>Image</h3><p>Required to publish — a marketplace card leads with the photo</p></div></header>
          <div class="cardpad">
            <div class="dropzone"><span class="ph-label">drop an image</span>${I.image}</div>
            <p class="note" style="margin-top:10px">Image storage does not exist yet. Until it does, a published listing has nothing to show a buyer on the card.</p>
          </div></section>
        <section class="card"><header class="cardhead"><div><h3>Publish rule</h3></div></header>
          <div class="cardpad"><p class="note">DRAFT → PUBLISHED is allowed only when the price is at least 1 minor unit. A free product is refused, and until published it is invisible to every buyer. <b>Preview</b> shows the seller exactly what the buyer will see.</p></div></section>
      </div>
    </div>`);
}

function productMedia() {
  const tiles = [['NC', 'Main'], ['NC', 'In scale'], ['NC', 'Fabric'], ['NC', 'On model']];
  const variants = [
    ['Ecru / S', 24900, 4, 'SKU-6642-ECR-S', 'ok', 'live'],
    ['Ecru / M', 24900, 8, 'SKU-6642-ECR-M', 'ok', 'live'],
    ['Ecru / L', 24900, 2, 'SKU-6642-ECR-L', 'warn', 'low'],
    ['Ecru / XL', 24900, 0, 'SKU-6642-ECR-XL', 'bad', 'out'],
    ['Indigo / M', 26900, 6, 'SKU-6642-IND-M', 'ok', 'live'],
    ['Olive / M', 24900, 0, 'SKU-6642-OLV-M', 'bad', 'out'],
  ].map(([v, p, q, sku, tone, label]) => `<tr><td><b>${esc(v)}</b></td><td class="num mono">${money(p)}</td>
    <td class="num mono">${q}</td><td class="mono dim">${esc(sku)}</td><td>${status(tone, label)}</td>
    <td><button class="btn quiet sm">Edit</button></td></tr>`).join('');
  return shell('products', ['Catalog', 'Products', 'Nile Cotton Shirt', 'Media & variants'],
    pagehead('Media & variants', 'Images and options — the two things a buyer looks at before the price.',
      `<button class="btn ghost">Preview ${I.arrowr}</button><button class="btn">${I.check}Save</button>`),
    `<div class="grid2">
      <div class="stack">
        <section class="card"><header class="cardhead"><div><h3>Images</h3><p>4 of 8 · drag to reorder, first is the card image</p></div><button class="btn quiet">${I.plus}Add</button></header>
          <div class="cardpad">
            <div class="mediagrid">
              ${tiles.map(([ini, tag], i) => `<div class="mediatile ${i === 0 ? 'main' : ''}">${ini}<span class="mtag">${i === 0 ? 'Card image' : esc(tag)}</span><button class="mdel" aria-label="Remove image ${i + 1}">${I.x}</button></div>`).join('')}
              <div class="dropzone" style="aspect-ratio:1;height:auto"><span class="ph-label">add</span>${I.plus}</div>
            </div>
            <p class="note" style="margin-top:12px">Upload, reorder, alt text and a main image. <b>Image storage does not exist</b> — this screen is the specification for it, not a screen with a backend.</p>
          </div></section>
        <section class="card"><header class="cardhead"><div><h3>Options</h3><p>Colour and size drive the variant matrix</p></div><button class="btn quiet">${I.plus}Add option</button></header>
          <div class="cardpad">
            <div class="vgroup" style="margin-bottom:16px"><span class="vlabel">Colour</span><div class="swatches">
              <span class="swatch on" style="background:#e8e2d3"></span><span class="swatch" style="background:#26324a"></span><span class="swatch out" style="background:#6b6f4a"></span></div></div>
            <div class="vgroup"><span class="vlabel">Size</span><div class="sizes">
              <button class="sizebtn">S</button><button class="sizebtn on">M</button><button class="sizebtn">L</button><button class="sizebtn out">XL</button></div></div>
          </div></section>
      </div>
      <div class="stack">
        ${tableCard('Variants', '6 combinations · each with its own price, stock and SKU', [{ t: 'Variant' }, { t: 'Price', num: true }, { t: 'Stock', num: true }, { t: 'SKU' }, { t: 'State' }, { t: '' }], variants, `<td colspan="6" class="tf">Variant-level inventory is a new model. Today one product has one stock row, which cannot express “XL is out but M is fine”.</td>`)}
      </div>
    </div>`);
}

function storeSettings() {
  const zones = [
    ['Cairo & Giza', 'E£40 · 1–2 days', 'ok', 'active'],
    ['Rest of Egypt', 'E£75 · 3–5 days', 'ok', 'active'],
    ['International', 'Not offered', 'neutral', 'off'],
  ].map(([z, rate, tone, label]) => `<tr><td><b>${esc(z)}</b></td><td class="dim">${esc(rate)}</td><td>${status(tone, label)}</td><td class="num"><button class="btn quiet sm">Edit</button></td></tr>`).join('');
  return shell('store', ['Admin', 'Store settings'],
    pagehead('Store settings', 'Nile Traders — the public face buyers see.',
      `<button class="btn ghost">View public store ${I.arrowr}</button><button class="btn">Save changes</button>`),
    `<div class="grid2">
      <div class="stack">
        <section class="card"><header class="cardhead"><div><h3>Store profile</h3></div></header>
          <div class="cardpad form">
            <label class="fld"><span>Store name <span class="req">*</span></span><input class="input" value="Nile Traders"></label>
            <label class="fld"><span>Public slug <span class="req">*</span></span><input class="input mono" value="nile-traders"><em>A buyer reaches you at /s/nile-traders — the org slug already exists in the schema.</em></label>
            <label class="fld"><span>About <span class="opt">(optional)</span></span><input class="input" value="Long-staple Egyptian cotton, made in Cairo."></label>
            <label class="fld"><span>Response time shown to buyers</span><select class="input"><option>Under 2 hours</option><option>Under 24 hours</option></select></label>
          </div></section>
        <section class="card"><header class="cardhead"><div><h3>Policies</h3></div></header>
          <div class="cardpad form">
            <label class="fld"><span>Returns window</span><select class="input"><option>14 days</option><option>30 days</option></select></label>
            <label class="fld"><span>Dispatch promise</span><input class="input" value="Same day if ordered before 2pm"></label>
          </div></section>
      </div>
      <div class="stack">
        ${tableCard('Shipping zones', null, [{ t: 'Zone' }, { t: 'Rate & time' }, { t: 'State' }, { t: '' }], zones, `<td colspan="4" class="tf">Shipping zones and rates are a proposed addition — order totals have no delivery component today.</td>`)}
        <section class="card"><header class="cardhead"><div><h3>Payout details</h3></div></header>
          <div class="cardpad">
            <div class="kv"><span>Bank</span><b>CIB ····4471</b></div>
            <div class="kv"><span>Schedule</span><b>Weekly, Fridays</b></div>
            <div class="kv"><span>Currency</span><b class="mono">EGP</b></div>
          </div></section>
      </div>
    </div>`);
}

function fulfilOrder() {
  const pack = `<tr><td><span class="who"><em class="dot ok"></em><span>Nile Cotton Shirt<i>Ecru / M · SKU-6642-ECR-M</i></span></span></td><td class="num">1</td><td class="num"><span class="fbox on">${I.check}</span></td></tr>`;
  return shell('orders', ['Money', 'Orders', '#1042', 'Fulfil'],
    pagehead('Fulfil #1042', 'Paid · 1 item · ships to Cairo.',
      `<button class="btn ghost">${I.download}Packing slip</button><button class="btn">${I.truck}Mark as shipped</button>`),
    `<div class="grid2">
      <div class="stack">
        ${tableCard('Pack these items', null, [{ t: 'Item' }, { t: 'Qty', num: true }, { t: 'Packed' }], pack, `<td colspan="3" class="tf">Marking every line packed is what allows “shipped”.</td>`)}
        <section class="card"><header class="cardhead"><div><h3>Shipment</h3></div></header>
          <div class="cardpad form">
            <div class="row2">
              <label class="fld"><span>Carrier <span class="req">*</span></span><select class="input"><option>Aramex</option><option>Bosta</option><option>DHL</option></select></label>
              <label class="fld"><span>Tracking number <span class="req">*</span></span><input class="input mono" placeholder="ARX-000-000-000"></label>
            </div>
            <p class="note">Tracking requires a carrier integration. Until then a number can be typed in but nothing is verified with the carrier — and the buyer sees whatever was typed.</p>
          </div></section>
      </div>
      <div class="stack">
        <section class="card"><header class="cardhead"><div><h3>Deliver to</h3></div></header>
          <div class="cardpad">
            <div class="kv"><span>Buyer</span><b>Mariam Buyer</b></div>
            <div class="kv"><span>Address</span><b>12 Corniche El Nil, Cairo</b></div>
            <div class="kv"><span>Phone</span><b class="mono">+20 100 000 0000</b></div>
          </div></section>
        <section class="card"><header class="cardhead"><div><h3>Fulfilment is a proposed addition</h3></div></header>
          <div class="cardpad"><p class="note">The Order state machine already has <b>Paid → Fulfilling → Completed</b>, but there is no shipment, carrier or tracking model behind it.</p></div></section>
      </div>
    </div>`);
}

function inventoryAdjust() {
  const kpis = [
    kpi('In stock', '3', null, true, null, 'var(--ok)'), kpi('Low stock', '1', 'needs attention', false, null, 'var(--warn)'),
    kpi('Out of stock', '1', 'cannot sell', false, null, 'var(--bad)'), kpi('Inventory value', compact(1245000), '6.2%', true, [4, 4.4, 4.1, 4.8, 5.2, 5, 5.4], 'var(--accent)'),
  ].join('');
  const rows = [
    ['Nile Cotton Shirt', 'SKU-6642', 10, 2, 12, 'ok', 'in stock'],
    ['Giza Sheet Set', 'SKU-7711', 0, 0, 3, 'bad', 'out'],
    ['Ramie Table Runner', 'SKU-8820', 3, 0, 8, 'warn', 'low'],
  ].map(([n, sku, av, res, ver, tone, label]) => `<tr>
    <td><span class="who"><em class="dot ${tone === 'ok' ? 'ok' : tone === 'bad' ? 'draft' : 'ok'}"></em><span>${esc(n)}<i>${esc(sku)}</i></span></span></td>
    <td class="num mono">${av}</td><td class="num mono">${res}</td><td class="num mono">${ver}</td>
    <td>${status(tone, label)}</td><td><button class="btn quiet sm">Adjust</button></td></tr>`).join('');
  return shell('inventory', ['Catalog', 'Inventory'],
    pagehead('Inventory', 'Available, reserved and version — the CHECK constraint is the guard.',
      `<button class="btn ghost">${I.download}Export</button><button class="btn">${I.plus}Adjust stock</button>`),
    `<div class="kpis">${kpis}</div>
     ${tableCard('Stock on hand', null, [{ t: 'Product' }, { t: 'Available', num: true }, { t: 'Reserved', num: true }, { t: 'Version', num: true }, { t: 'State' }, { t: '' }], rows, `<td colspan="6" class="tf">available ≥ 0 is enforced in the database, not the app. Adjustments are an append-only movement log — not an edited number.</td>`)}
     <section class="card"><header class="cardhead"><div><h3>Recent movements</h3></div></header><div class="cardpad">
       <ul class="tl"><li><b>−1 · checkout</b><span>2 min ago · #1042 · version 11 → 12</span></li>
       <li><b>+10 · received</b><span>Sep 28 · opening stock · version 10 → 11</span></li>
       <li><b>−2 · manual adjustment</b><span>Sep 24 · damaged · owner@marketcore.test</span></li></ul>
     </div></section>`);
}

function promotions() {
  const rows = [
    ['WELCOME10', '10% off', 'All products', 'ok', 'active', 'ends 31 Oct'],
    ['COTTON20', '20% off', 'Textiles', 'warn', 'scheduled', 'starts 1 Nov'],
    ['FREESHIP', 'Free delivery', 'Orders over E£500', 'neutral', 'expired', 'ended 30 Sep'],
  ].map(([code, val, scope, tone, label, when]) => `<tr><td class="mono"><b>${esc(code)}</b></td><td>${esc(val)}</td>
    <td class="dim">${esc(scope)}</td><td>${status(tone, label)}</td><td class="dim">${esc(when)}</td>
    <td class="num"><button class="btn quiet sm">Edit</button></td></tr>`).join('');
  return shell('promotions', ['Catalog', 'Promotions'],
    pagehead('Promotions', 'Discounts a buyer can apply at cart or checkout.', `<button class="btn">${I.plus}New promotion</button>`),
    `<div class="grid2">
      ${tableCard('Promotions', null, [{ t: 'Code' }, { t: 'Value' }, { t: 'Applies to' }, { t: 'Status' }, { t: 'Window' }, { t: '' }], rows, `<td colspan="6" class="tf">Discounts are a proposed addition — the cart has no promo field and no model holds a code.</td>`)}
      <div class="stack">
        <section class="card"><header class="cardhead"><div><h3>Create a promotion</h3></div></header>
          <div class="cardpad form">
            <label class="fld"><span>Code <span class="req">*</span></span><input class="input mono" placeholder="WELCOME10"></label>
            <div class="row2">
              <label class="fld"><span>Type</span><select class="input"><option>Percentage</option><option>Fixed amount</option><option>Free delivery</option></select></label>
              <label class="fld"><span>Value <span class="req">*</span></span><input class="input mono" placeholder="10"></label>
            </div>
            <label class="fld"><span>Applies to</span><select class="input"><option>All products</option><option>Textiles</option><option>One product</option></select></label>
            <div><button class="btn full">Create promotion</button></div>
          </div></section>
      </div>
    </div>`);
}

function shopSeller() {
  const items = [
    ['Nile Cotton Shirt', 24900, 't1', 'NC', 4.6, 128], ['Ramie Table Runner', 18000, 't2', 'RT', 4.4, 22],
    ['Giza Sheet Set', 125000, 't2', 'GS', 4.9, 18], ['Fayoum Wool Throw', 46000, 't3', 'FW', 4.8, 9],
  ].map(([n, p, tone, ini, r, c]) => `
    <a class="pcard"><div class="pthumb ${tone}"><span class="ph-label">image</span>${ini}</div>
      <div class="pmeta"><span class="pseller">Nile Traders</span><b class="pname">${esc(n)}</b>
        <div class="prow">${stars(r, c, 12)}</div><div class="prow"><span class="pprice">${money(p)}</span></div></div></a>`).join('');
  return `<div class="shop">
    ${shopbar('browse', false)}
    <div class="shopbody">
      <div class="storehero">
        <span class="storelogo">NT</span>
        <div>
          <h1 style="margin:0;font-size:22px;letter-spacing:-.02em">Nile Traders</h1>
          <div class="prow" style="gap:12px">${stars(4.6, 128)}<span class="tchip">${I.clock}Replies in under 2 hours</span></div>
          <p class="pdesc" style="margin-top:6px">Long-staple Egyptian cotton, made in Cairo. On MarketCore since Sep 2026.</p>
        </div>
        <div class="storestats">
          <div><b>4</b><i>Products</i></div><div><b>177</b><i>Sold</i></div><div><b>14d</b><i>Returns</i></div>
        </div>
      </div>
      <div class="chips"><span class="chip on">All products</span><span class="chip">Best selling</span><span class="chip">New in</span><span class="chip">On sale</span></div>
      <div class="resbar"><b>4 products</b><span>sorted by best selling</span><span class="sortctl">Sort <b>Best selling ${I.down}</b></span></div>
      <div class="pgrid">${items}</div>
    </div>
    <div class="shopfoot">The seller page is where marketplace trust is decided: rating, response time, sales count, returns policy and catalogue, before a single product is opened. A per-seller storefront is a proposed route — <code>/s/nile-traders</code> — and the slug already exists on Organization.</div>
  </div>`;
}

/* The buyer surface is mobile-first — over 70% of marketplace transactions are. */
function storefrontMobile() {
  const items = [
    ['Nile Cotton Shirt', 'Nile Traders', 24900, 'in', 't1', 'NC'],
    ['Delta Olive Oil', 'Delta Goods', 18900, 'in', 't3', 'DO'],
    ['Ramie Table Runner', 'Nile Traders', 18000, 'low', 't2', 'RT'],
    ['Giza Sheet Set', 'Nile Traders', 125000, 'out', 't2', 'GS'],
  ];
  const card = ([name, seller, price, stock, tone, ini]) => `
    <a class="pcard ${stock === 'out' ? 'off' : ''}">
      <div class="pthumb ${tone}">${ini}</div>
      <div class="pmeta"><span class="pseller">${esc(seller)}</span><b class="pname">${esc(name)}</b>
        <div class="prow"><span class="pprice">${money(price)}</span>
          ${stock === 'out' ? status('bad', 'out') : stock === 'low' ? status('warn', 'low') : status('ok', 'in stock')}</div>
      </div></a>`;
  return `<div class="phonewrap"><div class="phone">
    <div class="mbar"><span class="logo"></span><label class="msearch">${I.search}<input placeholder="Search products…" aria-label="Search products"></label><a class="shoplink" aria-label="Cart, 2 items">${I.cart}</a></div>
    <div class="shopbody tight">
      <div class="mfilter">${['In stock', 'Under E£200', 'Nile Traders'].map((c, i) => `<span class="chip ${i === 0 ? 'on' : ''}">${c}</span>`).join('')}</div>
      <div class="resbar"><b>4 products</b><span>· 2 sellers</span></div>
      <div class="mgrid">${items.map(card).join('')}</div>
    </div>
  </div></div>`;
}

/* ===================================================================== page */
const css = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Mono:wght@400;500&display=swap');
*{box-sizing:border-box}
body{margin:0;background:#e9eaee;color:#0a0b12;font:400 16px/1.5 "DM Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1600px;margin:0 auto;padding:32px 28px 80px}
h1.top{margin:0;font-size:28px;letter-spacing:-.025em}
p.sub{color:#5c6270;max-width:72ch;margin:9px 0 0;font-size:15px}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0 22px;position:sticky;top:0;background:#e9eaee;padding:12px 0;z-index:6;border-bottom:1px solid #d9dade}
.tab{border:1px solid #cfd1d6;background:#fff;border-radius:10px;padding:9px 15px;font:600 14px/1 "DM Sans",sans-serif;cursor:pointer;color:#3a3f4b}
.tab[aria-pressed="true"]{background:#0a0b12;color:#fff;border-color:#0a0b12}
.tab small{display:block;font-weight:400;font-size:12.5px;opacity:.7;margin-top:3px}
.hostwrap{display:flex;flex-direction:column;gap:26px}
.shot{background:#fff;border:1px solid #d9dade;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.06)}
.shot>.cap{padding:14px 18px;border-bottom:1px solid #e8e9ec;display:flex;gap:12px;align-items:baseline}
.cap b{font-size:15px}.cap span{color:#6b7280;font-size:13.5px}.cap em{margin-left:auto;font-style:normal;color:#8a8f98;font-size:13px}
.scaler{overflow:hidden}
.stitchframe{display:block;border:0;background:#fff}
/* ---------- the design system ---------- */
.ds{background:var(--canvas);color:var(--ink);font-family:"DM Sans",system-ui,sans-serif;overflow:hidden}
.shell{display:flex;height:100%;width:100%}
.ds .mono,.ds kbd{font-family:"DM Mono",ui-monospace,monospace}
.rail{width:252px;flex:0 0 252px;background:var(--rail);color:var(--railInk);display:flex;flex-direction:column;padding:16px 14px 14px;gap:6px}
.railtop{display:flex;align-items:center;gap:10px;padding:4px 6px 12px}
.logo{width:30px;height:30px;border-radius:9px;background:var(--accent);position:relative;flex:0 0 30px}
.logo:after{content:"";position:absolute;inset:8px;border-left:2px solid var(--accentInk);border-bottom:2px solid var(--accentInk)}
.ws b{display:block;font-size:14.5px;font-weight:600}.ws i{display:block;font-style:normal;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--railMuted);margin-top:2px}
.railtop>svg{margin-left:auto;color:var(--railMuted)}
.railsearch{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:0 10px;height:36px;margin-bottom:6px;color:var(--railMuted)}
.railsearch input{flex:1;background:none;border:0;outline:none;color:var(--railInk);font:inherit;font-size:14px;min-width:0}
.railsearch kbd{font-size:12px;border:1px solid rgba(255,255,255,.16);border-radius:4px;padding:1px 5px;color:var(--railMuted)}
.rail nav{display:flex;flex-direction:column;gap:1px}
.navhead{font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:var(--railMuted);opacity:.75;padding:14px 10px 5px}
.nav{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;color:var(--railMuted);font-size:14.5px;text-decoration:none;cursor:pointer}
.nav.on{background:var(--accent);color:var(--accentInk);font-weight:600}
.nav.on .count{background:rgba(255,255,255,.22);color:#fff}
.count{margin-left:auto;font-size:12.5px;font-weight:600;background:rgba(255,255,255,.1);color:var(--railMuted);border-radius:999px;padding:1px 7px}
.count.warn{background:var(--warn);color:#1b1305}
.railuser{margin-top:auto;display:flex;align-items:center;gap:9px;padding:10px 8px;border-top:1px solid rgba(255,255,255,.08);font-size:13.5px}
.railuser b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px}
.railuser i{display:block;font-style:normal;font-size:12.5px;color:var(--railMuted)}
.railuser>svg{margin-left:auto;color:var(--railMuted)}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.topbar{height:64px;flex:0 0 64px;background:var(--panel);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:14px;padding:0 20px}
.crumbs{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:600}
.crumbs .dimx{color:var(--muted);font-weight:500}.crumbs i{color:var(--faint);font-style:normal}
.topsearch{margin-left:20px;display:flex;align-items:center;gap:9px;background:var(--panel2);border:1px solid var(--line);border-radius:9px;height:36px;padding:0 10px;max-width:420px;flex:1;color:var(--muted)}
.topsearch input{flex:1;border:0;background:none;outline:none;font:inherit;font-size:14px;color:var(--ink);min-width:0}
.topsearch kbd{font-size:12px;border:1px solid var(--lineStrong);border-radius:4px;padding:1px 5px;color:var(--faint)}
.iconbtn{position:relative;width:36px;height:36px;border-radius:9px;border:1px solid var(--line);background:var(--panel);color:var(--muted);display:grid;place-items:center;cursor:pointer}
.iconbtn .badge{position:absolute;top:-5px;right:-5px;background:var(--bad);color:#fff;font-size:12px;font-weight:700;border-radius:999px;padding:1px 5px;font-style:normal}
.userchip{margin-left:auto;display:flex;align-items:center;gap:9px;padding:5px 8px;border-radius:10px;border:1px solid var(--line);background:var(--panel);font-size:13.5px}
.userchip b{display:block}.userchip i{display:block;font-style:normal;font-size:12.5px;color:var(--muted)}
.userchip>svg{color:var(--faint)}
.av{width:28px;height:28px;border-radius:50%;background:var(--panel2);color:var(--muted);display:grid;place-items:center;font-size:12.5px;font-weight:700;flex:0 0 28px;border:1px solid var(--line)}
.av.inv{background:var(--accentWash);color:var(--accent);border-color:transparent}
.page{flex:1;min-width:0;padding:20px;display:flex;flex-direction:column;gap:16px}
.pagehead{display:flex;align-items:flex-start;gap:16px}
.pagehead h1{margin:0;font-size:25px;letter-spacing:-.025em;font-weight:700}
.pagehead p{margin:3px 0 0;font-size:14.5px;color:var(--muted)}
.headctl{margin-left:auto;display:flex;gap:10px;align-items:center}
.seg{display:flex;background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:3px;gap:2px}
.seg button{border:0;background:none;font:600 13.5px/1 "DM Sans",sans-serif;color:var(--muted);padding:7px 12px;border-radius:6px;cursor:pointer}
.seg button.on{background:var(--panel);color:var(--ink);box-shadow:var(--shadow)}
.btn{display:inline-flex;align-items:center;gap:7px;background:var(--accent);color:var(--accentInk);border:1px solid transparent;border-radius:9px;padding:9px 14px;font:600 14px/1 "DM Sans",sans-serif;cursor:pointer}
.btn.ghost{background:var(--panel);color:var(--ink);border-color:var(--controlEdge)}
.btn.quiet{background:none;color:var(--muted);border-color:transparent;padding:6px 8px}
.btn.sm{padding:6px 10px;font-size:13px}.btn.full{width:100%;justify-content:center}
.inline-search{display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--controlEdge);border-radius:9px;height:38px;padding:0 11px;color:var(--muted);width:250px}
.inline-search input{border:0;background:none;outline:none;font:inherit;font-size:14px;color:var(--ink);width:100%}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:15px 16px 10px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:6px}
.kpitop{display:flex;align-items:center;gap:10px}
.kpi-label{font-size:13px;color:var(--muted);font-weight:500}
.delta{margin-left:auto;display:inline-flex;align-items:center;gap:3px;font-size:13px;font-weight:600;border-radius:999px;padding:2px 8px}
.delta.up{color:var(--ok);background:var(--okWash)}.delta.down{color:var(--bad);background:var(--badWash)}
.kpi-val{font-size:28px;font-weight:700;letter-spacing:-.03em}
.spark{display:block;width:100%;height:38px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;display:flex;flex-direction:column}
.cardhead{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line)}
.cardhead h3{margin:0;font-size:15.5px;font-weight:600}
.cardhead p{margin:2px 0 0;font-size:13px;color:var(--muted)}
.cardhead>*:last-child{margin-left:auto}
.cardpad{padding:14px 16px}
.legend{display:flex;gap:14px;font-size:13px;color:var(--muted)}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend i{width:9px;height:9px;border-radius:3px;display:inline-block}
.grid2{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;align-items:start}
.stack{display:flex;flex-direction:column;gap:16px}
.tbl{width:100%;border-collapse:collapse}
.tbl th{text-align:left;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);font-weight:600;padding:10px 16px;border-bottom:1px solid var(--line);background:var(--panel2)}
.tbl td{padding:12px 16px;font-size:14.5px;border-bottom:1px solid var(--line);vertical-align:middle}
.tbl tbody tr:last-child td{border-bottom:0}
.tbl tbody tr:hover{background:var(--panel2)}
.tbl .num{text-align:right}
.tbl .right{text-align:right}
.tbl tfoot td{background:var(--panel2);border-top:1px solid var(--line)}
.tf{font-size:13px;color:var(--muted)}
.okc{color:var(--ok)}
.who{display:flex;align-items:center;gap:10px}
.who>span{display:block;font-weight:600}
.who i{display:block;font-style:normal;font-weight:400;font-size:12.5px;color:var(--muted);font-family:"DM Mono",monospace}
.dot{width:9px;height:9px;border-radius:3px;flex:0 0 9px;background:var(--faint)}
.dot.ok{background:var(--ok)}.dot.draft{background:var(--faint)}
.st{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;border-radius:999px;padding:3px 10px;background:var(--panel2);color:var(--muted)}
.st i{width:6px;height:6px;border-radius:50%;background:currentColor}
.st.ok{background:var(--okWash);color:var(--ok)}.st.warn{background:var(--warnWash);color:var(--warn)}
.st.bad{background:var(--badWash);color:var(--bad)}.st.neutral{background:var(--panel2);color:var(--muted)}
.sharebar{display:inline-block;width:88px;height:6px;border-radius:999px;background:var(--panel2);overflow:hidden;vertical-align:middle}
.sharebar i{display:block;height:100%;border-radius:999px}
.stock{display:inline-flex;align-items:center;gap:9px}
.stock .sharebar{width:96px}.stock b{font-size:13.5px}
.dash{color:var(--faint)}.dim{color:var(--muted)}
.donutwrap{display:flex;align-items:center;gap:18px}
.dn-big{font-size:20px;font-weight:700;fill:var(--ink)}.dn-sm{font-size:12.5px;fill:var(--muted)}
.legendlist{list-style:none;margin:0;padding:0;flex:1;font-size:14px}
.legendlist li{display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--line)}
.legendlist li:last-child{border-bottom:0}.legendlist i{width:9px;height:9px;border-radius:3px}
.legendlist b{margin-left:auto;font-family:"DM Mono",monospace}
.toplist{list-style:none;margin:0;padding:6px 16px 14px}
.toplist li{display:grid;grid-template-columns:1fr 34px 88px 76px;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--line);font-size:14px}
.toplist li:last-child{border-bottom:0}
.tl-n{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tl-p{color:var(--muted);font-size:13px}.tl-m{text-align:right;font-size:13.5px}
.ax{font-size:12px;fill:var(--faint);font-family:"DM Mono",monospace}
.chart{display:block}
.form{display:flex;flex-direction:column;gap:14px}
.fld{display:block}
.fld>span{display:block;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px}
.fld em{display:block;font-style:normal;font-size:12.5px;color:var(--faint);margin-top:5px}
.input{width:100%;height:38px;border:1px solid var(--controlEdge);border-radius:9px;padding:0 12px;background:var(--panel);font:400 14.5px/1 "DM Sans",sans-serif;color:var(--ink)}
.input:focus{outline:2px solid var(--accent);outline-offset:1px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.kv{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--line);font-size:14px}
.kv:last-child{border-bottom:0}.kv span{color:var(--muted)}
.bignum{font-size:35px;font-weight:700;letter-spacing:-.03em;margin:2px 0 10px}
.bignum span{font-size:13px;font-weight:400;color:var(--muted);margin-left:8px}
.note{margin:0;font-size:13.5px;color:var(--muted);line-height:1.55}
.alertwarn,.alertbad{border-radius:var(--rSm);padding:10px 12px;font-size:13.5px;margin:0}
.alertbad{background:var(--badWash);color:var(--bad)}
.alertwarn{background:var(--warnWash);color:var(--warn)}
.actions{display:flex;gap:10px}
.tl{list-style:none;margin:0;padding:6px 16px 14px}
.tl li{padding:10px 0 10px 16px;position:relative;border-left:2px solid var(--line);margin-left:4px}
.tl li:before{content:"";position:absolute;left:-5px;top:15px;width:8px;height:8px;border-radius:50%;background:var(--ok);border:2px solid var(--panel)}
.tl b{display:block;font-size:13.5px}.tl span{font-size:13px;color:var(--muted)}
.flow{display:flex;align-items:center;gap:8px;font-size:13.5px}
.flow em{color:var(--faint);font-style:normal}
.fstep{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;background:var(--panel2);color:var(--muted);border:1px solid var(--line);font-weight:600}
.fstep.done{background:var(--accentWash);color:var(--accent);border-color:transparent}
.fstep i{display:inline-flex}
/* auth */
.authwrap{height:100%;display:grid;place-items:center;position:relative}
.authcard{width:392px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:28px;box-shadow:var(--shadow)}
.authcard h2{margin:20px 0 4px;font-size:23px;letter-spacing:-.02em}
.authsub{margin:0 0 18px;font-size:14px;color:var(--muted)}
.brandbig{display:flex;align-items:center;gap:10px;font-size:18px}
.authfoot{margin:16px 0 0;font-size:13.5px;color:var(--muted);text-align:center}
.authfoot a{color:var(--accent);font-weight:600}
.authnote{position:absolute;bottom:26px;font-size:13px;color:var(--faint);max-width:540px;text-align:center}
/* doc */
.doc{padding:28px 32px;height:100%;overflow:hidden}
.dochead h1{margin:0 0 6px;font-size:23px}.dochead p{margin:0 0 18px;color:var(--muted);max-width:72ch;font-size:14.5px}
.doc section{margin-bottom:18px}
.doc h4{margin:0 0 9px;font-size:12.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
.swrow{display:flex;gap:12px;flex-wrap:wrap}
.sw{border:1px solid var(--line);border-radius:var(--rSm);padding:10px;width:176px;background:var(--panel)}
.sw i{display:block;height:36px;border-radius:6px;border:1px solid var(--line)}
.sw b{display:block;margin-top:8px;font-size:13.5px}
.sw .swrole{display:block;font-size:13px;color:var(--muted)}
.sw code{font-size:12.5px;color:var(--faint)}
.typerow{display:flex;gap:22px;align-items:baseline;background:var(--panel);border:1px solid var(--line);border-radius:var(--rSm);padding:14px 16px}
.t1{font-size:27px;font-weight:700;letter-spacing:-.03em}.t2{font-size:19px;font-weight:600}
.t3{font-size:14.5px;color:var(--muted)}.lblx{font-size:12.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
.typerow .mono{color:var(--muted)}
.ctlrow{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);border-radius:var(--rSm);padding:12px 14px}
.motifs{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.motiflabel{display:block;font-size:13px;color:var(--muted);margin-bottom:9px}
.motifbox{background:var(--panel);border:1px solid var(--line);border-radius:var(--rSm);padding:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.motifbox.col{flex-direction:column;align-items:flex-start}
.motifbox .spark{width:200px}
.stategrid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.stategrid .card{min-height:200px}
.skel{height:13px;border-radius:6px;background:var(--panel2);margin-bottom:12px}
.empty{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:26px 16px}
.empty b{font-size:15px}
.emblem{width:40px;height:40px;border-radius:12px;background:var(--panel2);display:inline-block}
.emblem.slash{background:repeating-linear-gradient(45deg,var(--lineStrong),var(--lineStrong) 4px,var(--panel2) 4px,var(--panel2) 8px)}
/* ---------- storefront — the public buyer surface ---------- */
.shop{height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--canvas)}
.shopbar{flex:0 0 64px;display:flex;align-items:center;gap:18px;padding:0 26px;background:var(--panel);border-bottom:1px solid var(--line)}
.shopbrand{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:700;letter-spacing:-.02em}
.shopsearch{margin-left:10px;flex:1;max-width:520px;display:flex;align-items:center;gap:9px;background:var(--panel2);border:1px solid var(--line);border-radius:10px;height:40px;padding:0 12px;color:var(--muted)}
.shopsearch input{flex:1;border:0;background:none;outline:none;font:inherit;font-size:14.5px;color:var(--ink);min-width:0}
.shopsearch kbd{font-size:12px;border:1px solid var(--lineStrong);border-radius:4px;padding:1px 5px;color:var(--faint)}
.shopright{margin-left:auto;display:flex;align-items:center;gap:14px}
.shoplink{font-size:14.5px;font-weight:600;color:var(--muted);cursor:pointer}
.shoplink.on{color:var(--accent)}
.shopuser{display:flex;align-items:center;gap:9px;font-size:14px;border:1px solid var(--line);background:var(--panel);border-radius:10px;padding:4px 8px}
.shopuser b{font-weight:600}.shopuser>svg{color:var(--faint)}
.shopbody{flex:1;min-height:0;overflow:hidden;padding:22px 26px;display:flex;flex-direction:column;gap:18px}
.shopbody>*,.acctmain>*{flex:0 0 auto}
.shopfoot{padding:0 26px 18px;color:var(--muted);font-size:13px}
.shopfoot code{background:var(--panel2);border-radius:4px;padding:1px 5px;color:var(--muted)}
.shophero{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:26px;box-shadow:var(--shadow)}
.shophero h1{margin:0;font-size:28px;letter-spacing:-.03em}
.shophero p{margin:7px 0 18px;color:var(--muted);font-size:14.5px}
.chips{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
.chip{border:1px solid var(--line);background:var(--panel);border-radius:999px;padding:6px 13px;font-size:13.5px;font-weight:600;color:var(--muted);cursor:pointer}
.chip.on{background:var(--accent);color:var(--accentInk);border-color:transparent}
.resbar{display:flex;align-items:baseline;gap:10px;font-size:14px;color:var(--muted)}
.resbar b{color:var(--ink);font-size:15.5px}
.pgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.pcard{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;display:flex;flex-direction:column;cursor:pointer}
.pthumb{height:118px;display:grid;place-items:center;font-family:"DM Mono",monospace;font-size:29px;font-weight:500;border-bottom:1px solid var(--line)}
.pthumb.t1{background:var(--accentWash);color:var(--accent)}
.pthumb.t2{background:var(--panel2);color:var(--info)}
.pthumb.t3{background:var(--okWash);color:var(--ok)}
.pthumb.t4{background:var(--warnWash);color:var(--warn)}
.pmeta{padding:12px 14px 14px;display:flex;flex-direction:column;gap:4px}
.pseller{font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);font-weight:600}
.pname{font-size:15px;font-weight:600}
.prow{display:flex;align-items:center;gap:8px;margin-top:4px}
.pprice{font-family:"DM Mono",monospace;font-size:15px;font-weight:500}
.prow .st{margin-left:auto}
.pdp{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
.pdpimg{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);display:grid;place-items:center;font-family:"DM Mono",monospace;font-size:61px;color:var(--accent)}
.pdpinfo{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:24px;display:flex;flex-direction:column;gap:12px}
.pdpinfo h1{margin:0;font-size:26px;letter-spacing:-.03em}
.psellerbig{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);font-weight:600}
.bigprice{font-family:"DM Mono",monospace;font-size:29px;font-weight:500}
.pdesc{font-size:14.5px;color:var(--muted);line-height:1.6;margin:0}
.qtybox{display:inline-flex;align-items:center;border:1px solid var(--controlEdge);border-radius:10px;overflow:hidden;width:118px;height:42px;flex:0 0 118px}
.qtybox button{border:0;background:var(--panel2);width:36px;height:100%;font-size:17px;cursor:pointer;color:var(--muted)}
.qtybox input{flex:1;width:100%;border:0;background:none;text-align:center;font-family:"DM Mono",monospace;font-size:15px;color:var(--ink);outline:none;min-width:0}
.pthumb{position:relative}
.ph-label{position:absolute;bottom:7px;left:10px;font-family:"DM Sans",system-ui,sans-serif;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600}
.resbar .sortctl{margin-left:auto}
.sortctl{display:inline-flex;align-items:center;gap:8px;font-size:14px;color:var(--muted)}
.sortctl b{color:var(--ink);font-weight:600;display:inline-flex;align-items:center;gap:5px}
.tchip{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--muted);background:var(--panel2);border-radius:999px;padding:3px 9px}
.req{color:var(--bad)}
.opt{font-size:12.5px;color:var(--faint);font-weight:400}
.emptyrow{display:flex;align-items:center;gap:14px;padding:6px 2px}
.emptyrow .emblem{margin:0}
.pcard.off{opacity:.62}
.pcard.off .pprice{color:var(--muted)}
/* phone — the buyer surface is mobile-first */
.phonewrap{height:100%;display:grid;place-items:center;background:var(--panel2)}
.phone{width:392px;height:812px;background:var(--panel);border:11px solid #14161d;border-radius:44px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(10,12,20,.35)}
.mbar{flex:0 0 54px;display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid var(--line);background:var(--panel)}
.mbar .logo{width:26px;height:26px;border-radius:8px;flex:0 0 26px}
.msearch{flex:1;display:flex;align-items:center;gap:7px;background:var(--panel2);border:1px solid var(--line);border-radius:9px;height:34px;padding:0 10px;color:var(--muted)}
.msearch input{flex:1;border:0;background:none;outline:none;font:inherit;font-size:13.5px;color:var(--ink);min-width:0}
.mfilter{display:flex;gap:8px;padding-bottom:2px}
.mfilter .chip{white-space:nowrap;padding:5px 11px;font-size:13px}
.mgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.mgrid .pthumb{height:120px}
.mgrid .pmeta{padding:10px 11px 12px}
.shopbody.tight{padding:14px 16px;gap:12px}
.dropzone{height:150px;border:1.5px dashed var(--controlEdge);border-radius:var(--rSm);display:grid;place-items:center;font-size:27px;color:var(--faint);background:var(--panel2);position:relative}
/* ---------- marketplace chrome ---------- */
.catbar{flex:0 0 44px;display:flex;align-items:center;gap:2px;padding:0 26px;background:var(--panel);border-bottom:1px solid var(--line)}
.cat{padding:7px 12px;border-radius:8px;font-size:14px;font-weight:600;color:var(--muted);cursor:pointer;white-space:nowrap}
.cat:hover{background:var(--panel2);color:var(--ink)}
.cat.on{color:var(--accent);background:var(--accentWash)}
.cat.deals{color:var(--bad)}
.catpush{flex:1}
.shopicon{position:relative;width:36px;height:36px;border-radius:9px;display:grid;place-items:center;color:var(--muted);cursor:pointer}
.shopicon.on,.shopicon:hover{background:var(--panel2);color:var(--ink)}
.sbadge{position:absolute;top:1px;right:1px;background:var(--accent);color:var(--accentInk);font-size:12px;font-weight:700;font-style:normal;border-radius:999px;padding:1px 5px}
.rating{display:inline-flex;align-items:center;gap:2px;font-size:13.5px;color:var(--muted)}
.stari{fill:var(--lineStrong)}
.stari.on{fill:var(--warn)}
.rating b{color:var(--ink);font-weight:600;margin-left:5px}
.rcount{margin-left:4px}
/* account */
.acctwrap{flex:1;min-height:0;display:grid;grid-template-columns:246px 1fr;overflow:hidden}
.acctnav{border-right:1px solid var(--line);background:var(--panel);padding:16px 12px;display:flex;flex-direction:column;gap:2px}
.accthead{display:flex;align-items:center;gap:10px;padding:6px 8px 14px;border-bottom:1px solid var(--line);margin-bottom:8px}
.accthead b{display:block;font-size:14px}.accthead i{display:block;font-style:normal;font-size:12.5px;color:var(--muted)}
.anav{padding:9px 10px;border-radius:8px;font-size:14.5px;font-weight:600;color:var(--muted);cursor:pointer}
.anav:hover{background:var(--panel2);color:var(--ink)}
.anav.on{background:var(--accentWash);color:var(--accent)}
.acctmain{min-width:0;overflow:hidden;padding:22px 26px;display:flex;flex-direction:column;gap:16px}
/* gallery */
.gallery{display:flex;flex-direction:column;gap:12px}
.gmain{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);position:relative;display:grid;place-items:center;font-family:"DM Mono",monospace;font-size:65px;color:var(--accent);flex:1;min-height:330px}
.zoomtag{position:absolute;top:12px;right:12px;display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--muted);background:var(--panel2);border-radius:999px;padding:4px 10px}
.gthumbs{display:flex;gap:10px}
.gthumb{width:74px;height:74px;border-radius:var(--rSm);border:1px solid var(--line);background:var(--panel2);display:grid;place-items:center;font-family:"DM Mono",monospace;font-size:16px;color:var(--muted);cursor:pointer}
.gthumb.on{border-color:var(--accent);box-shadow:0 0 0 2px var(--accentWash)}
/* variants */
.vgroup{display:flex;flex-direction:column;gap:8px}
.vlabel{font-size:13px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}
.swatches{display:flex;gap:10px;flex-wrap:wrap}
.swatch{width:34px;height:34px;border-radius:50%;border:1px solid var(--lineStrong);position:relative;cursor:pointer;background:var(--panel2)}
.swatch.on{box-shadow:0 0 0 2px var(--panel),0 0 0 4px var(--accent)}
.swatch.out:after{content:"";position:absolute;inset:-2px;border-radius:50%;background:linear-gradient(to top right,transparent 46%,var(--bad) 46%,var(--bad) 54%,transparent 54%)}
.sizes{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.sizebtn{min-width:44px;height:36px;padding:0 12px;border:1px solid var(--controlEdge);border-radius:9px;background:var(--panel);font:600 14px/1 "DM Sans",sans-serif;color:var(--ink);cursor:pointer}
.sizebtn.on{background:var(--ink);border-color:var(--ink);color:var(--panel)}
.sizebtn.out{color:var(--faint);border-style:dashed;text-decoration:line-through;cursor:not-allowed}
.sizeguide{font-size:13px;color:var(--accent);font-weight:600;cursor:pointer}
.vnote{font-size:13px;color:var(--bad)}
/* filters */
.catwrap{flex:1;min-height:0;display:grid;grid-template-columns:230px 1fr;gap:18px;overflow:hidden;align-items:start}
.filters{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px;display:flex;flex-direction:column;gap:16px;overflow:hidden}
.fgroup{display:flex;flex-direction:column;gap:9px}
.fgroup h4{margin:0;font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);font-weight:600}
.frow{display:flex;align-items:center;gap:9px;font-size:14px;color:var(--ink)}
.frow .cnt{margin-left:auto;color:var(--muted);font-size:13px}
.fbox{width:15px;height:15px;border-radius:4px;border:1px solid var(--controlEdge);flex:0 0 15px;display:grid;place-items:center;color:var(--accentInk);font-size:12px}
.fbox.on{background:var(--accent);border-color:var(--accent)}
.pager{display:flex;align-items:center;gap:6px;justify-content:center}
.pgbtn{min-width:32px;height:32px;padding:0 9px;border:1px solid var(--line);border-radius:8px;background:var(--panel);font:600 13.5px/1 "DM Sans",sans-serif;color:var(--muted);cursor:pointer}
.pgbtn.on{background:var(--ink);border-color:var(--ink);color:var(--panel)}
/* home */
.homerow{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.catcard{border:1px solid var(--line);background:var(--panel);border-radius:var(--r);padding:15px;box-shadow:var(--shadow);display:flex;align-items:center;gap:12px;cursor:pointer}
.cemblem{width:40px;height:40px;border-radius:11px;background:var(--accentWash);color:var(--accent);display:grid;place-items:center;flex:0 0 40px}
.catcard b{display:block;font-size:14.5px}.catcard i{display:block;font-style:normal;font-size:13px;color:var(--muted)}
/* search suggestions */
.suggest{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;max-width:640px}
.suggestrow{display:flex;align-items:center;gap:11px;padding:11px 14px;font-size:14.5px;border-bottom:1px solid var(--line);color:var(--ink)}
.suggestrow:last-child{border-bottom:0}
.suggestrow .dim{margin-left:auto;font-size:13px}
.suggestrow.head{background:var(--panel2);font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);font-weight:600}
.searchbig{display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--controlEdge);border-radius:11px;height:50px;padding:0 12px 0 15px;color:var(--muted);max-width:640px}
.searchbig input{flex:1;border:0;background:none;outline:none;font:inherit;font-size:16px;color:var(--ink);min-width:0}
/* cart */
.cartrow{display:grid;grid-template-columns:64px 1fr 118px 92px 30px;gap:14px;align-items:center;padding:14px 0;border-bottom:1px solid var(--line)}
.cartrow:last-child{border-bottom:0}
.cartthumb{width:64px;height:64px;border-radius:var(--rSm);background:var(--panel2);display:grid;place-items:center;font-family:"DM Mono",monospace;color:var(--muted);border:1px solid var(--line)}
.cartname b{display:block;font-size:14.5px}
.cartname i{display:block;font-style:normal;font-size:13px;color:var(--muted)}
/* reviews */
.revhead{display:grid;grid-template-columns:190px 1fr;gap:26px;align-items:center}
.bigrate{font-size:45px;font-weight:700;letter-spacing:-.03em;line-height:1}
.revbar{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted);margin:5px 0}
.revbar .track{flex:1;height:7px;border-radius:999px;background:var(--panel2);overflow:hidden}
.revbar .track i{display:block;height:100%;background:var(--warn)}
.review{padding:14px 0;border-bottom:1px solid var(--line)}
.review:last-child{border-bottom:0}
.revmeta{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted);margin-bottom:6px}
.verified{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;color:var(--ok);background:var(--okWash);border-radius:999px;padding:2px 8px}
/* store */
.storehero{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:22px;display:flex;gap:18px;align-items:center}
.storelogo{width:64px;height:64px;border-radius:16px;background:var(--accentWash);color:var(--accent);display:grid;place-items:center;font-weight:700;font-size:21px;flex:0 0 64px}
.storestats{display:flex;gap:26px;margin-left:auto;text-align:right}
.storestats b{display:block;font-size:21px;font-weight:700;letter-spacing:-.02em}
.storestats i{display:block;font-style:normal;font-size:12.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
/* media editor */
.mediagrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.mediatile{aspect-ratio:1;border-radius:var(--rSm);border:1px solid var(--line);background:var(--panel2);display:grid;place-items:center;font-family:"DM Mono",monospace;color:var(--muted);position:relative;cursor:grab}
.mediatile.main{border-color:var(--accent);box-shadow:0 0 0 2px var(--accentWash)}
.mtag{position:absolute;bottom:6px;left:6px;font-family:"DM Sans",system-ui,sans-serif;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent)}
.mdel{position:absolute;top:5px;right:5px;color:var(--faint)}
/* confirmation */
.confirm{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:30px 16px}
.tick{width:52px;height:52px;border-radius:50%;background:var(--okWash);color:var(--ok);display:grid;place-items:center}
/* ---------- accessibility & interaction pass ---------- */
.tblwrap{overflow-x:auto}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.skip{position:absolute;left:-9999px;top:0;z-index:100;background:var(--accent);color:var(--accentInk);padding:11px 18px;border-radius:0 0 10px 0;font:600 15px/1 "DM Sans",sans-serif;text-decoration:none}
.skip:focus{left:0}
.chip{white-space:nowrap}
.catcard,.pcard,.chip,.pgbtn,.tab,.nav,.anav,.shopicon,.shoplink,.sizeguide,.frow,.gthumb,.mediatile,.cat,.swatch,.sizebtn,.iconbtn,.btn,.logo{cursor:pointer}
.sizebtn.out,button:disabled{cursor:not-allowed}
.frow{min-height:26px}
.fbox{width:20px;height:20px;border-radius:5px;flex:0 0 20px}
.mdel{width:24px;height:24px;display:grid;place-items:center;border-radius:7px}
.mdel:hover{background:var(--panel2);color:var(--ink)}
.alertbad b{display:block;margin-bottom:5px}
.erreflink{display:block;color:inherit;font-weight:600;text-decoration:underline}
.input.invalid{border-color:var(--bad);background:var(--badWash)}
.errtxt{margin:6px 0 0;color:var(--bad);font-weight:600;font-size:13px}
:where(a,button,input,select,textarea,[tabindex]):focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:9px}
:where(.shopsearch,.searchbig,.inline-search,.topsearch,.railsearch,.msearch,.qtybox):focus-within{outline:3px solid var(--accent);outline-offset:1px}
html{scroll-behavior:smooth}
:target,.skip{scroll-margin-top:84px}
/* one visible, consistent focus ring; motion is a preference, not a default */
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}
}
`;

const SCREENS = [
  /* --- auth --- */
  { id: 'signin', title: 'Sign in', note: 'auth · error state', h: 820, doc: true, fn: signin },
  { id: 'register', title: 'Register', note: 'auth · password policy', h: 820, doc: true, fn: register },
  { id: 'onboarding', title: 'First run', note: 'no organization yet → create one', h: 820, doc: true, fn: onboarding },
  /* --- buyer · discovery --- */
  { id: 'shop-home', title: 'Home', note: 'categories, featured, deals', h: 800, fn: shopHome },
  { id: 'storefront', title: 'Browse', note: 'all published products', h: 710, fn: storefront },
  { id: 'shop-category', title: 'Category', note: 'filters, sort, pagination', h: 900, fn: shopCategory },
  { id: 'shop-search', title: 'Search', note: 'autocomplete, recent, sellers', h: 640, fn: shopSearch },
  { id: 'shop-seller', title: 'Seller store', note: 'rating, response time, catalogue', h: 750, fn: shopSeller },
  /* --- buyer · product --- */
  { id: 'shop-product', title: 'Product', note: 'gallery, variants, specs, buy box', h: 1320, fn: shopProduct },
  { id: 'shop-product-reviews', title: 'Product — reviews', note: 'ratings breakdown, cross-sell', h: 960, fn: shopProductReviews },
  { id: 'storefront-mobile', title: 'Mobile', note: 'mobile-first · 70%+ of transactions', h: 880, fn: storefrontMobile },
  /* --- buyer · cart & checkout --- */
  { id: 'shop-cart', title: 'Cart', note: 'items, save for later, promo', h: 750, fn: shopCart },
  { id: 'checkout', title: 'Checkout', note: 'progress · required fields · honest gaps', h: 960, fn: checkout },
  { id: 'shop-confirmation', title: 'Order placed', note: 'confirmation · what happens next', h: 880, fn: shopConfirmation },
  /* --- buyer · orders --- */
  { id: 'my-orders', title: 'My orders', note: 'buyer-scoped · buyerId = you', h: 530, fn: myOrders },
  { id: 'shop-order', title: 'Order detail', note: 'tracking, invoice, return', h: 740, fn: shopOrderDetail },
  /* --- account --- */
  { id: 'account-profile', title: 'Account — profile', note: 'personal, apart from the org', h: 920, fn: accountProfile },
  { id: 'account-addresses', title: 'Account — addresses', note: 'address book', h: 810, fn: accountAddresses },
  { id: 'account-payments', title: 'Account — payments', note: 'saved cards, tokenised', h: 730, fn: accountPayments },
  { id: 'account-wishlist', title: 'Account — wishlist', note: 'saved products', h: 570, fn: accountWishlist },
  /* --- seller · console --- */
  { id: 'dashboard', title: 'Dashboard', note: 'KPIs, chart, orders', h: 1200, fn: dashboard },
  { id: 'products', title: 'Products', note: 'dense table, stock bars, trend', h: 810, fn: products },
  { id: 'product', title: 'Product detail', note: 'form, inventory, sales', h: 880, fn: productDetail },
  { id: 'product-new', title: 'New product', note: 'create → draft → publish', h: 810, fn: productNew },
  { id: 'product-media', title: 'Media & variants', note: 'images, options, variant matrix', h: 960, fn: productMedia },
  { id: 'inventory', title: 'Inventory', note: 'stock, reserved, movements', h: 1020, fn: inventoryAdjust },
  { id: 'promotions', title: 'Promotions', note: 'discount codes', h: 810, fn: promotions },
  { id: 'orders', title: 'Orders', note: 'order list', h: 810, fn: orders },
  { id: 'order', title: 'Order detail', note: 'items, ledger, timeline', h: 920, fn: orderDetail },
  { id: 'fulfil', title: 'Fulfil an order', note: 'pack, carrier, tracking', h: 810, fn: fulfilOrder },
  { id: 'refunds', title: 'Refunds', note: 'INV-5, request panel', h: 810, fn: refunds },
  { id: 'payouts', title: 'Payouts', note: 'INV-8, balances', h: 810, fn: payouts },
  { id: 'store-settings', title: 'Store settings', note: 'org profile, policies, zones', h: 850, fn: storeSettings },
  { id: 'members', title: 'Members', note: 'roles, tenant isolation', h: 810, fn: members },
  { id: 'operations', title: 'Operations', note: 'webhooks, outbox', h: 810, fn: operations },
  /* --- reference --- */
  { id: 'foundations', title: 'Foundations', note: 'tokens, type, components', h: 1370, doc: true, fn: foundations },
  { id: 'states', title: 'States', note: 'loading · empty · 404 · zero results · unpaid · invalid', h: 1200, doc: true, fn: states },
];

/*
 * The Stitch redesign, ported by port-stitch.mjs: each fragment is one Stitch screen with
 * its CSS scoped to it and its colours tokenised. A screen with a fragment renders it at
 * the viewport Stitch laid it out at; a screen without one falls back to its function,
 * at the board's 1440px.
 */
const CRAFT_DIR = path.join(HERE, 'stitch-port');
const CRAFT = {};
if (fs.existsSync(CRAFT_DIR)) {
  for (const f of fs.readdirSync(CRAFT_DIR).filter((n) => n.endsWith('.html'))) {
    const src = fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8');
    const nl = src.indexOf('\n');
    CRAFT[f.replace(/\.html$/, '')] = { ...JSON.parse(src.slice(5, nl - 4)), html: src.slice(nl + 1) };
  }
}
SCREENS.forEach((sc) => {
  const c = CRAFT[sc.id];
  sc.view = c ? { w: c.w, h: c.h, frame: c.frame } : { w: 1440, h: sc.h, frame: `height:${sc.h}px` };
});

/*
 * Stitch also wrote colours that are not tokens — a gradient stop, a darker indigo, a
 * translucent white bar. In Quartz they render as written, which is what keeps the port
 * pixel-identical. In any other skin each one takes the value of its nearest Quartz
 * token in that skin, keeping the light/dark relationship; translucent white and black
 * become the skin's panel and ink at the same alpha.
 */
const isRgba = (c) => String(c).startsWith('rgba');
const hexChannels = (c) => { const h = String(c).replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const PRIMARY = SKINS.find((s) => s.primary);
/* Text matches only text tokens and everything else only surface tokens — otherwise a
   near-white gradient stop lands on `railInk` and a near-black label on `rail`. */
const TEXT_KEYS = ['ink', 'muted', 'faint', 'accent', 'accentInk', 'ok', 'bad', 'warn', 'info', 'railInk', 'railMuted'];
const SURFACE_KEYS = ['canvas', 'panel', 'panel2', 'rail', 'line', 'lineStrong', 'controlEdge', 'accent', 'accentWash', 'ok', 'okWash', 'bad', 'badWash', 'warn', 'warnWash', 'info', 'grid'];
const nearest = (hex, keys) => {
  const c = hexChannels(hex);
  let best = null, bestD = Infinity;
  for (const k of keys) {
    const d = hexChannels(PRIMARY.v[k]).reduce((sum, x, i) => sum + (x - c[i]) ** 2, 0);
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
};
const withAlpha = (hex, a) => `rgba(${hexChannels(hex).join(',')},${a})`;
const isTextProp = (prop) => /^(color|fill|stroke|caret-color|-webkit-text-fill-color|text-decoration-color)$/i.test(prop.trim());
const reskinValue = (value, v, keys) => value
  .replace(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi, (hex) => {
    const full = hex.length === 4 ? '#' + [...hex.slice(1)].map((x) => x + x).join('') : hex;
    return v[nearest(full, keys)];
  })
  .replace(/rgba?\(\s*255[\s,]+255[\s,]+255\s*[,/]\s*([\d.]+)\s*\)/g, (m, a) => (isRgba(v.panel) ? v.panel : withAlpha(v.panel, a)))
  .replace(/rgba\(\s*(?:0|10|11|15|16)\s*,\s*(?:0|11|13|23|24)\s*,\s*(?:0|18|20|40|42)\s*,\s*([\d.]+)\s*\)/g, (m) => (v.shadow === 'none' ? 'transparent' : m));
const reskinDecls = (decls, v) => decls.replace(/([a-z-]+)(\s*:)([^;]*)/gi, (m, prop, colon, value) =>
  prop + colon + reskinValue(value, v, isTextProp(prop) ? TEXT_KEYS : SURFACE_KEYS));
const reskin = (html, s) => (s === PRIMARY ? html : html
  .replace(/ style="([^"]*)"/g, (m, decls) => ` style="${reskinDecls(decls, s.v)}"`)
  .replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (m, a, body, b) => a + body.replace(/\{([^{}]*)\}/g, (x, decls) => `{${reskinDecls(decls, s.v)}}`) + b));

const SHOTS = {};
SKINS.forEach((s) => {
  SHOTS[s.id] = SCREENS.map((sc) => ({
    h: sc.view.h,
    html: `<div class="ds" style="${vars(s.v)};${sc.view.frame}">${CRAFT[sc.id] ? reskin(CRAFT[sc.id].html, s) : sc.fn(s)}</div>`,
  }));
});

const CRAFT_LINKS = [...new Set(Object.values(CRAFT).flatMap((c) => c.links))];
const linkTags = CRAFT_LINKS.map((href) => `<link rel="stylesheet" href="${esc(href)}">`).join('');

/* The Stitch originals, byte for byte, for the board's two Stitch tabs. */
const STITCH_MANIFEST = path.join(OUT, 'stitch', 'manifest.json');
const STITCH = fs.existsSync(STITCH_MANIFEST) ? JSON.parse(fs.readFileSync(STITCH_MANIFEST, 'utf8')) : {};

/* =============================================================== tokens.json */
const T = (value, type) => ({ value, type });
const tokens = {
  $description:
    'MarketCore — the Quartz direction, as designed. NOT the tokens the shipped app uses: the ' +
    'console is styled by packages/ui/src/tokens.css, whose names (action, positive, attention) ' +
    'and radii differ from the Quartz board. This file is the unshipped design spec; see ' +
    'docs/design/deliverables/README.md, "Not yet done". Generated from generators/gen-ui.mjs.',
  color: Object.fromEntries(Object.entries(SKINS[0].v)
    .filter(([k]) => !['r', 'rSm', 'shadow', 'grid', 'font', 'fontMono'].includes(k))
    .map(([k, v]) => [k, T(v, 'color')])),
  radius: { card: T(SKINS[0].v.r, 'borderRadius'), control: T(SKINS[0].v.rSm, 'borderRadius') },
  typography: {
    font: { family: T('DM Sans', 'fontFamilies'), weight: { regular: T('400', 'fontWeights'), medium: T('500', 'fontWeights'), semibold: T('600', 'fontWeights'), bold: T('700', 'fontWeights') } },
    mono: { family: T('DM Mono', 'fontFamilies') },
    size: { label: T('12px', 'fontSizes'), body: T('14.5px', 'fontSizes'), title: T('25px', 'fontSizes'), metric: T('28px', 'fontSizes'), display: T('35px', 'fontSizes') },
  },
};
fs.writeFileSync(path.join(OUT, 'tokens.json'), JSON.stringify(tokens, null, 2));

/* ================================================================= DESIGN.md */
/*
 * The same system as the board and the tokens, written as prose an agent can follow.
 * This is the file a design tool imports and a coding agent reviews against, so it is
 * generated from the same values rather than written by hand — a hand-written copy is
 * how a design document starts lying about the design.
 */
const rgbaParts = (c) => { const n = String(c).match(/[\d.]+/g).map(Number); return { rgb: n.slice(0, 3), a: n[3] }; };
const toHex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
/* Graphite tints are alpha, so they have to be composited before they can be measured —
   treating rgba(…,.15) as if it were opaque is how a dark theme passes contrast on paper. */
const composite = (c, bg) => { const { rgb, a } = rgbaParts(c); const back = hexChannels(bg); return toHex(rgb.map((v, i) => a * v + (1 - a) * back[i])); };
const resolve = (v, key) => (isRgba(v[key]) ? composite(v[key], v.panel) : v[key]);
const srgb = (c) => { const f = (x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)); const [r, g, b] = hexChannels(c).map((x) => f(x / 255)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [hi, lo] = [srgb(a), srgb(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

const md = [];
const P = (...lines) => lines.forEach((l) => md.push(l));

const ROLES = {
  canvas: 'app background', panel: 'cards, bars, anything raised', panel2: 'inset wells, table heads, hovered rows',
  rail: 'navigation plane — seller console only', railInk: 'primary text on the rail', railMuted: 'secondary text on the rail',
  ink: 'primary text', muted: 'secondary text', faint: 'tertiary text, uppercase labels and table headers',
  line: 'hairline divider', lineStrong: 'decorative border', controlEdge: 'control boundary — needs 3:1',
  accent: 'the one action: buttons, links, active nav', accentInk: 'text on accent', accentWash: 'accent tint behind accent text',
  ok: 'healthy, paid, in stock', okWash: 'ok tint', bad: 'failed, refunded, out of stock', badWash: 'bad tint',
  warn: 'needs attention, low stock', warnWash: 'warn tint', info: 'informational, neutral data series',
};
const PAIRS = [
  ['ink', 'canvas', 'body text'], ['ink', 'panel', 'text on a card'],
  ['muted', 'panel', 'secondary text'], ['faint', 'panel', 'uppercase labels'],
  ['faint', 'panel2', 'table headers'], ['railMuted', 'rail', 'rail navigation'],
  ['accent', 'panel', 'links, active nav'], ['accentInk', 'accent', 'button label'],
  ['ok', 'okWash', 'success pill'], ['warn', 'warnWash', 'warning pill'],
  ['bad', 'badWash', 'danger pill'], ['info', 'panel2', 'info text, neutral series'],
];

const surfaceOf = (ids) => SCREENS.filter((s) => ids.includes(s.id));
const SELLER = ['dashboard', 'products', 'product', 'product-new', 'product-media', 'inventory', 'promotions', 'orders', 'order', 'fulfil', 'refunds', 'payouts', 'store-settings', 'members', 'operations'];
const BUYER = ['shop-home', 'storefront', 'shop-category', 'shop-search', 'shop-seller', 'shop-product', 'shop-product-reviews', 'storefront-mobile', 'shop-cart', 'checkout', 'shop-confirmation', 'my-orders', 'shop-order', 'account-profile', 'account-addresses', 'account-payments', 'account-wishlist'];
const lines = (arr) => arr.map((s) => '`' + s.id + '` ' + s.title).join(' · ');

P('# MarketCore — design system',
  '',
  '**Direction: Quartz.** Generated by `generators/gen-ui.mjs` — the same source as',
  '`design-board.html` and `tokens.json`. Rerun the generator; do not hand-edit this file.',
  '',
  'This is the contract for anything that generates or reviews MarketCore UI: a design',
  'tool, a Figma library, a coding agent. Follow it — or state plainly what you are',
  'overriding and why.',
  '',
  '---',
  '',
  '## 1. Two surfaces, one system',
  '',
  '| Surface | Chrome | Whose screen it is |',
  '| --- | --- | --- |',
  '| **Seller console** | 252px dark rail + 64px breadcrumb bar with ⌘K search | A member of an organization |',
  '| **Buyer storefront** | 64px public bar + 44px category bar, **no rail** | A person buying; belongs to no tenant |',
  '',
  'The rail names the organization and its catalogue. A buyer has no tenant, so rendering it',
  'would assert a membership that does not exist. **Never put the rail on a buyer screen**, and',
  'never send `x-organization-id` from one. Same tokens and components on both — the rail is',
  'the only structural difference, because it is the only thing a tenant has and a buyer does not.',
  '',
  'The console screens: ' + lines(surfaceOf(SELLER)) + '.',
  '',
  'The storefront, account and auth screens: ' + lines(surfaceOf(BUYER)) + ' · `signin` Sign in · `register` Register · `onboarding` First run.',
  '',
  '---',
  '',
  '## 2. Colour',
  '',
  'A component names a **role** (`var(--accent)`), never a hue. Re-pointing the role is what',
  'makes Graphite the same system, dark — not a second stylesheet.',
  '');

for (const skin of SKINS) {
  P('### ' + skin.name + ' — ' + skin.kind, '',
    '| token | value | role |', '| --- | --- | --- |');
  for (const [k, role] of Object.entries(ROLES)) {
    if (skin.v[k] == null) continue;
    P('| `--' + k + '` | `' + skin.v[k] + '` | ' + role + ' |');
  }
  P('');
}

P('### The contrast contract',
  '',
  'Every text pair measured against the ground it actually sits on. Alpha tints are',
  'composited over `--panel` first — measuring a translucent tint as if it were opaque is',
  'how a dark theme passes on paper and fails on screen.',
  '',
  '| pair | ' + SKINS.map((s) => s.name).join(' | ') + ' |',
  '| --- | ' + SKINS.map(() => '---').join(' | ') + ' |');
let worst = Infinity;
for (const [fg, bg, label] of PAIRS) {
  const cells = SKINS.map((s) => {
    const r = contrast(resolve(s.v, fg), resolve(s.v, bg));
    worst = Math.min(worst, r);
    return r.toFixed(2) + ':1' + (r < 4.5 ? ' **FAIL**' : '');
  });
  P('| ' + label + ' (`--' + fg + '` on `--' + bg + '`) | ' + cells.join(' | ') + ' |');
}
P('',
  'Rules:',
  '',
  '- Text is **at least 4.5:1** on whatever it sits on, in both themes. Worst pair today: ' + worst.toFixed(2) + ':1.',
  '- Control boundaries (inputs, secondary buttons, checkboxes) are **at least 3:1** (`--controlEdge`).',
  '- **Never colour alone.** A status is a dot *and* a word; a series is a colour *and* a legend.',
  '- `--faint` is for uppercase labels only — never a full sentence of body copy.',
  '',
  '---',
  '',
  '## 3. Type',
  '',
  'DM Sans for everything. DM Mono for numbers, money, SKUs, ids and request ids — anywhere a',
  'column of digits has to line up.',
  '',
  '| step | size | use |',
  '| --- | --- | --- |',
  '| label | ' + tokens.typography.size.label.value + ' | uppercase field labels, table headers, badges, overlines |',
  '| small | 13px | helper text, timestamps, secondary metadata, footnotes |',
  '| body | ' + tokens.typography.size.body.value + ' | table cells, paragraphs, controls, nav |',
  '| title | ' + tokens.typography.size.title.value + ' | page title |',
  '| metric | ' + tokens.typography.size.metric.value + ' | a KPI value |',
  '| display | ' + tokens.typography.size.display.value + ' | hero, or the one number a screen is about |',
  '',
  '**12px is the floor.** Nothing renders below it — not badges, not captions, not chart axes.',
  'Line-height 1.5 for prose, 1 for buttons, chips and pills. Letter-spacing is negative',
  '(-.025em) only on titles of 25px and up.',
  '',
  '---',
  '',
  '## 4. Layout',
  '',
  '- **Radius.** Cards 12px, controls 8px, pills and badges 999px.',
  '- **Edge.** 1px `--line`; cards sit on `--canvas` with a soft two-stop shadow (Graphite: none).',
  '- **Spacing.** 4 / 6 / 10 / 14 / 16 / 22 / 26. Page padding 20px, card padding 14–16px.',
  '- **Density.** Tables are the dense surface: 12px cell padding, uppercase 12px headers on',
  '  `--panel2`, numerals right-aligned, rows hover to `--panel2`. Everything else is airy.',
  '- **Buyer grid.** 4 product columns at 1440px; 2 inside the 392px phone frame.',
  '- **Focus order** follows reading order. A page has exactly one `h1`.',
  '',
  '---',
  '',
  '## 5. Components',
  '',
  '| Component | Rule |',
  '| --- | --- |',
  '| Primary button | One per screen region. `--accent` fill, `--accentInk` label, 9px radius. |',
  '| Secondary button | `--panel` fill, `--controlEdge` border. Never a second accent button beside the first. |',
  '| Quiet button | Text only, for row actions (Edit, Open, Manage). |',
  '| Status pill | A 6px dot + a word, tinted background. Tones: ok, warn, bad, neutral. |',
  '| Delta chip | An arrow + a signed percentage, tinted. Up is not always good — pair it with the label. |',
  '| Share bar | A 6px track with the value drawn as length. Always adjacent to the number it encodes. |',
  '| Sparkline | Shape only, no axes. It sits beside a figure, never instead of one. |',
  '| KPI card | Label, value, delta, sparkline. Four across at 1440px. |',
  '| Table | Header, rows, optional `tfoot` for a total or a footnote. Numerals in DM Mono. |',
  '| Form field | Visible label above the control. Required marked `*`; optional written out. Help text',
  '  below in `--faint`. Errors are inline, next to the field, and repeat in a focusable summary. |',
  '| Chip | A filter. Selected is `--accent` fill, never a border-only change. |',
  '| Empty state | An emblem, a plain sentence, and the first action that fills it. Never a bare table. |',
  '',
  '---',
  '',
  '## 6. Accessibility contract',
  '',
  '- **Focus.** A 3px `--accent` outline at 2px offset, on `:focus-visible` only. Never removed.',
  '  Compound controls (search, quantity stepper) ring the group with `:focus-within`.',
  '- **Names.** Every control carries its own accessible name. Icon-only buttons use `aria-label`.',
  '- **Icons.** Decorative glyphs are `aria-hidden="true" focusable="false"` — an unlabelled glyph',
  '  read aloud is noise, not information.',
  '- **Targets.** 36px minimum; 44px on the touch surface.',
  '- **Motion.** `prefers-reduced-motion: reduce` disables every transition and animation.',
  '- **Contrast.** See §2. It is a contract, not an aspiration.',
  '',
  '---',
  '',
  '## 7. Anti-patterns',
  '',
  '- **Bare element selectors.** `nav { flex-direction: column }` was written for the seller',
  '  rail and silently collapsed every `<nav class="catbar">` on 16 buyer screens — `.catbar`',
  '  set `display: flex` but never `flex-direction`, so the generic rule still won. Scope the',
  '  selector (`.rail nav`) or set every property the element needs.',
  '- **Type below 12px.** It reads as a wireframe. 30% of this board was under 12px before the',
  '  fix, which is most of why it looked unfinished.',
  '- **Emoji as icons.** Use SVG.',
  '- **Colour alone** as the only signal for state.',
  '- **Placeholder as the only label.**',
  '- **Lying for polish.** If the domain cannot do it, the screen says so. Every surface here',
  '  that describes something unbuilt says that out loud rather than mocking the happy path.',
  '',
  '---',
  '',
  '## 8. Honest gaps',
  '',
  'These are designed but not backed by the domain. A screen that implies otherwise is a bug:',
  '',
  'images · cart · saved-for-later · addresses · saved payment methods · shipping zones and',
  'rates · categories · promotions and discount codes · wishlist · reviews · variants and',
  'variant-level inventory · shipments, carriers and tracking · email of any kind',
  '(invitations, receipts, dispatch notices) · guest checkout · buyer-initiated returns ·',
  'two-factor authentication.',
  '',
  'The app today is single-item checkout against one organization. Everything above is target',
  'state, and the board labels it as such on the screen where it appears.',
  '',
  '---',
  '',
  '## 9. Every screen',
  '',
  SCREENS.length + ' screens × ' + SKINS.length + ' themes, all in `design-board.html`:',
  '');
SCREENS.forEach((s) => P('- `' + s.id + '` — ' + s.title + ' · ' + s.note));
P('');

fs.writeFileSync(path.join(OUT, 'DESIGN.md'), md.join('\n') + '\n');
if (worst < 4.5) console.warn('WARNING: a text pair is below 4.5:1 — see DESIGN.md, section 2.');

/* ========================================================= STITCH-PROMPTS.md */
/*
 * DESIGN.md carries the rules; it does not carry the scope. Stitch generates a bounded
 * number of screens per prompt, so asking it to "build MarketCore" from a rules file
 * returns a handful of invented screens — which is exactly what happened.
 *
 * These are buildable per-screen prompts, grouped into batches of five or fewer so one
 * batch is one generation. Each prompt is written to survive being read alone: it names
 * the surface, the chrome, the sections in order and the real copy.
 */
const SURFACE = {
  auth: 'Seller console, auth — full-page, centred card on the app canvas. No rail, no top bar.',
  console: 'Seller console — 252px dark rail on the left, 64px breadcrumb top bar. A tenant screen.',
  shop: 'Buyer storefront — 64px public bar plus a 44px horizontal category bar. No rail, no organization name anywhere: a buyer belongs to no tenant.',
  acct: 'Buyer account — the storefront chrome plus a 246px left account nav. No rail, no organization name.',
  doc: 'Reference sheet — a plain documentation page on the app canvas. No rail, no top bar.',
};

const SPECS = {
  signin: `Sign in. Centred 392px card: MarketCore logo mark and wordmark, heading "Sign in", sub-line "Use your organization account to continue." A labelled Email field prefilled owner@marketcore.test; a labelled Password field. Then an inline error banner reading "That email and password don't match an account." A full-width primary "Sign in" button, and "No account? Create one" beneath it. This is the error state — show it, do not show the happy path.`,
  register: `Create account. Same centred card. Heading "Create your account", sub-line "12 characters or more — a policy, not a suggestion." Labelled Email field (placeholder you@company.test) and a Password field whose helper text reads "12+ code points · shown as a hint, linked by aria-describedby". Full-width "Create account" button. Footer "Already have one? Sign in".`,
  onboarding: `First run — "You're not in an organization yet". A single centred card shown INSTEAD of the console shell, never inside it: without a tenant every control in the shell would be inert. Heading "You're not in an organization yet"; body copy explaining that MarketCore keeps products, orders and money inside an organization and that creating one makes you its owner. Exactly one field: Organization name, placeholder Nile Traders. One full-width "Create organization" button. Footer "Wrong account? Sign out".`,
  'shop-home': `Buyer storefront home. Public bar: MarketCore wordmark, a "Search products and sellers…" field with a ⌘K hint, wishlist and cart icons each with a count badge, a "Start selling" link and a "Sign in" button. Below it the horizontal category bar: All (selected) · Textiles · Home · Food · Beauty · Deals · then Sell on MarketCore · Help pushed to the right. Page: a hero card headed "Everything from every seller, one checkout" with the line "Two sellers today. Browse by category, filter by what matters, and buy without leaving the page." and three chips — Free delivery over E£500 (selected), 14-day returns, Verified sellers. Then four category cards: Textiles 142 products, Home 88, Food 64, Beauty 31. Then a results bar "Featured this week · curated, not newest" with "Sort: Recommended". Then a four-column grid of product cards: Nile Cotton Shirt E£249.00 (Nile Traders, 4.6, 128), Delta Olive Oil E£189.00, Ramie Table Runner E£180.00, Giza Sheet Set E£1,250.00 — each with seller name, name, star rating, price and an "in stock" pill.`,
  storefront: `Buyer browse — all published products. Storefront chrome. A hero card headed "Find something worth buying" with the line "Every published product from every seller. Two are the real seed rows; the rest are examples, because the catalog is thin today." and filter chips: All (selected), In stock, Under E£200, Nile Traders, Delta Goods. Results bar "4 products · from 2 sellers · Sort: Recommended". A four-column grid of the same four product cards, each labelled with its seller and whether it is a real seed row. A footer line noting the filters are only the ones the domain can support — price, availability, seller — and that drafts answer 404.`,
  'shop-category': `Buyer category page — "Textiles / Shirts & linen". Storefront chrome, then a breadcrumb. Two columns: a 230px filter panel and the results. The filter panel has five groups: Category (checkboxes: Shirts ✓, Bedding, Table linen ✓, Towels), Price (three rows with counts: Under E£200 · 3, E£200–E£1,000 · 4, Over E£1,000 · 1), Seller (Nile Traders ✓, Delta Goods), Availability (In stock ✓, Include out of stock), Rating (4★ and up ✓, 3★ and up). Results: a bar reading "8 results · in Shirts & linen · Sort: Recommended", then a grid of eight product cards with seller, name, stars, price and a stock pill (in stock / low / out), then pagination ‹ 1 2 3 ›.`,
  'shop-search': `Buyer search. Storefront chrome, then a large 50px search field containing "cotton" with a Clear affordance. Below it an autocomplete panel of grouped rows with a small icon on each: a "Suggestions" group header, then "cotton shirt — 12 results" and "cotton towels — 4 results"; a "Sellers" group header, then "Nile Traders — 2 products" and "Delta Goods — 1 product"; a "Recent" group header, then "olive oil — 2 days ago". Group headers are small uppercase labels on an inset background.`,
  'shop-seller': `Buyer seller store — "Nile Traders", the public route /s/nile-traders. Storefront chrome. A store hero: a 64px rounded logo tile reading NT; the store name; a 4.6 star rating with 128 reviews; a chip "Replies in under 2 hours"; and a description "Long-staple Egyptian cotton, made in Cairo. On MarketCore since Sep 2026." Right-aligned stats: 4 Products, 177 Sold, 14d Returns. Then filter chips: All products (selected), Best selling, New in, On sale. A results bar "4 products · sorted by best selling". Then a grid of the seller's four product cards.`,
  'shop-product': `Buyer product detail — "Nile Cotton Shirt" by Nile Traders. Storefront chrome, then a breadcrumb Browse / Textiles / Shirts / Nile Cotton Shirt. Two columns. Left, a gallery: a large image tile showing a monogram with a "Click to zoom" tag, four thumbnails beneath it (Main selected, In scale, Fabric, On model), and a caption. Right, the buy box: the seller name as an overline, the product title, a 4.6 rating with 128 reviews and a "42 sold" chip, the price E£249.00 in monospace, a description, then a Colour group with three round swatches — Ecru selected, Indigo, Olive struck through — and a Size group with buttons S / M (selected) / L / XL struck through plus a "Size guide" link. Then Availability "In stock · 8 left" and Delivery "Arrives Tue 14 – Thu 16 Oct" as label/value rows. Then a quantity stepper flanked by a large "Add to cart" button and a wishlist icon button. Below the fold: a Specifications table (Material, Fit, Colour, Care, SKU, Returns) and a "Buy with confidence" card (Sold by, Seller rating, Returns, Dispatch, Replies in).`,
  'shop-product-reviews': `Buyer product reviews for Nile Cotton Shirt. Storefront chrome, then a breadcrumb Nile Cotton Shirt / Reviews. Two columns. Left: a "Ratings & reviews" card with a very large 4.6, stars, "128 verified reviews", and a 5★→1★ breakdown as five rows of percentage bars (78%, 14%, 5%, 2%, 1%). Then a "Most recent" card with filter chips (All selected, With photos, 5★) containing three reviews, each with an avatar, name, star rating, date, an optional "Verified purchase" badge and the review text. Right: a "You may also like" cross-sell card with three product cards in a two-column grid, and a "Why reviews matter" card of explanatory copy.`,
  'storefront-mobile': `The buyer storefront on a phone — this surface is mobile-first, over 70% of marketplace transactions. Draw a 392×812 phone frame. Inside: a compact top bar with the logo mark, a "Search products…" field and a cart icon with a count badge. A horizontally scrolling row of filter chips: In stock (selected), Under E£200, Nile Traders. A results bar "4 products · 2 sellers". Then a two-column grid of four compact product cards with name, seller, price and a stock pill.`,
  'shop-cart': `Buyer cart. Storefront chrome. Page head "Your cart" with "2 items from 2 sellers" and a "Continue shopping" link. Two columns. Left: an "Items" card whose header carries a "Save for later" action, containing two cart rows — each a 64px thumbnail, the product name, a variant line ("Nile Traders · Ecru / M"), a quantity stepper, a right-aligned line total in monospace, and a remove icon button. Rows: Nile Cotton Shirt × 1 E£249.00, Delta Olive Oil × 2 E£378.00. Right: a Summary card with Subtotal E£627.00, Delivery "Free over E£500", Total E£627.00, a full-width "Checkout" button, and an optional Promo code field. Below it a card noting that a cart is a proposed addition — the domain currently has none.`,
  checkout: `Buyer checkout, step 2 of 3. Storefront chrome. Page head "Checkout" with "Signed in as Mariam Buyer · belongs to no organization" and a "step 2 of 3" pill. A three-step progress row: Cart ✓ → Details ✓ → Payment. Two columns. Left: a "Your order" table (one line item, total footer E£249.00); then a "Delivery details" card whose header says required fields are marked and the rest named as optional, containing labelled fields Full name *, Email *, Address * (empty, with the helper "Not in the domain yet — a checkout with no address is not a checkout.") and Phone (optional — used only for delivery updates). Right: a Summary card (Subtotal, Delivery Free, Total) with a full-width "Place order" button, and a note explaining the 10% platform fee is taken from the seller's proceeds so the buyer pays the listed price — a fee line here would be a lie. Below it a card headed "Not built yet — be honest about it" covering payment and the deliberate absence of guest checkout.`,
  'shop-confirmation': `Buyer order confirmation. Storefront chrome. A centred confirmation card: a green circular tick, "Order placed", "Order #1042 is confirmed. Payment is still pending, and the seller has been notified.", three chips (Order #1042, Nile Cotton Shirt · E£249.00, Nile Traders), and two buttons — "Track this order" and "Continue shopping". Below it two columns: a "What happens next" card with a four-entry vertical timeline (Order confirmed / Payment pending / Dispatch / Delivery), and a "Confirmation email" card stating plainly that nothing sends email yet, then a Receipt row "#1042.pdf".`,
  'my-orders': `Buyer "My orders" — orders where you are the buyer, across every seller. Storefront chrome. Page head "My orders" with "Orders where you are the buyer — across every seller." One table: Order, Item (with the seller beneath), Status pill, Placed, Total (right-aligned, monospace), and an "Open" button per row. Two rows: #1042 / Nile Cotton Shirt / pending / 10 Oct 2026 / E£249.00; #1031 / Delta Olive Oil / completed / 28 Sep 2026 / E£189.00. A table footer noting the scope is buyerId = you, never a tenant.`,
  'shop-order': `Buyer order detail #1042. Storefront chrome, then a breadcrumb My orders / #1042. Page head "Order #1042" with "Placed 10 Oct 2026 · Nile Traders", a "pending payment" pill and an Invoice button. A four-step progress row: Placed ✓ → Paid → Shipped → Delivered. Two columns. Left: an Items table (one line, total E£249.00); a Tracking card whose header says nothing can be tracked until the order is paid and dispatched, containing an empty state with an emblem and "No shipment yet". Right: a "Delivering to" card with Name, Address and Email rows; and a "Need help?" card with "Contact seller" and "Request a return" buttons plus a note that a return needs a paid order first.`,
  'account-profile': `Buyer account — Profile & security. Storefront chrome plus a 246px left account nav headed by an avatar, "Mariam Buyer" and mariam@shopper.test, listing Profile & security (selected), Addresses, Payment methods, Orders, Wishlist, My reviews, Returns, Sign out. Main column head: "Profile & security" with "Your personal account — separate from any organization you belong to." Two columns. Left: a "Personal details" card with a two-up First name * / Last name *, then Email * with the helper that changing it needs a verification email that does not exist yet, an optional Phone, and a Save changes button; then a "Password" card with Current password *, New password * and an "Update password" button with the note "signs out other sessions". Right: a "Security" card (Two-factor authentication — an "off" pill, Active sessions 2, This device Chrome · Cairo, and "Sign out everywhere"); a "Notifications" card with four checkboxes (Order updates ✓, Back-in-stock alerts ✓, Price drops on wishlist, Seller marketing); and a card explaining why "mine" and "the organization's" are kept apart.`,
  'account-addresses': `Buyer account — Addresses. Storefront chrome plus the account nav with Addresses selected. Head "Addresses" with "Where your orders go." and a "New address" button. Left column: two address cards — Home (with a default pill, showing Name, Address "12 Corniche El Nil, Cairo, 11511", Phone) and Work (4 Tahrir Square, Cairo) — each with an Edit action. Right column: a "New address" form (Label optional, Street *, a two-up City * and Postal code * in monospace, a "Make this my default address" checkbox, and a full-width "Save address" button), then a card noting there is no address in the domain yet.`,
  'account-payments': `Buyer account — Payment methods. Storefront chrome plus the account nav with Payment methods selected. Head "Payment methods" with "Used at checkout. Card numbers never touch this app." and an "Add card" button. Left: a "Saved cards" card with a default pill, containing two rows — a small card-icon tile, "Visa ending 4242" with "Expires 09 / 2028" and a Default label; and "Mastercard ending 5100" with "Expires 03 / 2027" and a Backup label — each with Edit and a remove button. Right: an "Add a card" form (Card number *, a two-up Expiry * / CVC *, a "Use as my default card" checkbox, full-width "Save card"), then a card noting the app stores a provider token, never a card number, and that the provider adapter is a later phase.`,
  'account-wishlist': `Buyer account — Wishlist. Storefront chrome plus the account nav with Wishlist selected. Head "Wishlist" with "3 saved products across 1 seller." A four-column grid of three product cards (Giza Sheet Set E£1,250.00, Ramie Table Runner E£180.00, Fayoum Wool Throw E£460.00), each carrying an "Add to cart" button and a remove icon. A line beneath noting that saved products are a proposed addition, and that back-in-stock and price-drop alerts are why wishlists earn their keep.`,
  dashboard: `Seller console — the Overview dashboard. The dark 252px rail: a logo tile with "Nile Traders" and "MarketCore" beneath it; a ⌘K search field; grouped navigation — a "Overview" group (Dashboard selected, Reports), "Catalog" (Products with a count of 4, Inventory, Promotions), "Money" (Orders with a count of 128, Refunds, Payouts), "Admin" (Members, Store settings, Operations with a warning count of 3); and a user chip pinned to the bottom with an Owner role. The 64px top bar: a "Dashboard / Overview" breadcrumb, a wide search field with a ⌘K hint, a notifications bell with an unread badge, and a user chip. Page head "Overview" with "Revenue, orders and stock health for Nile Traders.", a 7d/30d/90d/1Y segmented control and an Export button. A row of four KPI cards, each with a label, a delta chip and a sparkline: Revenue · 30d E£48,290.00 (+14.2%), Orders 128 (+8.1%), Avg order value E£377.00 (+5.4%), Low stock 2 (a down chip reading "1 out of stock"). Then two columns: a Revenue card with a grouped bar chart by week, a legend for this quarter vs last, and axis labels in monospace; and a "Revenue by plan" card with a donut showing 56% and a legend list (Cotton 56%, Olive oil 28%, Other 16%). Then two more columns: a Recent orders table (Order, Buyer with avatar, Total, Payment pill, Fulfilment pill, Progress share bar) and a "Top products" list with share bars.`,
  products: `Seller console — the Products list. Rail with Products selected, breadcrumb Catalog / Products. Page head "Products" with "4 products · Nile Traders", an inline search field, a Filter button and a "New product" primary button. Four KPI cards: Published 2, Draft 1, Out of stock 1 (needing attention), Inventory value E£12,450.00 with a sparkline. One wide table: Product (a status dot, the name, the SKU beneath in monospace), Status pill (published / draft), Price, Available (a share bar with the number beside it), Sales · 30d (a sparkline column), Trend (a delta chip or a dash), and an Edit action per row. Four rows: Nile Cotton Shirt, Giza Sheet Set, Ramie Table Runner, Delta Olive Oil. A table footer noting inventory is enforced by a database CHECK.`,
  product: `Seller console — product detail for "Nile Cotton Shirt". Rail with Products selected, breadcrumb Catalog / Products / Nile Cotton Shirt. Page head with a "published" pill, a Duplicate button and a "Save changes" primary button. Two columns. Left: a Details card with labelled fields Name, a two-up Price (monospace, helper "EGP · minor units 24900") and Currency (helper "carried on the aggregate"), and Slug (monospace, helper "unique per organization"); then a "Sales · 30 days" card with a bar chart, delta chip +18.4%. Right: an Inventory card with a very large "10 available", a share bar, and Reserved / Version / Constraint rows; then a "Publish rule" card explaining DRAFT → PUBLISHED needs a price of at least 1 minor unit.`,
  'product-new': `Seller console — create a product. Rail with Products selected, breadcrumb Catalog / Products / New. Page head "New product" with "Saved as a draft. Publishing is a separate, guarded step.", plus Preview, Save draft and a Publish primary button. Two columns. Left: a Details form — Name *, Description (optional), a two-up Price * (monospace, helper "EGP · minor units 24900") and Currency select, and Opening stock * with the helper that a product with no inventory row cannot be sold. Right: an Image card holding a dashed dropzone labelled "drop an image" — the card header states an image is required to publish because a marketplace card leads with the photo; then a Publish rule card.`,
  'product-media': `Seller console — media and variants. Rail with Products selected, breadcrumb Catalog / Products / Nile Cotton Shirt / Media & variants. Page head "Media & variants" with "Images and options — the two things a buyer looks at before the price.", plus Preview and Save. Two columns. Left: an Images card headed "4 of 8 · drag to reorder, first is the card image" with an Add action, holding a four-column grid of square tiles — each showing a monogram, a caption tag (the first reads "Card image"), and a remove button — plus an "add" dropzone as the fifth cell. Then an Options card with a Colour group of three swatches and a Size group of S / M / L / XL buttons. Right: a Variants table — six rows of Variant, Price, Stock, SKU, State pill and Edit — with a footer noting variant-level inventory is a new model, because today one product has one stock row.`,
  inventory: `Seller console — Inventory. Rail with Inventory selected, breadcrumb Catalog / Inventory. Page head "Inventory" with "Available, reserved and version — the CHECK constraint is the guard.", plus Export and an "Adjust stock" primary button. Four KPI cards: In stock 3, Low stock 1 (needing attention), Out of stock 1 (cannot sell), Inventory value E£12,450.00 with a sparkline. A "Stock on hand" table: Product (dot + name + SKU), Available, Reserved, Version (all monospace and right-aligned), a State pill, and an Adjust action. Rows: Nile Cotton Shirt 10/2/12 in stock, Giza Sheet Set 0/0/3 out, Ramie Table Runner 3/0/8 low. A footer noting available ≥ 0 is enforced in the database and adjustments append to a movement log. Below it a "Recent movements" card with a three-entry timeline.`,
  promotions: `Seller console — Promotions. Rail with Promotions selected, breadcrumb Catalog / Promotions. Page head "Promotions" with "Discounts a buyer can apply at cart or checkout." and a "New promotion" primary button. Two columns. Left: a table — Code (monospace, bold), Value, Applies to, Status pill, Window, and Edit. Three rows: WELCOME10 / 10% off / All products / active / ends 31 Oct; COTTON20 / 20% off / Textiles / scheduled / starts 1 Nov; FREESHIP / Free delivery / Orders over E£500 / expired / ended 30 Sep. A footer noting discounts are a proposed addition. Right: a "Create a promotion" form — Code *, a two-up Type select and Value *, an Applies to select, and a full-width "Create promotion" button.`,
  orders: `Seller console — the Orders list. Rail with Orders selected, breadcrumb Money / Orders. Page head "Orders" with "4 orders · 1 needs attention", an All/Paid/Pending segmented control and an Export button. One table: Buyer (an avatar with the name and the order id beneath), Payment pill, Fulfilment pill, Total (right-aligned monospace), Fee, and an "Open" action. Four rows — #1042 Mariam Buyer paid/fulfilling, #1041 Sara Ahmed paid/completed, #1040 Khaled Hassan processing/pending, #1039 Nour Said refunded/cancelled. A table footer noting totals are immutable after creation and corrections are compensating ledger entries.`,
  order: `Seller console — order detail #1042. Rail with Orders selected, breadcrumb Money / Orders / #1042. Page head "Order #1042" with "Placed 2 minutes ago · Nile Traders" and a "paid" pill. A four-step flow row: Pending payment → Paid ✓ → Fulfilling → Completed. Two columns. Left: an Items table (one line, total E£249.00); a Ledger table headed "Signed entries sum to zero, per currency" with Account / Debit / Credit columns, three rows (Platform cash, Seller payable, Platform revenue), a "Signed sum 0.00" footer and a "balanced" pill in the card header. Right: a Payment card (Status succeeded, Attempts 1, Provider ref pi_3Qk…9d2, Captured E£249.00); a Timeline card with three entries (Payment captured / Order created / Checkout, each with a relative time and a one-line detail); and an Actions card with Refund order and Cancel.`,
  fulfil: `Seller console — fulfilling order #1042. Rail with Orders selected, breadcrumb Money / Orders / #1042 / Fulfil. Page head "Fulfil #1042" with "Paid · 1 item · ships to Cairo.", a Packing slip button and a "Mark as shipped" primary button. Two columns. Left: a "Pack these items" table (Item, Qty, and a Packed checkbox per line) with a footer saying marking every line packed is what allows "shipped"; then a Shipment form with a two-up Carrier select and Tracking number (monospace), and a note that a typed tracking number is not verified with the carrier. Right: a "Deliver to" card (Buyer, Address, Phone); and a card noting fulfilment is a proposed addition because no shipment, carrier or tracking model exists yet.`,
  refunds: `Seller console — Refunds. Rail with Refunds selected, breadcrumb Money / Refunds. Page head "Refunds" with "INV-5 — a refund never exceeds what was captured" and a "New refund" primary button. Two columns. Left: a Refunds table (Refund monospace, Order monospace, Amount, Status pill, Settled share bar) with three rows: RF-0042 / #1039 / E£249.00 / succeeded; RF-0041 / #1036 / E£90.00 / failed; RF-0040 / #1032 / E£50.00 / processing. Right: a "Request a refund" form (Order, Amount with the helper "captured: 249.00 EGP", a warning banner that a refund above the captured total is refused before the provider is called, and a full-width "Request refund" button); then a "Ledger effect" card explaining a refund posts a reversing transaction and never edits the original capture.`,
  payouts: `Seller console — Payouts. Rail with Payouts selected, breadcrumb Money / Payouts. Page head "Payouts" with "INV-8 — a payout is executed at most once" and a "Request payout" primary button. Four KPI cards: Available E£6,150.00 (withdrawable now), Pending settlement E£1,824.00 (clears in 2 days), Paid out · all time E£34,870.00 with a sparkline, Failed payouts 1 (needs a retry). A "Payout history" table — Payout, Amount, Status pill, Provider ref, Requested — with three rows: PO-0031 E£2,241.00 paid; PO-0032 E£6,150.00 processing; PO-0030 E£980.00 failed. A footer explaining that two workers may race one payout and the state predicate, not the worker, is the guard.`,
  'store-settings': `Seller console — Store settings for Nile Traders. Rail with Store settings selected, breadcrumb Admin / Store settings. Page head "Store settings" with "Nile Traders — the public face buyers see.", a "View public store" button and a "Save changes" primary button. Two columns. Left: a "Store profile" form (Store name *, Public slug * in monospace with the helper that a buyer reaches you at /s/nile-traders, About optional, and a Response time select); then a Policies card (Returns window select, Dispatch promise). Right: a Shipping zones table (Zone, Rate & time, State pill, Edit) with rows Cairo & Giza E£40 · 1–2 days active, Rest of Egypt E£75 · 3–5 days active, International Not offered off; then a Payout details card (Bank, Schedule, Currency).`,
  members: `Seller console — Members. Rail with Members selected, breadcrumb Admin / Members. Page head "Members" with "Nile Traders · 2 members" and an "Add member" primary button. Two columns. Left: a Members table — Member (avatar, email, role beneath), Role pill, Status pill, Joined, Manage — with two rows: owner@marketcore.test owner active Sep 19, member@marketcore.test member active Sep 20. A footer noting the last owner cannot be removed. Right: an "Add a member" form (Email, a Role select, a full-width "Add to organization" button, and a note that nothing sends email yet); then a "Tenant isolation" card explaining the organization travels as x-organization-id, a cross-tenant read answers 404 and a header naming someone else's tenant answers 403.`,
  operations: `Seller console — Operations. Rail with Operations selected, breadcrumb Admin / Operations. Page head "Operations" with "Trace and recover failed work", a 24h/7d/30d segmented control and an "Export log" button. Four KPI cards: Events today 1,204 (+3.1%, sparkline), Duplicates suppressed 86 (idempotent no-ops), Job failures 3 (retrying, a down chip), Avg retry delay 4.2s (-0.6s). Then two tables side by side. "Webhook events", headed "Deduplicated by (provider, eventId)", with columns Event id, Type, Applied, Request id and a Filter action: two rows of the same payment_intent.succeeded event id — one "once", one "no-op" — and a charge.refunded row that is retrying. "Outbox jobs", headed "At-least-once, idempotent", with columns Job, Attempts, Status, Duration: publish.order.paid processed, publish.refund.succeeded retrying, publish.payout.paid queued.`,
  foundations: `Reference sheet — "Foundations — Quartz". A documentation page, no app chrome. An intro paragraph explaining the four layers: palette → semantic → components → screens, and that a component names a role, never a hue. Then four swatch groups, each a row of cards showing a colour block, the token name, its role in words and its hex value: Surface (canvas, panel, panel2, rail); Text (ink, muted, faint, accent); Edge (line, lineStrong, controlEdge — the last annotated "control boundary · 3:1"); State (ok, bad, warn, info). Then a Type row showing the real specimens side by side: a display specimen, a title, body text, an uppercase label and a monospace price. Then a Components row: three button weights, a text field, four status pills and both delta chips. Then a Data motifs row showing share bars at three values, a sparkline, and the status pills again with the note that a pill is a dot and a word, never colour alone.`,
  states: `Reference sheet — "States": the shapes a screen takes before and instead of data. A three-column grid of cards, each with a title and a one-line rationale. Loading — skeleton bars, never a spinner that hides the layout. Empty — an emblem, "No products yet" and a "New product" action. Error — one envelope: a banner with "Query failed" and a monospace request id, plus a note that every failure carries a code, a message and the request id. Form validation — a focusable error summary at the top of the form linking to the field, an invalid email field outlined in red, and an inline error message beneath it. Not found — a 404 emblem and a note that a product from another organization answers 404, never 403. Zero results — a warning banner "No products match "linen shirt"" with recovery chips. Nothing published yet — an honest empty catalogue with a "Start selling" action. Buyer — no orders — a new buyer's very first screen. Order — pending payment — the honest dead end until payment ships.`,
};

const BATCHES = [
  ['auth: the three screens a user meets before the app', ['signin', 'register', 'onboarding']],
  ['buyer discovery: find something to buy', ['shop-home', 'storefront', 'shop-category', 'shop-search', 'shop-seller']],
  ['buyer product: decide on one item', ['shop-product', 'shop-product-reviews', 'storefront-mobile']],
  ['buyer cart and checkout: pay for it', ['shop-cart', 'checkout', 'shop-confirmation']],
  ['buyer orders: what happened after paying', ['my-orders', 'shop-order']],
  ['buyer account: personal, apart from any organization', ['account-profile', 'account-addresses', 'account-payments', 'account-wishlist']],
  ['console: the overview and the catalog', ['dashboard', 'products', 'product', 'product-new']],
  ['console: media, stock and discounts', ['product-media', 'inventory', 'promotions']],
  ['console: money in and money out', ['orders', 'order', 'fulfil', 'refunds', 'payouts']],
  ['console: admin and operations', ['store-settings', 'members', 'operations']],
  ['reference: the system itself', ['foundations', 'states']],
];

const s = [];
const S = (...lines) => lines.forEach((l) => s.push(l));
S('# Stitch prompts — MarketCore',
  '',
  '**Import `DESIGN.md` into the project first.** It carries the rules — tokens, type, contrast,',
  'components. These prompts carry the scope. Without the rules file Stitch will invent a look;',
  'without these prompts it will invent the screens, and stop after a handful.',
  '',
  '## How to use this',
  '',
  'Stitch generates a bounded number of screens per prompt — around five. So this is',
  BATCHES.length + ' generations, not one, grouped by flow so each batch is a set of screens that',
  'link to one another. Keep one Stitch project and paste one batch at a time; the later batches',
  'will inherit the tokens and components from the first.',
  '',
  'Every prompt names its surface and its chrome, because the chrome is the difference that',
  'matters: **a buyer screen never has the rail.** A buyer belongs to no organization, so a rail',
  'would assert a membership that does not exist — and the checkout carries no',
  '`x-organization-id`.',
  '',
  'Surfaces, for reference:',
  '',
  ...Object.entries(SURFACE).map(([k, v]) => '- **' + k + '** — ' + v),
  '',
  '---',
  '');

BATCHES.forEach(([title, ids], bi) => {
  S('## Batch ' + (bi + 1) + ' of ' + BATCHES.length + ' — ' + title, '',
    '`' + ids.join('` · `') + '`', '',
    ids.length + ' screens in one generation.', '');
  ids.forEach((id) => {
    const sc = SCREENS.find((x) => x.id === id);
    S('### `' + id + '` — ' + sc.title, '',
      '**Surface:** ' + SURFACE[sc.doc ? 'doc' : (['signin', 'register', 'onboarding'].includes(id) ? 'auth' : (id.startsWith('account-') ? 'acct' : (id.startsWith('shop') || id === 'storefront' || id === 'storefront-mobile' || id === 'checkout' || id === 'my-orders' ? 'shop' : 'console')))] , '',
      '**Prompt:**', '', '> ' + SPECS[id].replace(/\n/g, ' '), '');
  });
  S('---', '');
});

S('## After each batch', '',
  'Paste the result back into the review chat. Check, in order:', '',
  '1. **Is the chrome right?** No rail on a buyer screen, no organization name anywhere in the storefront.',
  '2. **Is anything below 12px?** That is the most common regression, and it is what makes a design read as a wireframe.',
  '3. **Does every text pair hold 4.5:1** in both themes? The measured table is in `DESIGN.md` §2.',
  '4. **Does every state read as true?** If the domain cannot do it, the screen says so rather than mocking a happy path.',
  '');

fs.writeFileSync(path.join(OUT, 'STITCH-PROMPTS.md'), s.join('\n') + '\n');
console.log('wrote ui/STITCH-PROMPTS.md —', BATCHES.length, 'batches,', Object.keys(SPECS).length, 'screens');

const SKINS_JSON = JSON.stringify(SKINS.map((s) => ({ id: s.id, name: s.name, kind: s.kind, note: s.note, primary: !!s.primary })));
const SCREENS_JSON = JSON.stringify(SCREENS.map((s) => ({ id: s.id, title: s.title, note: s.note, w: s.view.w, h: s.view.h, stitch: STITCH[s.id] || null })));

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MarketCore — UI board (Quartz)</title>${linkTags}<style>${css}</style></head><body>
<a class="skip" href="#main">Skip to main content</a>
<div class="wrap">
<h1 class="top">MarketCore — the UI, designed</h1>
<p class="sub"><b>Two surfaces, one system.</b> The <b>seller console</b> — a dark 252px rail with grouped nav, a breadcrumb top bar with ⌘K search, KPI cards, charts and dense tables with share bars and status pills. And the <b>buyer storefront</b> — a public chrome with no rail and no tenant, because a buyer belongs to no organization and buys from any seller. Same tokens and components in both; the rail is what a tenant has and a buyer does not. Direction: <b>Quartz</b>, with <b>Graphite</b> as the dark theme. Content is the real seed data. An accessibility pass holds <b>every text pair to 4.5:1 in both themes</b>, gives every control a visible focus ring and an accessible name, hides decorative icons, marks the mocks inert so the board is not a tab trap, and treats motion as a preference.</p>
<div class="bar" role="group" aria-label="Theme">
  <button class="tab" data-skin="quartz" aria-pressed="true">Quartz<small>light · indigo · primary</small></button>
  <button class="tab" data-skin="graphite" aria-pressed="false">Graphite<small>dark · periwinkle</small></button>
  <button class="tab" data-skin="stitch:plain" aria-pressed="false">Stitch · original<small>as Stitch renders it</small></button>
  <button class="tab" data-skin="stitch:craft" aria-pressed="false">Stitch · Senior Craft<small>the alternative pass</small></button>
  <span style="margin-left:auto;align-self:center;font-size:12px;color:#6b7280">${SCREENS.length} screens · <code>tokens.json</code> alongside</span>
</div>
<main id="main"><div class="hostwrap" id="host"></div></main>
</div>
<script>
const SKINS = ${SKINS_JSON};
const SHOTS = ${JSON.stringify(SHOTS)};
const SCREENS = ${SCREENS_JSON};
function renderStitch(variant){
  document.getElementById('host').innerHTML =
    '<div class="shot"><div class="cap"><b>' + (variant === 'craft' ? 'Stitch · Senior Craft' : 'Stitch · original') + '</b><span>project 3383911874392417631</span><em>embedded unchanged</em></div>' +
    '<div style="padding:14px 18px;font-size:13px;color:#5c6270">Each screen is the HTML Stitch generated, loaded from <code>ui/stitch/' + variant + '/</code> at the viewport Stitch rendered it at — what Stitch shows, pixel for pixel. The Quartz and Graphite tabs are the original pass ported into the generator.</div></div>' +
    SCREENS.filter(function(sc){ return sc.stitch; }).map(function(sc){
      const v = sc.stitch[variant];
      return '<section class="shot" aria-label="' + sc.title + ' — Stitch ' + variant + '">' +
        '<div class="cap"><b>' + sc.title + '</b><span>' + v.title + '</span><em>' + v.w + ' × ' + v.h + '</em></div>' +
        '<div class="scaler"><iframe class="stitchframe" src="stitch/' + variant + '/' + sc.id + '.html" title="' + v.title + '" loading="lazy" tabindex="-1" style="width:' + v.w + 'px;height:' + v.h + 'px" data-w="' + v.w + '" data-h="' + v.h + '"></iframe></div></section>';
    }).join('');
  fit();
}
function render(skinId){
  if (skinId.indexOf('stitch:') === 0) return renderStitch(skinId.slice(7));
  const s = SKINS.find(function(x){ return x.id === skinId; });
  document.getElementById('host').innerHTML =
    '<div class="shot"><div class="cap"><b>' + s.name + '</b><span>' + s.kind + '</span><em>' + (s.primary ? 'primary direction' : 'alternate theme') + '</em></div>' +
    '<div style="padding:14px 18px;font-size:13px;color:#5c6270">' + s.note + '</div></div>' +
    SCREENS.map(function(sc, i){
      return '<section class="shot" aria-label="' + sc.title + ' — ' + sc.note + '">' +
        '<div class="cap"><b>' + sc.title + '</b><span>' + sc.note + '</span><em>' + sc.w + ' × ' + sc.h + '</em></div>' +
        '<div class="scaler" data-i="' + i + '" data-w="' + sc.w + '" data-h="' + sc.h + '" inert>' + SHOTS[skinId][i].html + '</div></section>';
    }).join('');
  fit();
}
function fit(){
  document.querySelectorAll('.scaler').forEach(function(el){
    const inner = el.firstElementChild; if(!inner) return;
    const base = parseInt(el.dataset.w || inner.dataset.w, 10) || 1440;
    const h = parseInt(el.dataset.h || inner.dataset.h, 10) || 1140;
    const w = Math.min(base, el.clientWidth);
    inner.style.width = base + 'px'; inner.style.margin = '0 auto';
    inner.style.transform = 'scale(' + (w / base) + ')'; inner.style.transformOrigin = '0 0';
    el.style.height = (h * (w / base)) + 'px';
  });
}
document.querySelector('.bar').addEventListener('click', function(e){
  const b = e.target.closest('.tab'); if(!b) return;
  document.querySelectorAll('.tab').forEach(function(t){ t.setAttribute('aria-pressed', String(t === b)); });
  render(b.dataset.skin);
});
render('quartz');
window.addEventListener('resize', fit);
</script></body></html>`;

fs.writeFileSync(path.join(OUT, 'design-board.html'), page);
console.log('wrote ui/design-board.html —', SCREENS.length, 'screens ×', SKINS.length, 'skins');
console.log('wrote ui/tokens.json —', Object.keys(tokens.color).length, 'colour tokens');
console.log('wrote ui/DESIGN.md —', md.length, 'lines, worst contrast pair', worst.toFixed(2) + ':1');

/* ================================================= per-screen files for Stitch */
/*
 * Stitch cannot ingest a 37-screen board — `upload-to-stitch` takes ONE self-contained
 * HTML file per route, and `--title` is meant to be the route path so the screen is
 * identifiable inside Stitch. `node gen-ui.mjs --stitch` writes the board back out as
 * one standalone file per screen with the stylesheet inlined, plus a manifest of the
 * routes to pass as --title.
 *
 * Output goes to `ui/screens/`, which is gitignored: generated on demand, like the
 * screenshot exports, because it is megabytes of duplicated HTML already in the board.
 */
const ROUTES = {
  signin: '/signin', register: '/register', onboarding: '/onboarding',
  'shop-home': '/', storefront: '/browse', 'shop-category': '/c/textiles',
  'shop-search': '/search', 'shop-seller': '/s/nile-traders',
  'shop-product': '/p/nile-cotton-shirt', 'shop-product-reviews': '/p/nile-cotton-shirt/reviews',
  'storefront-mobile': '/mobile', 'shop-cart': '/cart', checkout: '/checkout',
  'shop-confirmation': '/orders/1042/placed', 'my-orders': '/account/orders', 'shop-order': '/account/orders/1042',
  'account-profile': '/account', 'account-addresses': '/account/addresses',
  'account-payments': '/account/payments', 'account-wishlist': '/account/wishlist',
  dashboard: '/admin', products: '/admin/products', product: '/admin/products/6642',
  'product-new': '/admin/products/new', 'product-media': '/admin/products/6642/media',
  inventory: '/admin/inventory', promotions: '/admin/promotions', orders: '/admin/orders',
  order: '/admin/orders/1042', fulfil: '/admin/orders/1042/fulfil', refunds: '/admin/refunds',
  payouts: '/admin/payouts', 'store-settings': '/admin/settings', members: '/admin/members',
  operations: '/admin/operations', foundations: '/design/foundations', states: '/design/states',
};

if (process.argv.includes('--stitch')) {
  const dir = path.join(OUT, 'screens', 'stitch');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const manifest = ['screen\troute\ttitle'];
  SCREENS.forEach((sc, i) => {
    const shot = SHOTS[SKINS[0].id][i];
    const route = ROUTES[sc.id] || '/' + sc.id;
    const file = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MarketCore — ${esc(sc.title)}</title>${linkTags}<style>${css}</style></head><body style="margin:0">${shot.html}</body></html>`;
    fs.writeFileSync(path.join(dir, sc.id + '.html'), file);
    manifest.push(sc.id + '\t' + route + '\t' + sc.title);
  });
  fs.writeFileSync(path.join(dir, 'routes.tsv'), manifest.join('\n') + '\n');

  /* The same batches as STITCH-PROMPTS.md, but machine-readable, so a driver can run
     them one generation at a time without re-deriving the split. */
  const batches = BATCHES.map(([title, ids]) => ({
    title,
    screens: ids.map((id) => {
      const sc = SCREENS.find((x) => x.id === id);
      return { id, route: ROUTES[id] || '/' + id, title: sc.title, prompt: SPECS[id] };
    }),
  }));
  fs.writeFileSync(path.join(dir, 'batches.json'), JSON.stringify(batches, null, 2) + '\n');

  fs.writeFileSync(path.join(dir, 'README.md'), `# Stitch upload source — ${SCREENS.length} screens

One self-contained HTML file per screen, in ${SKINS[0].name} (the primary direction), with the
stylesheet inlined. Generated by \`node gen-ui.mjs --stitch\`; regenerate rather than edit.

\`routes.tsv\` is \`screen<TAB>route<TAB>title\` — pass the **route** as \`--title\` so each
screen is identifiable inside Stitch. Upload with the Google Labs \`stitch::upload-to-stitch\`
script, one file per call:

\`\`\`bash
python3 upload_to_stitch.py \\
  --project-id <PROJECT_ID> \\
  --file-path ${'<screen>'}.html \\
  --title "/admin" \\
  --api-key "$STITCH_API_KEY" \\
  --generated-by 'stitch::code-to-design'
\`\`\`

Upload \`.stitch/DESIGN.md\` as the design system first, so the screens land in a project that
already knows the tokens. Then iterate in Stitch with \`stitch::generate-design\`
("edit the dashboard to ...") rather than regenerating.

This directory is gitignored — the content is already in \`design-board.html\`.
`);
  console.log('wrote ui/screens/stitch —', SCREENS.length, 'standalone screens + routes.tsv');
}

