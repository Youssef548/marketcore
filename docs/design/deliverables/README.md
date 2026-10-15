# Design deliverables

Visual artefacts for the project. They are generated, not hand-drawn: the `generators/`
scripts are the source, and a rerun rewrites the committed output in place.

## What is here

| Path | What it is |
|---|---|
| `user-flows.html` | One page, every journey from live today to week 12 — click a step for what happens and why. |
| `flows/` | The same flows as one SVG per diagram (16) + `index.html`. Actor swimlanes and an alternate-outcome lane. |
| `system-design/` | C4 context and containers, the module map, the entity map, and five sequence diagrams (refresh rotation, checkout race, webhook dedupe, outbox recovery, payout race). |
| `ui/design-board.html` | **The UI, designed — the chosen direction, Quartz.** 37 screens × 2 skins (Quartz light, Graphite dark), now in the Stitch redesign, plus two tabs showing Stitch's HTML unchanged for comparison. Two surfaces on one token set: the **seller console** (dashboard, products, product detail, new product, media & variants, inventory, promotions, orders, order detail, fulfil, refunds, payouts, store settings, members, operations) behind the 252px rail, and the **buyer storefront** (home, browse, category, search, seller store, product, reviews, cart, checkout, confirmation, orders, account) on the public chrome. Plus sign in, register, first run, and the two reference sheets — foundations and states. |
| `ui/stitch/` | **The Stitch redesign, unchanged.** Both passes Stitch made of all 37 screens in project `3383911874392417631` — `plain/` (the original pass, with product photos — the one the board is built from) and `craft/` (the `[Senior Craft]` alternative) — byte for byte, with `manifest.json` recording each screen's Stitch title, id and viewport. The board's two Stitch tabs load these in iframes at that viewport. `plain/` pulls the Tailwind CDN, so those tabs need a network connection. |
| `generators/stitch-port/` | **The Stitch redesign, ported into the generator** — one fragment per screen, from the original pass (the one with product photos): Stitch's Tailwind compiled to static CSS scoped to that screen, its fonts inlined under per-screen family names, and every Quartz colour literal turned into its token. The Quartz and Graphite tabs render these in place of the screen functions. In Quartz each one matches Stitch's own render at 1280px — 25 to the pixel, the other 12 within the noise Stitch's page shows against itself (animated status dots, a skeleton shimmer, photo decoding). |
| `ui/tokens.json` | The Quartz token set in Tokens Studio / W3C shape — 21 colour tokens, radius, type. Import into Figma so the design and the build share one vocabulary. |
| `ui/DESIGN.md` | **The system as rules an agent can follow** — the two surfaces, every token and its role, the measured contrast contract in both themes, the type scale, component rules, the accessibility contract, the anti-patterns that caused real bugs, and the honest gaps. This is the file a design tool imports and a coding agent reviews against; it is generated from the same values as the board, so it cannot drift from it. |
| `ui/before-after.html` | **The shipped flow, before and after the responsive and accessibility pass** — 7 screens × 2 states, self-contained, with the layout numbers beside them. |
| `ui/screens/` | The before/after PNGs and `metrics.json` — **not committed** (gitignored), captured on demand. See `ui/screens/README.md`. |
| `generators/` | The Node scripts that produce the above. No dependencies; run with `node`. |

## The direction: Quartz

Chosen from five explored directions and then a structure pass against a reference dashboard.
Quartz is: a **252px dark rail** (`#0b0d14`) with grouped nav and a ⌘K search, a cool near-white
canvas (`#f6f7fb`), near-black ink, **DM Sans** with **DM Mono** for numerals, one indigo action
(`#4f46e5`), 12px cards on a 1px hairline with a soft shadow.

The structure is the point, not the colour. Each screen carries: a breadcrumb top bar with global
search, notifications and a user chip; a page header with a range control and an export; **KPI cards
with delta chips and sparklines**; real **charts**; and tables with **share bars**, sparkline columns
and semantic **status pills**. Colour is one variable set — `Graphite` is the same structure, dark,
kept as the Operations theme.

`tokens.json` is the machine-readable half: it is what keeps a Figma library in step with the code
instead of a screenshot that goes stale.

## Provenance

The UI board's tokens are defined in `generators/gen-ui.mjs`; the content is the real seed data in
`packages/database/prisma/seed.constants.ts` (Nile Traders, *Nile Cotton Shirt*, E£249.00, stock 10).
The system-design diagrams derive from `docs/architecture.md` and `docs/domain-model.md`.

The `flows/` and `system-design/` diagrams still carry their own categorical palette for encoding
actors and outcomes, so they are not re-tinted to Quartz. That is deliberate rather than an
oversight — a diagram's colour is a legend, not brand — and it is the one place the set is not one
palette.

## Viewing

Open the HTML files directly — they are self-contained and need no server:

```bash
open docs/design/deliverables/user-flows.html
open docs/design/deliverables/system-design/index.html
open docs/design/deliverables/ui/design-board.html
```

## Regenerating

```bash
node docs/design/deliverables/generators/gen-flows.mjs
node docs/design/deliverables/generators/gen-system-design.mjs
node docs/design/deliverables/generators/gen-ui.mjs
node docs/design/deliverables/generators/gen-before-after.mjs
```

Each script writes beside itself and deletes the previous output, so the committed files are always
exactly what the current generator produces. `gen-before-after.mjs` reads `ui/screens/` (the PNGs and
their `metrics.json`), so the browser pass that produces those must run first — see
`ui/screens/README.md`.

`import-stitch.mjs` brings a Stitch redesign back: given the Stitch `list_screens` result and a folder
of each screen's downloaded `htmlCode` (named `<screen-id>.html`), it rewrites `ui/stitch/`.
`port-stitch.mjs` then turns a pass into `generators/stitch-port/` — it opens each page in a real
browser (the `@playwright/test` that `apps/e2e` already depends on) and needs network access for
Stitch's Tailwind CDN, fonts and images. Rerun `gen-ui.mjs` after it.

```bash
node docs/design/deliverables/generators/import-stitch.mjs <list_screens.json> <html-dir>
node docs/design/deliverables/generators/port-stitch.mjs plain
node docs/design/deliverables/generators/gen-ui.mjs
```

`gen-ui.mjs --stitch` additionally writes `ui/screens/stitch/`: the board split into one
self-contained HTML file per screen, plus `routes.tsv`, for uploading into a design tool that takes
one page per file (Stitch does). It is generated on demand and gitignored, like the screenshot
exports.

## Not committed

Screenshot exports (`svg-export/`, `ui/screens/`) are regenerated on demand rather than committed —
they are megabytes of binary whose content is already in the SVG and HTML above. `ui/before-after.html`
is self-contained for the same reason: it embeds its screenshots rather than linking the uncommitted
files, so it opens and renders anywhere.

## Not yet done

The Quartz direction is designed and documented but **not applied to `packages/ui`**. That is a real
change to the shipped design system: it means new token values in `packages/ui/src/tokens.css`, the
contrast test in `packages/ui/test/tokens.spec.ts` re-derived against them, a re-skin of the
components and the web shell, and an ADR superseding 012. It is its own pull request.
