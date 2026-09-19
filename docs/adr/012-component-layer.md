# 012 Keep the component layer hand-rolled, and adopt Radix a widget at a time

- **Date:** 2026-09-19
- **Status:** Accepted
- **Phase:** the web design system (`docs/superpowers/specs/2026-09-19-marketcore-design-system-design.md`, D44)
- **Implements:** `feat/web-design-system`

## Context

`packages/ui` has zero runtime dependencies. The design system needs Button, Input, Label, Alert and
Field now, and will need a dialog, a combobox and a popover before long. shadcn/ui is the conventional
answer, is well built, and ships those widgets wired to Radix's accessibility behaviour.

Adopting it would add Radix, `cva`, `clsx` and `tailwind-merge` to a package that depends on nothing.
The load-bearing objection is smaller and sharper than the dependency count: our semantic token names
would have to become shadcn's (`background`/`foreground`/`primary`/`muted`/`border`/`ring`), or gain a
mapping layer between the two vocabularies. A mapping layer is a second source of truth for what a
colour means, which is the thing this repository refuses everywhere else — the same argument that
keeps tenant isolation in one query layer (ADR 010) and the API's route prefix in one constant.

The direction also matters here. Selvedge's signature moves are a 3px status thread down a table row's
leading edge and a quantity drawn as length. Neither is a shadcn component, so they would sit against
that library's conventions rather than with them.

## Decision

Components stay hand-rolled in `packages/ui`, marked `'use client'`, styled with Tailwind utilities
that reference the semantic tokens and nothing else. The day a dialog, combobox or popover is needed,
the Radix primitive for **that widget** is adopted, and nothing else is.

## Alternatives considered

- **shadcn/ui as the component layer** — rejected for the three reasons above: runtime dependencies in
  a package that has none, a second vocabulary for the same tokens, and a component set whose
  conventions this direction does not follow.
- **Adopt Radix now, ahead of a caller** — rejected as the scaffolding the phase gate forbids. A
  primitive nothing renders is a dependency justified by a guess; it is the line this phase already
  drew when it deferred the status thread and the quantity track for having no caller (D48).
- **A `cva`-style variant helper** — rejected as unnecessary at five components and two variants
  each. A `Record<Variant, string>` is the whole mechanism, and it is readable without knowing the
  library.

## Trade-offs

Radix's keyboard interaction, focus trapping, collision-aware positioning and aria wiring are real
work, and doing them by hand is only as good as the review that checks them. Two of the properties
this decision puts at risk are made checkable — contrast by `packages/ui/test/tokens.spec.ts`, and the
field-error association by `packages/ui/test/field.spec.tsx` — and the rest are not. A dialog built
later will be responsible for its own focus management, and that responsibility is not visible in any
test this phase writes.

## Consequences

- Adding a runtime dependency to `@app/ui` now needs a superseding ADR, not a pull request.
- Accessibility for a widget is tested when the widget exists rather than asserted in advance.
- The semantic token names are the design system's interface, and nothing translates them: the
  vocabulary in `tokens.css` is the vocabulary in the components and the pages.
- `packages/ui` gains test tooling (Vitest, jsdom, Testing Library) but stays dependency-free at
  runtime, which is what D44 constrains.

## Review date

2026-12-19
