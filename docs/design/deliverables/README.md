# Design deliverables

Visual artefacts for the project. They are generated, not hand-drawn: the `generators/`
scripts are the source, and a rerun rewrites the committed output in place.

## What is here

| Path | What it is |
|---|---|
| `user-flows.html` | One page, every journey from live today to week 12 — click a step for what happens and why. |
| `flows/` | The same flows as one SVG per diagram (16) + `index.html`. Actor swimlanes and an alternate-outcome lane. |
| `system-design/` | C4 context and containers, the module map, the entity map, and five sequence diagrams (refresh rotation, checkout race, webhook dedupe, outbox recovery, payout race). |
| `ui/design-board.html` | **The UI, designed — the chosen direction, Quartz.** 13 screens × 2 skins (Quartz light, Graphite dark): sign in, register, dashboard, products, product detail, orders, order detail, refunds, payouts, members, operations, foundations, states. |
| `ui/tokens.json` | The Quartz token set in Tokens Studio / W3C shape — 21 colour tokens, radius, type. Import into Figma so the design and the build share one vocabulary. |
| `generators/` | The three Node scripts that produce the above. No dependencies; run with `node`. |

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
```

Each script writes beside itself and deletes the previous output, so the committed files are always
exactly what the current generator produces.

## Not committed

Screenshot exports (`svg-export/`, `screens/`) are regenerated on demand rather than committed —
they are megabytes of binary whose content is already in the SVG and HTML above.

## Not yet done

The Quartz direction is designed and documented but **not applied to `packages/ui`**. That is a real
change to the shipped design system: it means new token values in `packages/ui/src/tokens.css`, the
contrast test in `packages/ui/test/tokens.spec.ts` re-derived against them, a re-skin of the
components and the web shell, and an ADR superseding 012. It is its own pull request.
