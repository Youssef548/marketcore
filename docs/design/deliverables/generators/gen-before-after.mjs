// Renders the before/after comparison of the signed-in web flow.
//
// Writes beside this script: ui/before-after.html.
//
// The screenshots it references are produced by a Playwright run against the running
// app (see docs/design/deliverables/ui/screens/README.md), and the metrics are read
// from the JSON the measuring pass wrote beside them. No dependencies: like the other
// generators here, it is `node gen-before-after.mjs` and nothing else.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..', 'ui');
const SCREENS = join(UI, 'screens');

const read = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

const before = JSON.parse(read(join(SCREENS, 'before', 'metrics.json')) ?? '[]');
const after = JSON.parse(read(join(SCREENS, 'after', 'metrics.json')) ?? '[]');

/** The screens captured for the comparison, in reading order. */
const SHOTS = [
  { name: 'login-desktop', label: 'Sign in' },
  { name: 'register-desktop', label: 'Register' },
  { name: 'dashboard-desktop', label: 'Overview' },
  { name: 'products-desktop', label: 'Products' },
  { name: 'login-mobile', label: 'Sign in' },
  { name: 'dashboard-mobile', label: 'Overview' },
  { name: 'products-mobile', label: 'Products' },
];

/**
 * One row per measured path and viewport, before against after. The numbers are the
 * argument: a claim about "responsive" that is not a measurement is an opinion.
 */
const METRIC_ROWS = [
  { label: 'Dashboard @ 390px', key: (m) => m.path === '/dashboard' && m.viewport === 390 },
  { label: 'Products @ 390px', key: (m) => m.path === '/products' && m.viewport === 390 },
  { label: 'Dashboard @ 1440px', key: (m) => m.path === '/dashboard' && m.viewport === 1440 },
  { label: 'Products @ 1440px', key: (m) => m.path === '/products' && m.viewport === 1440 },
];

const find = (list, key) => list.find(key);

const CHANGES = [
  {
    title: 'The shell reflows instead of clipping',
    detail:
      'The rail is one column below <code>lg</code>, so it becomes a full-width block above the content. At 390px the page no longer overflows horizontally (577px → 390px) and the content column is no longer squeezed to 138px. Desktop is untouched: the 252px rail and 768px content are identical at 1440px.',
  },
  {
    title: 'The catalog table scrolls instead of hiding columns',
    detail:
      'The wrapper changed from <code>overflow-hidden</code> to <code>overflow-x-auto</code>, so a wide table is reachable on a phone rather than clipped (88px visible of 299px → 340px of 340px).',
  },
  {
    title: 'One heading per page, not two',
    detail:
      'The top bar already titles the page, so the page-level <code>h1</code>/<code>h2</code> that repeated the same words were removed — a clean heading outline instead of a duplicated one.',
  },
  {
    title: 'The tenant control is readable at its weight',
    detail:
      'The organization switcher grew from <code>text-xs</code>/<code>px-2 py-1</code> to <code>text-sm</code>/<code>px-2.5 py-1.5</code>. It stays in the rail, because the shell asserts the tenant lives in exactly one place.',
  },
  {
    title: 'Accessibility floor',
    detail:
      'A skip-to-content link, <code>scope="col"</code> and a <code>caption</code> on the products table, <code>role="status"</code> on the two loading states, a sign-out busy state, and an avatar that reads "A" rather than "A@".',
  },
  {
    title: 'The front door names the product',
    detail:
      'The credential card now carries the application name above it, so a first-timer can see what they are signing into.',
  },
];

const metricValue = (entry, pick) => {
  if (!entry) return '—';
  return pick(entry);
};

const metricRows = METRIC_ROWS.map(({ label, key }) => {
  const b = find(before, key);
  const a = find(after, key);
  const cell = (m) => ({
    overflow: m ? (m.horizontalOverflow ? 'yes' : 'no') : '—',
    rail: m ? `${m.railWidth}px` : '—',
    content: m ? `${m.mainWidth}px` : '—',
    table:
      m && m.tableWrapperClientWidth != null
        ? `${m.tableWrapperClientWidth} / ${m.tableScrollWidth}px`
        : '—',
  });
  return { label, before: cell(b), after: cell(a) };
}).map(
  ({ label, before: b, after: a }) => `
      <tr>
        <th scope="row">${label}</th>
        <td class="bad">${b.overflow}</td>
        <td class="good">${a.overflow}</td>
        <td>${b.content} → <b>${a.content}</b></td>
        <td>${b.table} → <b>${a.table}</b></td>
      </tr>`,
).join('');

