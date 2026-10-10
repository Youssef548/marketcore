import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Writes beside this script: ui/design-board.html and ui/tokens.json.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'ui');
// Remove only this script's own outputs, never the directory. `ui/screens/` and
// `before-after.html` are produced by other generators, and wiping `ui/` deleted them —
// the kind of "cleanup" that destroys work it did not create.
fs.mkdirSync(OUT, { recursive: true });
for (const name of ['design-board.html', 'tokens.json']) {
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
      railInk: '#eef1f7', railMuted: '#8b93a7', ink: '#0a0b12', muted: '#667085', faint: '#98a2b3',
      line: '#e6e8ef', lineStrong: '#d5d9e2', controlEdge: '#838b9a', accent: '#4f46e5', accentInk: '#ffffff', accentWash: '#eef0ff',
      ok: '#16a34a', okWash: '#e8f7ee', bad: '#e11d48', badWash: '#fdecef', warn: '#d97706', warnWash: '#fdf3e4',
      info: '#0ea5e9', r: '12px', rSm: '8px',
      shadow: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)', grid: '#eef0f5',
      font: 'DM Sans, system-ui, sans-serif', fontMono: 'DM Mono, ui-monospace, monospace',
    },
  },
  {
    id: 'graphite', name: 'Graphite', kind: 'Dark · periwinkle',
    note: 'The same system, dark-first — kept as the Operations theme for long low-light sessions.',
    v: {
      canvas: '#0b0d12', panel: '#12151c', panel2: '#171b24', rail: '#070910',
      railInk: '#e8ebf2', railMuted: '#78829a', ink: '#e9ecf3', muted: '#98a2b8', faint: '#6b7488',
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
const ico = (d, sz = 16) => `<svg class="i" viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
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
};

/* ================================================================= charts */
function sparkline(data, color, w = 132, h = 38) {
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((d, i) => [(i / (data.length - 1)) * w, h - 4 - ((d - min) / span) * (h - 10)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const id = 'sg' + Math.random().toString(36).slice(2, 7);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${w} ${h} L0 ${h} Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function barChart(series, labels, w = 720, h = 200) {
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
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">${g}${bars}${labels.map((l, i) => `<text x="${pad.l + i * gw + gw / 2}" y="${h - 8}" class="ax" text-anchor="middle">${l}</text>`).join('')}</svg>`;
}
function donut(parts, size = 128) {
  const r = size / 2 - 12, c = size / 2, circ = 2 * Math.PI * r;
  let off = 0, seg = '';
  const cols = ['var(--accent)', 'var(--info)', 'var(--ok)', 'var(--faint)'];
  parts.forEach((p, i) => {
    const len = (p.v / 100) * circ;
    seg += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${cols[i % cols.length]}" stroke-width="13" stroke-dasharray="${len - 3} ${circ - len + 3}" stroke-dashoffset="${-off}" transform="rotate(-90 ${c} ${c})" stroke-linecap="round"/>`;
    off += len;
  });
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${seg}<text x="${c}" y="${c + 1}" text-anchor="middle" class="dn-big">${esc(parts[0].label)}</text><text x="${c}" y="${c + 16}" text-anchor="middle" class="dn-sm">${esc(parts[0].sub || '')}</text></svg>`;
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
    <table class="tbl"><thead><tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody>${foot ? `<tfoot><tr>${foot}</tr></tfoot>` : ''}</table></section>`;
}

const rail = (active) => `
  <aside class="rail">
    <div class="railtop"><span class="logo"></span><div class="ws"><b>Nile Traders</b><i>MarketCore</i></div>${I.down}</div>
    <label class="railsearch">${I.search}<input placeholder="Search"><kbd>⌘K</kbd></label>
    <nav>
      <span class="navhead">Overview</span>
      <a class="nav ${active === 'dashboard' ? 'on' : ''}">${I.grid}Dashboard</a>
      <a class="nav ${active === 'reports' ? 'on' : ''}">${I.chart}Reports</a>
      <span class="navhead">Catalog</span>
      <a class="nav ${active === 'products' ? 'on' : ''}">${I.box}Products<span class="count">4</span></a>
      <a class="nav">${I.layers}Inventory</a>
      <span class="navhead">Money</span>
      <a class="nav ${active === 'orders' ? 'on' : ''}">${I.receipt}Orders<span class="count">128</span></a>
      <a class="nav ${active === 'refunds' ? 'on' : ''}">${I.undo}Refunds</a>
      <a class="nav ${active === 'payouts' ? 'on' : ''}">${I.bank}Payouts</a>
      <span class="navhead">Admin</span>
      <a class="nav ${active === 'members' ? 'on' : ''}">${I.users}Members</a>
      <a class="nav ${active === 'operations' ? 'on' : ''}">${I.activity}Operations<span class="count warn">3</span></a>
    </nav>
    <div class="railuser">${ava('JP', 'inv')}<div><b>owner@marketcore.test</b><i>Owner</i></div>${I.down}</div>
  </aside>`;

const topbar = (crumbs) => `
  <header class="topbar">
    <div class="crumbs">${crumbs.map((c, i) => i ? `<span>${esc(c)}</span>` : `<span class="dimx">${esc(c)}</span>`).join('<i>/</i>')}</div>
    <label class="topsearch">${I.search}<input placeholder="Search products, orders, request ids…"><kbd>⌘K</kbd></label>
    <button class="iconbtn">${I.bell}<i class="badge">3</i></button>
    <div class="userchip">${ava('JP', 'inv')}<div><b>Jordan Park</b><i>Owner · Nile Traders</i></div>${I.down}</div>
  </header>`;

const pagehead = (title, sub, right) => `<div class="pagehead"><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div><div class="headctl">${right || ''}</div></div>`;
const seg = (items, on = 1) => `<div class="seg">${items.map((t, i) => `<button class="${i === on ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>`;
const shell = (active, crumbs, head, content) => `<div class="shell">${rail(active)}<div class="main">${topbar(crumbs)}<div class="page">${head}${content}</div></div></div>`;

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
    pagehead('Products', '4 products · Nile Traders', `<label class="inline-search">${I.search}<input placeholder="Search products…"></label><button class="btn ghost">${I.sliders}Filter</button><button class="btn">${I.plus}New product</button>`),
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
    <label class="fld"><span>Email</span><input class="input" placeholder="you@company.test"></label>
    <label class="fld"><span>Password</span><input class="input" placeholder="at least 12 characters"><em>12+ code points</em></label>
    <button class="btn full">Create account</button>
    <p class="authfoot">Already have one? <a>Sign in</a></p>
  </div></div>`;
}

function foundations(skin) {
  const v = skin.v;
  const sw = (n, k, role) => `<div class="sw"><i style="background:var(--${k})"></i><b>${n}</b><i2>${role}</i2><code>${esc(v[k])}</code></div>`;
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
  return `<div class="doc"><div class="dochead"><h1>States</h1><p>The shapes a screen takes before and instead of data. Empty and error are designed, not defaulted — they are where a user learns what to do.</p></div>
    <div class="stategrid">
      <section class="card"><header class="cardhead"><div><h3>Loading</h3><p>skeleton, never a spinner that hides the layout</p></div></header><div class="cardpad">
        <div class="skel" style="width:32%"></div><div class="skel" style="width:72%"></div><div class="skel" style="width:54%"></div><div class="skel" style="width:64%"></div></div></section>
      <section class="card"><header class="cardhead"><div><h3>Empty</h3><p>a first action, not a dead end</p></div></header>
        <div class="cardpad empty"><span class="emblem"></span><b>No products yet</b><p class="note">Products you add to Nile Traders appear here.</p><button class="btn">${I.plus}New product</button></div></section>
      <section class="card"><header class="cardhead"><div><h3>Error</h3><p>one envelope, a code to branch on</p></div></header><div class="cardpad">
        <div class="alertbad"><b>Query failed</b><span class="mono">req_2bb178…</span></div>
        <p class="note">Every failure carries the same shape: a code, a message, and the request id that joins it to a log line.</p></div></section>
      <section class="card"><header class="cardhead"><div><h3>Not found</h3><p>404, never 403</p></div></header>
        <div class="cardpad empty"><span class="emblem slash"></span><b>404 — not found</b><p class="note">A product from another organization answers 404: an id is a probe, and 403 would confirm it exists.</p></div></section>
    </div></div>`;
}

/* ===================================================================== page */
const css = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Mono:wght@400;500&display=swap');
*{box-sizing:border-box}
body{margin:0;background:#e9eaee;color:#0a0b12;font:400 15px/1.5 "DM Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1600px;margin:0 auto;padding:32px 28px 80px}
h1.top{margin:0;font-size:27px;letter-spacing:-.025em}
p.sub{color:#5c6270;max-width:104ch;margin:9px 0 0;font-size:14px}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0 22px;position:sticky;top:0;background:#e9eaee;padding:12px 0;z-index:6;border-bottom:1px solid #d9dade}
.tab{border:1px solid #cfd1d6;background:#fff;border-radius:10px;padding:9px 15px;font:600 13px/1 "DM Sans",sans-serif;cursor:pointer;color:#3a3f4b}
.tab[aria-pressed="true"]{background:#0a0b12;color:#fff;border-color:#0a0b12}
.tab small{display:block;font-weight:400;font-size:10.5px;opacity:.7;margin-top:3px}
.hostwrap{display:flex;flex-direction:column;gap:26px}
.shot{background:#fff;border:1px solid #d9dade;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.06)}
.shot>.cap{padding:14px 18px;border-bottom:1px solid #e8e9ec;display:flex;gap:12px;align-items:baseline}
.cap b{font-size:14px}.cap span{color:#6b7280;font-size:12.5px}.cap em{margin-left:auto;font-style:normal;color:#8a8f98;font-size:12px}
.scaler{overflow:hidden}
/* ---------- the design system ---------- */
.ds{background:var(--canvas);color:var(--ink);font-family:"DM Sans",system-ui,sans-serif;overflow:hidden}
.shell{display:flex;height:100%;width:100%}
.ds .mono,.ds kbd{font-family:"DM Mono",ui-monospace,monospace}
.rail{width:252px;flex:0 0 252px;background:var(--rail);color:var(--railInk);display:flex;flex-direction:column;padding:16px 14px 14px;gap:6px}
.railtop{display:flex;align-items:center;gap:10px;padding:4px 6px 12px}
.logo{width:30px;height:30px;border-radius:9px;background:var(--accent);position:relative;flex:0 0 30px}
.logo:after{content:"";position:absolute;inset:8px;border-left:2px solid var(--accentInk);border-bottom:2px solid var(--accentInk)}
.ws b{display:block;font-size:13.5px;font-weight:600}.ws i{display:block;font-style:normal;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--railMuted);margin-top:2px}
.railtop>svg{margin-left:auto;color:var(--railMuted)}
.railsearch{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:0 10px;height:36px;margin-bottom:6px;color:var(--railMuted)}
.railsearch input{flex:1;background:none;border:0;outline:none;color:var(--railInk);font:inherit;font-size:13px;min-width:0}
.railsearch kbd{font-size:10px;border:1px solid rgba(255,255,255,.16);border-radius:4px;padding:1px 5px;color:var(--railMuted)}
nav{display:flex;flex-direction:column;gap:1px}
.navhead{font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--railMuted);opacity:.75;padding:14px 10px 5px}
.nav{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;color:var(--railMuted);font-size:13.5px;text-decoration:none;cursor:pointer}
.nav.on{background:var(--accent);color:var(--accentInk);font-weight:600}
.nav.on .count{background:rgba(255,255,255,.22);color:#fff}
.count{margin-left:auto;font-size:11px;font-weight:600;background:rgba(255,255,255,.1);color:var(--railMuted);border-radius:999px;padding:1px 7px}
.count.warn{background:var(--warn);color:#1b1305}
.railuser{margin-top:auto;display:flex;align-items:center;gap:9px;padding:10px 8px;border-top:1px solid rgba(255,255,255,.08);font-size:12.5px}
.railuser b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px}
.railuser i{display:block;font-style:normal;font-size:10.5px;color:var(--railMuted)}
.railuser>svg{margin-left:auto;color:var(--railMuted)}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.topbar{height:64px;flex:0 0 64px;background:var(--panel);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:14px;padding:0 20px}
.crumbs{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:600}
.crumbs .dimx{color:var(--muted);font-weight:500}.crumbs i{color:var(--faint);font-style:normal}
.topsearch{margin-left:20px;display:flex;align-items:center;gap:9px;background:var(--panel2);border:1px solid var(--line);border-radius:9px;height:36px;padding:0 10px;max-width:420px;flex:1;color:var(--muted)}
.topsearch input{flex:1;border:0;background:none;outline:none;font:inherit;font-size:13px;color:var(--ink);min-width:0}
.topsearch kbd{font-size:10px;border:1px solid var(--lineStrong);border-radius:4px;padding:1px 5px;color:var(--faint)}
.iconbtn{position:relative;width:36px;height:36px;border-radius:9px;border:1px solid var(--line);background:var(--panel);color:var(--muted);display:grid;place-items:center;cursor:pointer}
.iconbtn .badge{position:absolute;top:-5px;right:-5px;background:var(--bad);color:#fff;font-size:9.5px;font-weight:700;border-radius:999px;padding:1px 5px;font-style:normal}
.userchip{margin-left:auto;display:flex;align-items:center;gap:9px;padding:5px 8px;border-radius:10px;border:1px solid var(--line);background:var(--panel);font-size:12.5px}
.userchip b{display:block}.userchip i{display:block;font-style:normal;font-size:10.5px;color:var(--muted)}
.userchip>svg{color:var(--faint)}
.av{width:28px;height:28px;border-radius:50%;background:var(--panel2);color:var(--muted);display:grid;place-items:center;font-size:11px;font-weight:700;flex:0 0 28px;border:1px solid var(--line)}
.av.inv{background:var(--accentWash);color:var(--accent);border-color:transparent}
.page{flex:1;min-width:0;padding:20px;display:flex;flex-direction:column;gap:16px}
.pagehead{display:flex;align-items:flex-start;gap:16px}
.pagehead h1{margin:0;font-size:24px;letter-spacing:-.025em;font-weight:700}
.pagehead p{margin:3px 0 0;font-size:13.5px;color:var(--muted)}
.headctl{margin-left:auto;display:flex;gap:10px;align-items:center}
.seg{display:flex;background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:3px;gap:2px}
.seg button{border:0;background:none;font:600 12.5px/1 "DM Sans",sans-serif;color:var(--muted);padding:7px 12px;border-radius:6px;cursor:pointer}
.seg button.on{background:var(--panel);color:var(--ink);box-shadow:var(--shadow)}
.btn{display:inline-flex;align-items:center;gap:7px;background:var(--accent);color:var(--accentInk);border:1px solid transparent;border-radius:9px;padding:9px 14px;font:600 13px/1 "DM Sans",sans-serif;cursor:pointer}
.btn.ghost{background:var(--panel);color:var(--ink);border-color:var(--controlEdge)}
.btn.quiet{background:none;color:var(--muted);border-color:transparent;padding:6px 8px}
.btn.sm{padding:6px 10px;font-size:12px}.btn.full{width:100%;justify-content:center}
.inline-search{display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--controlEdge);border-radius:9px;height:38px;padding:0 11px;color:var(--muted);width:250px}
.inline-search input{border:0;background:none;outline:none;font:inherit;font-size:13px;color:var(--ink);width:100%}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:15px 16px 10px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:6px}
.kpitop{display:flex;align-items:center;gap:10px}
.kpi-label{font-size:12px;color:var(--muted);font-weight:500}
.delta{margin-left:auto;display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:600;border-radius:999px;padding:2px 8px}
.delta.up{color:var(--ok);background:var(--okWash)}.delta.down{color:var(--bad);background:var(--badWash)}
.kpi-val{font-size:27px;font-weight:700;letter-spacing:-.03em}
.spark{display:block;width:100%;height:38px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;display:flex;flex-direction:column}
.cardhead{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line)}
.cardhead h3{margin:0;font-size:14.5px;font-weight:600}
.cardhead p{margin:2px 0 0;font-size:12px;color:var(--muted)}
.cardhead>*:last-child{margin-left:auto}
.cardpad{padding:14px 16px}
.legend{display:flex;gap:14px;font-size:12px;color:var(--muted)}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend i{width:9px;height:9px;border-radius:3px;display:inline-block}
.grid2{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;align-items:start}
.stack{display:flex;flex-direction:column;gap:16px}
.tbl{width:100%;border-collapse:collapse}
.tbl th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);font-weight:600;padding:10px 16px;border-bottom:1px solid var(--line);background:var(--panel2)}
.tbl td{padding:12px 16px;font-size:13.5px;border-bottom:1px solid var(--line);vertical-align:middle}
.tbl tbody tr:last-child td{border-bottom:0}
.tbl tbody tr:hover{background:var(--panel2)}
.tbl .num{text-align:right}
.tbl .right{text-align:right}
.tbl tfoot td{background:var(--panel2);border-top:1px solid var(--line)}
.tf{font-size:12px;color:var(--muted)}
.okc{color:var(--ok)}
.who{display:flex;align-items:center;gap:10px}
.who>span{display:block;font-weight:600}
.who i{display:block;font-style:normal;font-weight:400;font-size:11px;color:var(--muted);font-family:"DM Mono",monospace}
.dot{width:9px;height:9px;border-radius:3px;flex:0 0 9px;background:var(--faint)}
.dot.ok{background:var(--ok)}.dot.draft{background:var(--faint)}
.st{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;border-radius:999px;padding:3px 10px;background:var(--panel2);color:var(--muted)}
.st i{width:6px;height:6px;border-radius:50%;background:currentColor}
.st.ok{background:var(--okWash);color:var(--ok)}.st.warn{background:var(--warnWash);color:var(--warn)}
.st.bad{background:var(--badWash);color:var(--bad)}.st.neutral{background:var(--panel2);color:var(--muted)}
.sharebar{display:inline-block;width:88px;height:6px;border-radius:999px;background:var(--panel2);overflow:hidden;vertical-align:middle}
.sharebar i{display:block;height:100%;border-radius:999px}
.stock{display:inline-flex;align-items:center;gap:9px}
.stock .sharebar{width:96px}.stock b{font-size:12.5px}
.dash{color:var(--faint)}.dim{color:var(--muted)}
.donutwrap{display:flex;align-items:center;gap:18px}
.dn-big{font-size:19px;font-weight:700;fill:var(--ink)}.dn-sm{font-size:11px;fill:var(--muted)}
.legendlist{list-style:none;margin:0;padding:0;flex:1;font-size:13px}
.legendlist li{display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--line)}
.legendlist li:last-child{border-bottom:0}.legendlist i{width:9px;height:9px;border-radius:3px}
.legendlist b{margin-left:auto;font-family:"DM Mono",monospace}
.toplist{list-style:none;margin:0;padding:6px 16px 14px}
.toplist li{display:grid;grid-template-columns:1fr 34px 88px 76px;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--line);font-size:13px}
.toplist li:last-child{border-bottom:0}
.tl-n{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tl-p{color:var(--muted);font-size:12px}.tl-m{text-align:right;font-size:12.5px}
.ax{font-size:10px;fill:var(--faint);font-family:"DM Mono",monospace}
.chart{display:block}
.form{display:flex;flex-direction:column;gap:14px}
.fld{display:block}
.fld>span{display:block;font-size:11.5px;font-weight:600;color:var(--muted);margin-bottom:6px}
.fld em{display:block;font-style:normal;font-size:11px;color:var(--faint);margin-top:5px}
.input{width:100%;height:38px;border:1px solid var(--controlEdge);border-radius:9px;padding:0 12px;background:var(--panel);font:400 13.5px/1 "DM Sans",sans-serif;color:var(--ink)}
.input:focus{outline:2px solid var(--accent);outline-offset:1px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.kv{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px}
.kv:last-child{border-bottom:0}.kv span{color:var(--muted)}
.bignum{font-size:34px;font-weight:700;letter-spacing:-.03em;margin:2px 0 10px}
.bignum span{font-size:12px;font-weight:400;color:var(--muted);margin-left:8px}
.note{margin:0;font-size:12.5px;color:var(--muted);line-height:1.55}
.alertwarn,.alertbad{border-radius:var(--rSm);padding:10px 12px;font-size:12.5px;margin:0}
.alertbad{background:var(--badWash);color:var(--bad)}
.alertwarn{background:var(--warnWash);color:var(--warn)}
.actions{display:flex;gap:10px}
.tl{list-style:none;margin:0;padding:6px 16px 14px}
.tl li{padding:10px 0 10px 16px;position:relative;border-left:2px solid var(--line);margin-left:4px}
.tl li:before{content:"";position:absolute;left:-5px;top:15px;width:8px;height:8px;border-radius:50%;background:var(--ok);border:2px solid var(--panel)}
.tl b{display:block;font-size:12.5px}.tl span{font-size:11.5px;color:var(--muted)}
.flow{display:flex;align-items:center;gap:8px;font-size:12.5px}
.flow em{color:var(--faint);font-style:normal}
.fstep{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;background:var(--panel2);color:var(--muted);border:1px solid var(--line);font-weight:600}
.fstep.done{background:var(--accentWash);color:var(--accent);border-color:transparent}
.fstep i{display:inline-flex}
/* auth */
.authwrap{height:100%;display:grid;place-items:center;position:relative}
.authcard{width:392px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:28px;box-shadow:var(--shadow)}
.authcard h2{margin:20px 0 4px;font-size:22px;letter-spacing:-.02em}
.authsub{margin:0 0 18px;font-size:13px;color:var(--muted)}
.brandbig{display:flex;align-items:center;gap:10px;font-size:17px}
.authfoot{margin:16px 0 0;font-size:12.5px;color:var(--muted);text-align:center}
.authfoot a{color:var(--accent);font-weight:600}
.authnote{position:absolute;bottom:26px;font-size:11.5px;color:var(--faint);max-width:540px;text-align:center}
/* doc */
.doc{padding:28px 32px;height:100%;overflow:hidden}
.dochead h1{margin:0 0 6px;font-size:22px}.dochead p{margin:0 0 18px;color:var(--muted);max-width:104ch;font-size:13.5px}
.doc section{margin-bottom:18px}
.doc h4{margin:0 0 9px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
.swrow{display:flex;gap:12px;flex-wrap:wrap}
.sw{border:1px solid var(--line);border-radius:var(--rSm);padding:10px;width:176px;background:var(--panel)}
.sw i{display:block;height:36px;border-radius:6px;border:1px solid var(--line)}
.sw b{display:block;margin-top:8px;font-size:12.5px}
.sw i2{display:block;font-style:normal;font-size:11px;color:var(--muted)}
.sw code{font-size:10.5px;color:var(--faint)}
.typerow{display:flex;gap:22px;align-items:baseline;background:var(--panel);border:1px solid var(--line);border-radius:var(--rSm);padding:14px 16px}
.t1{font-size:26px;font-weight:700;letter-spacing:-.03em}.t2{font-size:18px;font-weight:600}
.t3{font-size:13.5px;color:var(--muted)}.lblx{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
.typerow .mono{color:var(--muted)}
.ctlrow{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);border-radius:var(--rSm);padding:12px 14px}
.motifs{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.motiflabel{display:block;font-size:11.5px;color:var(--muted);margin-bottom:9px}
.motifbox{background:var(--panel);border:1px solid var(--line);border-radius:var(--rSm);padding:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.motifbox.col{flex-direction:column;align-items:flex-start}
.motifbox .spark{width:200px}
.stategrid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.stategrid .card{min-height:200px}
.skel{height:13px;border-radius:6px;background:var(--panel2);margin-bottom:12px}
.empty{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:26px 16px}
.empty b{font-size:14px}
.emblem{width:40px;height:40px;border-radius:12px;background:var(--panel2);display:inline-block}
.emblem.slash{background:repeating-linear-gradient(45deg,var(--lineStrong),var(--lineStrong) 4px,var(--panel2) 4px,var(--panel2) 8px)}
`;

const SCREENS = [
  { id: 'signin', title: 'Sign in', note: 'auth · error state', h: 820, doc: true, fn: signin },
  { id: 'register', title: 'Register', note: 'auth · password policy', h: 820, doc: true, fn: register },
  { id: 'onboarding', title: 'First run', note: 'no organization yet → create one', h: 820, doc: true, fn: onboarding },
  { id: 'dashboard', title: 'Dashboard', note: 'KPIs, chart, orders', h: 1140, fn: dashboard },
  { id: 'products', title: 'Products', note: 'dense table, stock bars, trend', h: 940, fn: products },
  { id: 'product', title: 'Product detail', note: 'form, inventory, sales', h: 1000, fn: productDetail },
  { id: 'orders', title: 'Orders', note: 'order list', h: 820, fn: orders },
  { id: 'order', title: 'Order detail', note: 'items, ledger, timeline', h: 1000, fn: orderDetail },
  { id: 'refunds', title: 'Refunds', note: 'INV-5, request panel', h: 860, fn: refunds },
  { id: 'payouts', title: 'Payouts', note: 'INV-8, balances', h: 880, fn: payouts },
  { id: 'members', title: 'Members', note: 'roles, tenant isolation', h: 860, fn: members },
  { id: 'operations', title: 'Operations', note: 'webhooks, outbox', h: 900, fn: operations },
  { id: 'foundations', title: 'Foundations', note: 'tokens, type, components', h: 1290, doc: true, fn: foundations },
  { id: 'states', title: 'States', note: 'loading · empty · error · 404', h: 700, doc: true, fn: states },
];

const SHOTS = {};
SKINS.forEach((s) => {
  SHOTS[s.id] = SCREENS.map((sc) => ({ h: sc.h, html: `<div class="ds" style="${vars(s.v)};height:${sc.h}px">${sc.fn(s)}</div>` }));
});

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
    size: { label: T('11px', 'fontSizes'), body: T('13.5px', 'fontSizes'), title: T('24px', 'fontSizes'), metric: T('27px', 'fontSizes'), display: T('34px', 'fontSizes') },
  },
};
fs.writeFileSync(path.join(OUT, 'tokens.json'), JSON.stringify(tokens, null, 2));

