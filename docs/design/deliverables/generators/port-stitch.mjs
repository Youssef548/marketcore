import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/*
 * Ports a Stitch pass from ui/stitch/<pass>/ into generators/stitch-port/, which
 * gen-ui.mjs renders in place of the screen functions.
 *
 *   node port-stitch.mjs [pass=plain] [screen-id ...]
 *
 * Stitch writes Tailwind through its CDN script, which the board cannot load — its
 * preflight would restyle every other screen. So each page is opened in a real browser
 * at the viewport Stitch rendered it at, and the CSS the CDN generated is read back
 * through the CSSOM: every rule is scoped under a wrapper class of its own, media
 * queries are resolved for that viewport, `vh` becomes pixels and `fixed` becomes
 * `absolute` (the frame scrolls inside the board, not the window). Colour literals that
 * are exactly a Quartz token become `var(--token)`, so Quartz renders identically and
 * Graphite follows the skin.
 *
 * Needs @playwright/test, which apps/e2e already depends on, and network access for
 * the Tailwind CDN and Stitch's images.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..', '..');
const UI = path.join(HERE, '..', 'ui');
const OUT = path.join(HERE, 'stitch-port');
const { chromium } = createRequire(path.join(ROOT, 'apps', 'e2e', 'package.json'))('@playwright/test');

const [pass = 'plain', ...only] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(path.join(UI, 'stitch', 'manifest.json'), 'utf8'));
const ids = only.length ? only : Object.keys(manifest);

/* Quartz, as gen-ui.mjs defines it (gen-ui is a script, not a module). */
const QUARTZ = {
  canvas: '#f6f7fb', panel: '#ffffff', panel2: '#f1f3f9', rail: '#0b0d14',
  railInk: '#eef1f7', railMuted: '#8b93a7', ink: '#0a0b12', muted: '#5a6272', faint: '#676e7a',
  line: '#e6e8ef', lineStrong: '#d5d9e2', controlEdge: '#838b9a', accent: '#4f46e5', accentWash: '#eef0ff',
  ok: '#117f3a', okWash: '#e8f7ee', bad: '#d11b43', badWash: '#fdecef', warn: '#a55a05', warnWash: '#fdf3e4',
  info: '#097499', grid: '#eef0f5',
};
/* White is left literal: it is text on an accent fill as often as text on the dark
   rail, and no single token is right for both. gen-ui's Graphite pass maps it. */
