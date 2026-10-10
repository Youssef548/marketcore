# 013 Adopt Quartz as the design direction

- **Date:** 2026-10-10
- **Status:** Accepted
- **Phase:** the design system, after the first web slice
- **Supersedes:** the direction fixed by D42 in `docs/superpowers/specs/2026-09-19-marketcore-design-system-design.md`
- **Implements:** `design/quartz-tokens`, `design/quartz-shell`

## Context

The first direction, selvedge, was chosen by rendering five options against the same screens and
picking by looking (D40–D42). It was then built, and building it produced a different kind of
evidence from choosing it: the app was plain in a way the mockups had not been. The palette was
warm and low-contrast, the shell was a rail and a bar with very little in them, and every screen was
a heading over a list. Nothing was broken; it simply did not look like a product anyone would pay for.

Two rounds followed, both rendered rather than argued.

1. **Five directions on one screen** — Meridian (editorial light), Vector (dark product), Ledger
   (enterprise light), Plume (soft calm), Signal (neo-brutalist) — so the comparison was of the same
   content under different type, colour, depth, density and radius.
2. **A structure pass.** The gap was not colour. A reference dashboard was measured rather than
   admired — its type, its rail width, its page-header controls, its KPI cards, its charts, its
   tables — and the *structure* was rebuilt: grouped navigation, a breadcrumb top bar, a header with a
   range control and an export, KPI cards with delta chips and sparklines, real charts, and tables with
   share bars, a sparkline column and semantic status pills.

Quartz is that structure with its own skin. It was picked by looking at all of it, which is the only
way a direction can be picked.

## Decision

Quartz is the design direction: a dark navy rail (252px), a cool near-white canvas, near-black ink,
one indigo action colour, crimson reserved for attention and emerald for healthy, DM Sans with DM Mono
for numerals, 12px cards on a 1px hairline.

**The twenty-three semantic token names are unchanged.** This is a change of values and of what the
components paint, not of the interface between the design system and the pages — no page changed a
class name, and `packages/ui/test/tokens.spec.ts` still asserts the same twenty-three names.

## Alternatives considered

- **Keep selvedge** — rejected by looking at the built app, which is the only evidence that matters
  for a direction. The mockups were judged on the same screens and won; the app lost.
- **Meridian, Vector, Ledger, Plume, Signal** — each rendered against the same screen and rejected
  with a reason rather than a preference. Ledger and Vector were the closest: Ledger's density is
  right for an operator console but its chrome reads as unowned, and Vector's dark-first register is
  excellent for the Operations surface specifically, which is why it survives as Graphite rather than
  being discarded.
- **Adopt the reference's look wholesale** — rejected because its product is subscriptions and ours is
  inventory and money. What transferred was the structure: the rail, the header controls, the KPI card,
  the chart, the table. What did not was its content.
- **Add the tokens the board uses but no component renders yet** (warning amber, info blue) —
  rejected as the scaffolding this repository refuses everywhere else: no component paints them, so
  they arrive with the component that does.

## Trade-offs

- **The vivid values did not survive measurement.** Drawn as intended, ten of the twenty-five
  text-on-surface pairs the components actually paint fell short of 4.5:1 — `ink-faint` at 2.3:1 on
  `sunken`, emerald at 3.0:1 on `panel`, crimson at 4.1:1 on its own wash. Each was darkened along its
  own hue until it passed, so what ships is duller than what was drawn. This is the cost of the
  contrast test being a gate rather than a promise, and it is the right way round: the drawn values are
  a proposal and the test is the ruling.
- **Only one theme ships.** Graphite (dark) exists in the board and in `ui/tokens.json` as a second
  value set, but `apps/web` renders one light theme and `color-scheme: light` says so. A dark theme is a
  second palette in `tokens.css` plus the switch that selects it, and neither is in this change.
- **The diagrams keep their own palette.** `flows/` and `system-design/` colour by actor and outcome
  rather than by brand, because in a diagram colour is a legend. They are the one place the set is not
  one palette, and it is stated rather than left to be noticed.
- **DM Sans and DM Mono are fetched at build time** by `next/font`, so a build without network cannot
  produce the app. Geist was fetched the same way, so this is not new; it is now two families rather
  than two weights of one.

## Consequences

- `packages/ui/src/tokens.css` is Quartz's, and it is still the one file that changing the app's look
  means changing.
- `packages/ui` gained a `secondary` button variant and lost `ghost`. A bordered ghost was a name that
  lied about what it painted.
- The direction lives in an ADR now rather than only in a spec, because it has been changed once and a
  spec that records a superseded direction is not where the current one should be found.
- The reference for a future direction is evidence rather than taste: five rendered options, one
  structure pass, and a contrast test that can refuse any of them.
- ADR 012 is unaffected — the component layer is still hand-rolled and Radix still arrives per widget.
  Only its description of selvedge's signature moves is amended.

## Review date

2027-01-10