const SKINS_JSON = JSON.stringify(SKINS.map((s) => ({ id: s.id, name: s.name, kind: s.kind, note: s.note, primary: !!s.primary })));
const SCREENS_JSON = JSON.stringify(SCREENS.map((s) => ({ id: s.id, title: s.title, note: s.note, h: s.h })));

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MarketCore — UI board (Quartz)</title><style>${css}</style></head><body>
<div class="wrap">
<h1 class="top">MarketCore — the UI, designed</h1>
<p class="sub">The operator console in the chosen direction, <b>Quartz</b>: a dark 252px rail with grouped nav, a breadcrumb top bar with ⌘K search, and a page header with a range control and an export. Below it, the components that do the work — <b>KPI cards with delta chips and sparklines</b>, real <b>charts</b>, and tables with <b>share bars</b>, sparkline columns and semantic <b>status pills</b>. Content is the real seed data. <b>Graphite</b> is the same structure, dark — the Operations theme.</p>
<div class="bar">
  <button class="tab" data-skin="quartz" aria-pressed="true">Quartz<small>light · indigo · primary</small></button>
  <button class="tab" data-skin="graphite" aria-pressed="false">Graphite<small>dark · periwinkle</small></button>
  <span style="margin-left:auto;align-self:center;font-size:12px;color:#6b7280">13 screens · <code>tokens.json</code> alongside</span>
