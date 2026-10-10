# Design deliverables

Visual artefacts for the project, produced alongside the build. They are generated, not
hand-drawn: the `generators/` scripts are the source, and a rerun rewrites the committed
SVG/HTML in place.

Everything here is derived from the repository's own documents, so it cannot drift from the
design it describes:

| Source | Used by |
|---|---|
| `docs/architecture.md` | system-design containers, modules |
| `docs/domain-model.md` | entity map, invariants |
| `docs/superpowers/specs/…design-system-design.md` (D40–D51) | the UI board's direction |
| `packages/ui/src/tokens.css` | every colour in every artefact — OKLCH converted to hex so Figma imports the real values |
| `packages/database/prisma/seed.constants.ts` | the UI board's content (Nile Traders, Nile Cotton Shirt, E£249.00, stock 10) |

## What is here

| Path | What it is |
|---|---|
| `user-flows.html` | One page, every journey from live today to week 12 — click a step for what happens and why. |
| `flows/` | The same flows as one SVG per diagram (16), plus `index.html`. Actor swimlanes and an alternate-outcome lane. |
| `system-design/` | C4 context and containers, the module map, the entity map, and five sequence diagrams (refresh rotation, checkout race, webhook dedupe, outbox recovery, payout race). `index.html` shows them all. |
| `ui/design-board.html` | The operator console designed to the end state — 13 frames: foundations, auth, dashboard, products, product detail, orders, order detail, refunds, payouts, members, operations, states. |
| `generators/` | The three Node scripts that produce the above. No dependencies; run with `node`. |

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

Each script writes beside itself and deletes the previous output, so the committed files are
always exactly what the current generator produces.

## Figma

The SVGs import as editable vectors, so `flows/` and `system-design/` come across as real
layers. `ui/design-board.html` is HTML/CSS — viewable and screenshot-able, but a browser
rasterises it rather than exporting layers; a Tokens Studio `tokens.json` generated from
`tokens.css` is the piece that would keep Figma variables in step with the code, and it is not
built yet.

## Not committed

Screenshot exports (`svg-export/`, `screens/`) are regenerated on demand rather than committed —
they are megabytes of binary whose content is already in the SVG and HTML above.