const BY_HEX = Object.fromEntries(Object.entries(QUARTZ).filter(([k]) => k !== 'panel').map(([k, v]) => [v, k]));
const hex = (r, g, b) => '#' + [r, g, b].map((x) => Math.round(+x).toString(16).padStart(2, '0')).join('');
const tokeniseValue = (value) => value
  .replace(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*((?:[^()]|\([^()]*\))*?))?\s*\)/g, (m, r, g, b, a) => {
    const t = BY_HEX[hex(r, g, b)];
    const alpha = a === undefined || /var\(/.test(a) ? 1 : a.trim().endsWith('%') ? parseFloat(a) / 100 : +a;
    if (!t) return alpha === 1 ? hex(r, g, b) : `rgba(${r},${g},${b},${alpha})`;
    return alpha === 1 ? `var(--${t})` : `color-mix(in srgb, var(--${t}) ${+(alpha * 100).toFixed(2)}%, transparent)`;
  })
  .replace(/#[0-9a-f]{6}\b/gi, (h) => (BY_HEX[h.toLowerCase()] ? `var(--${BY_HEX[h.toLowerCase()]})` : h));
/* A page that restates a token as its own custom property (`--ink: #0a0b12`) would
   otherwise become `--ink: var(--ink)` — a cycle, which the browser discards. Dropping
   the restatement lets the skin's value through; other custom properties stay literal. */
const tokeniseDecls = (decls) => decls.replace(/([a-z-]+)(\s*:\s*)([^;{}]+);?/gi, (m, prop, colon, value) => {
  if (prop.startsWith('--')) return QUARTZ[prop.slice(2)] && QUARTZ[prop.slice(2)] === value.trim().toLowerCase() ? '' : m;
  return prop + colon + tokeniseValue(value) + (m.trimEnd().endsWith(';') ? ';' : '');
});

/* Class names the board stylesheet already styles; Stitch's copies are renamed. */
const boardCss = fs.readFileSync(path.join(HERE, 'gen-ui.mjs'), 'utf8').match(/const css = `([\s\S]*?)`;/)[1];
const BOARD_CLASSES = new Set([...boardCss.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)].map((m) => m[1]));

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const id of ids) {
  const shot = manifest[id][pass];
  const W = 'sx-' + id;
  const page = await browser.newPage({ viewport: { width: shot.w, height: shot.h } });
  await page.goto('file://' + path.join(UI, 'stitch', pass, id + '.html'));
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);

  const got = await page.evaluate(async ({ W, h }) => {
    // Split a selector list on top-level commas only — `:is(a, b)` stays whole.
    const split = (list) => {
      const out = []; let depth = 0, cur = '';
      for (const ch of list) {
        if (ch === '(' || ch === '[') depth++;
        if (ch === ')' || ch === ']') depth--;
        if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
      }
      return out.concat(cur.trim()).filter(Boolean);
    };
    const scope = (sel) => {
      if (sel === '*') return [`.${W}`, `.${W} *`];
      let m = sel.match(/^(?::root|html|:host)((?:[.#[:][^\s>+~]*)?)(.*)$/);
      if (m) return [`.${W}${m[1]}${m[2]}`];
      m = sel.match(/^body((?:[.#[:][^\s>+~]*)?)(.*)$/);
      if (m) return [`.${W} > .sx-body${m[1]}${m[2]}`];
      // `<html>`'s classes sit on the wrapper itself, so a rule that starts with a class
      // or attribute also has to match the wrapper, not only what is inside it.
      return /^[.[]/.test(sel) ? [`.${W} ${sel}`, `.${W}${sel}`] : [`.${W} ${sel}`];
    };
    const decls = (style) => style.cssText
      .replace(/position:\s*fixed/g, 'position: absolute; will-change: transform')
      .replace(/(-?[\d.]+)vh\b/g, (m, n) => `${(+n * h) / 100}px`);
    const walk = (rules) => [...rules].map((r) => {
      if (r instanceof CSSStyleRule) return `${split(r.selectorText).flatMap(scope).join(',')}{${decls(r.style)}}`;
      if (r instanceof CSSMediaRule) return matchMedia(r.conditionText).matches ? walk(r.cssRules) : '';
      if (r instanceof CSSSupportsRule) return `@supports ${r.conditionText}{${walk(r.cssRules)}}`;
      if (r instanceof CSSImportRule) return '';
      return r.cssText; // keyframes, font-face
    }).join('');
    // Linked and @imported stylesheets (Google Fonts) are fetched and inlined, so their
    // @font-face rules can be renamed per screen: Stitch's DM Sans is not the board's,
    // and under one family name the two would mix.
    const own = [...document.styleSheets].filter((s) => s.ownerNode && s.ownerNode.tagName === 'STYLE');
    const hrefs = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href)
      .concat(own.flatMap((s) => [...s.cssRules].filter((r) => r instanceof CSSImportRule).map((r) => r.href)));
    const fetched = [];
    for (const href of [...new Set(hrefs)]) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(await (await fetch(href)).text());
      fetched.push(sheet);
    }
    const families = [...new Set(fetched.flatMap((s) => [...s.cssRules].filter((r) => r instanceof CSSFontFaceRule).map((r) => r.style.getPropertyValue('font-family').replace(/["']/g, '').trim())))];
    const css = [...fetched, ...own].map((s) => walk(s.cssRules)).join('');
    return { css, families, htmlClass: document.documentElement.className, bodyClass: document.body.className, bodyStyle: document.body.getAttribute('style') || '' };
  }, { W, h: shot.h });
  await page.close();

  // Markup from the source file — what Stitch wrote, not what the CDN's script left.
  const src = fs.readFileSync(path.join(UI, 'stitch', pass, id + '.html'), 'utf8');
  let body = src.slice(src.indexOf('>', src.indexOf('<body')) + 1, src.lastIndexOf('</body>'))
    .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const used = new Set([...body.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).concat(got.bodyClass.split(/\s+/), got.htmlClass.split(/\s+/)).filter(Boolean));
  const clash = [...used].filter((c) => BOARD_CLASSES.has(c));
  const ren = (c) => (clash.includes(c) ? 'sx-' + c : c);
  const reclass = (list) => list.split(/\s+/).filter(Boolean).map(ren).join(' ');
  body = body.replace(/class="([^"]*)"/g, (m, c) => `class="${reclass(c)}"`)
    .replace(/ style="([^"]*)"/g, (m, d) => ` style="${tokeniseDecls(d)}"`);
  // An SVG presentation attribute cannot take var(); a token colour moves into style.
  body = body.replace(/ (fill|stroke)="(#[0-9a-fA-F]{6})"/g, (m, attr, h) => (BY_HEX[h.toLowerCase()] ? ` style="${attr}:var(--${BY_HEX[h.toLowerCase()]})"` : m));
  let css = got.css;
  for (const c of clash) css = css.replace(new RegExp('\\.' + c.replace(/[-]/g, '\\-') + '(?![\\w-])', 'g'), '.sx-' + c);
  css = css.replace(/\{([^{}]*)\}/g, (m, d) => `{${tokeniseDecls(d)}}`);
  const refamily = (text) => got.families.reduce((s, f) => s.replace(new RegExp(`(["']?)${f.replace(/ /g, ' ')}\\1(?=\\s*[,;}"]|\\s*$|\\s*!)`, 'g'), `"${f} ${W}"`), text);
  css = refamily(css);
  body = body.replace(/ style="([^"]*)"/g, (m, d) => ` style="${refamily(d.replace(/&quot;/g, "'")).replace(/"/g, "'")}"`);
  // The board's body rules would otherwise be inherited; Stitch's page started from the UA defaults.
  css = `.${W}{position:relative;height:100%;font:400 16px/normal Times,serif;letter-spacing:normal;color:#000;-webkit-font-smoothing:auto;text-align:left}` + css;

  const meta = { title: shot.title, screen: shot.screen, pass, w: shot.w, h: shot.h, frame: `height:${shot.h}px`, links: [] };
  fs.writeFileSync(path.join(OUT, id + '.html'),
    `<!-- ${JSON.stringify(meta)} -->\n<style>${css}</style>\n<div class="${W} ${reclass(got.htmlClass)}"><div class="sx-body ${reclass(got.bodyClass)}" style="${tokeniseDecls(got.bodyStyle)}">\n${body.trim()}\n</div></div>\n`);
  results.push(`${id}${clash.length ? ` (renamed: ${clash.join(' ')})` : ''}`);
}
await browser.close();
console.log(`ported ${results.length} ${pass} screens → generators/stitch-port/\n  ${results.join('\n  ')}`);