</div>
<div class="hostwrap" id="host"></div>
</div>
<script>
const SKINS = ${SKINS_JSON};
const SHOTS = ${JSON.stringify(SHOTS)};
const SCREENS = ${SCREENS_JSON};
function render(skinId){
  const s = SKINS.find(function(x){ return x.id === skinId; });
  document.getElementById('host').innerHTML =
    '<div class="shot"><div class="cap"><b>' + s.name + '</b><span>' + s.kind + '</span><em>' + (s.primary ? 'primary direction' : 'alternate theme') + '</em></div>' +
    '<div style="padding:14px 18px;font-size:13px;color:#5c6270">' + s.note + '</div></div>' +
    SCREENS.map(function(sc, i){
      return '<div class="shot"><div class="cap"><b>' + sc.title + '</b><span>' + sc.note + '</span><em>1440 × ' + sc.h + '</em></div>' +
        '<div class="scaler" data-i="' + i + '">' + SHOTS[skinId][i].html + '</div></div>';
    }).join('');
  fit();
}
function fit(){
  document.querySelectorAll('.scaler').forEach(function(el){
    const inner = el.firstElementChild; if(!inner) return;
    const h = parseInt(inner.style.height, 10) || 1140;
    const w = Math.min(1440, el.clientWidth);
    inner.style.transform = 'scale(' + (w / 1440) + ')'; inner.style.transformOrigin = '0 0';
    el.style.height = (h * (w / 1440)) + 'px';
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