/**
 * The screenshots are embedded rather than linked: `ui/screens/` is gitignored (regenerated
 * on demand, like the other screenshot exports), so a linked board would show broken images
 * in a fresh clone. Embedding keeps this file self-contained like the boards beside it, and
 * the relative-path fallback keeps it readable when the screens are not on disk.
 */
const source = (state, name) => {
  try {
    const bytes = readFileSync(join(SCREENS, state, `${name}.png`));
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } catch {
    return `screens/${state}/${name}.png`;
  }
};

const figure = ({ name, label }) => `
    <figure class="pair">
      <figcaption>${label}</figcaption>
      <div class="pair-grid">
        <div class="shot"><span class="tag before">Before</span><img src="${source('before', name)}" alt="Before: ${label}"></div>
        <div class="shot"><span class="tag after">After</span><img src="${source('after', name)}" alt="After: ${label}"></div>
      </div>
    </figure>`;

const desktopShots = SHOTS.filter((s) => s.name.endsWith('-desktop')).map(figure).join('');
const mobileShots = SHOTS.filter((s) => s.name.endsWith('-mobile')).map(figure).join('');

const changes = CHANGES.map(
  (c) => `
      <li><b>${c.title}.</b> ${c.detail}</li>`,
).join('');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Signed-in web flow — before / after</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 48px 32px 96px; font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #14161d; background: #f6f7fb; }
  .wrap { max-width: 1180px; margin: 0 auto; }
  h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0 0 6px; }
  .lede { color: #5b6172; max-width: 70ch; margin: 0 0 32px; }
  h2 { font-size: 18px; letter-spacing: -0.01em; margin: 44px 0 14px; }
  .panel { background: #fff; border: 1px solid #e6e8ef; border-radius: 12px; padding: 20px 22px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid #eef0f5; }
  thead th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #8a90a0; }
  tbody th { font-weight: 600; }
  td { font-variant-numeric: tabular-nums; }
  .bad { color: #b4232b; font-weight: 600; }
  .good { color: #1d7a4d; font-weight: 600; }
  ul.changes { margin: 0; padding-left: 20px; }
  ul.changes li { margin: 10px 0; }
  .pair { margin: 0 0 30px; }
  figcaption { font-size: 13px; font-weight: 600; color: #5b6172; margin: 0 0 10px; }
  .pair-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .shot { position: relative; background: #fff; border: 1px solid #e6e8ef; border-radius: 12px; overflow: hidden; }
  .shot img { display: block; width: 100%; height: auto; }
  .tag { position: absolute; top: 10px; left: 10px; z-index: 1; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 3px 8px; border-radius: 999px; }
  .tag.before { background: #fdecec; color: #b4232b; }
  .tag.after { background: #e6f5ec; color: #1d7a4d; }
  .mobile .pair-grid { grid-template-columns: 1fr 1fr; }
  footer { margin-top: 40px; color: #8a90a0; font-size: 12.5px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; background: #f0f1f6; padding: 1px 5px; border-radius: 5px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Signed-in web flow — before / after</h1>
  <p class="lede">
    The operator console's journey — sign in, register, the overview and the products catalog —
    captured from the running app at 1440px and 390px, before and after the responsive and
    accessibility pass. Before is committed <code>main</code>; after is this branch.
  </p>

  <h2>Measured, not asserted</h2>
  <div class="panel">
    <table>
      <thead>
        <tr>
          <th>View</th><th>H-overflow: before</th><th>after</th>
          <th>Content width</th><th>Table (visible / full)</th>
        </tr>
      </thead>
      <tbody>${metricRows}
      </tbody>
    </table>
  </div>

  <h2>What changed</h2>
  <div class="panel"><ul class="changes">${changes}
  </ul></div>

  <h2>Desktop — 1440px</h2>
  ${desktopShots}

  <h2>Mobile — 390px</h2>
  ${mobileShots}

  <footer>
    Generated by <code>generators/gen-before-after.mjs</code>, with the screens embedded.
    They are captured from the running app at 1440×900 and 390×844; see
    <code>ui/screens/README.md</code> for how to reproduce them.
  </footer>
</div>
</body>
</html>
`;

writeFileSync(join(UI, 'before-after.html'), page);
console.log('wrote ui/before-after.html —', SHOTS.length, 'screens,', METRIC_ROWS.length, 'metric rows');
