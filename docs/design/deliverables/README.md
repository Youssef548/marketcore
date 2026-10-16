# Design deliverables

Visual artefacts for the project. They are generated, not hand-drawn: the `generators/`
scripts are the source, and a rerun rewrites the committed output in place.

## What is here

| Path | What it is |
|---|---|
| `user-flows.html` | One page, every journey from live today to week 12 — click a step for what happens and why. **Hand-authored, not generated, and it predates CR-001**: it still shows the single-seller checkout. `flows/` is the current set. |
| `flows/` | One SVG per flow (21) + `index.html`. Actor swimlanes and an alternate-outcome lane. Includes the CR-001 buyer journeys: buy across two sellers, the stock-1 race through the cart, losing the last unit, the abandoned-checkout auto-cancel, the buyer refund request the seller approves, and one Release 2 journey (deliver and review). |
| `system-design/` | C4 context and containers (the buyer storefront in `apps/web`, the worker from phase 4), the module map (Storefront, Cart, Orders + Checkout, and the Release 2 modules), the entity map (Cart, CartItem, Checkout), and six sequence diagrams (refresh rotation, the multi-seller all-or-nothing checkout, the abandoned-checkout auto-cancel, webhook dedupe, outbox recovery, payout race). |
| `ui/stitch/` | **The UI, designed.** 37 Stitch `[Senior Craft]` screens — operator and storefront — the design source for every page (ADR 013, amended). See `ui/stitch/README.md`. |
| `ui/tokens.json` | The Quartz token set in Tokens Studio / W3C shape — 21 colour tokens, radius, type. Import into Figma so the design and the build share one vocabulary. Committed as a file; its generator was removed with the board. |
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

The screens come from Stitch project `3383911874392417631`, seeded from Quartz's `DESIGN.md`; their
content is the real seed data in `packages/database/prisma/seed.constants.ts` (Nile Traders,
*Nile Cotton Shirt*, E£249.00, stock 10).
The system-design diagrams derive from `docs/architecture.md` and `docs/domain-model.md`; the
storefront parts of both sets come from CR-001 and the storefront PRD in `docs/superpowers/specs/`.

The `flows/` and `system-design/` diagrams still carry their own categorical palette for encoding
actors and outcomes, so they are not re-tinted to Quartz. That is deliberate rather than an
oversight — a diagram's colour is a legend, not brand — and it is the one place the set is not one
palette.

## Viewing

Open the HTML files directly — they are self-contained and need no server:

```bash
open docs/design/deliverables/user-flows.html
open docs/design/deliverables/system-design/index.html
open docs/design/deliverables/ui/stitch/001-marketcore-seller-overview-dashboard-admin-senior-craft.html
```

## Regenerating

```bash
node docs/design/deliverables/generators/gen-flows.mjs
node docs/design/deliverables/generators/gen-system-design.mjs
node docs/design/deliverables/generators/gen-before-after.mjs
```

Each script writes beside itself and deletes the previous output, so the committed files are always
exactly what the current generator produces. `gen-before-after.mjs` reads `ui/screens/` (the PNGs and
their `metrics.json`), so the browser pass that produces those must run first — see
`ui/screens/README.md`.

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
