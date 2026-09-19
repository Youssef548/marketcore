# MarketCore — the web design system (design)

**Phase:** the first design-system phase, on top of the web auth slice (`feat/web-auth-session`).
**Precedes:** the implementation plan (`docs/superpowers/plans/`), and therefore the products page.

Decisions continue the repository's sequence: D1–D17 are the platform design, D18–D28 the week-2
tenancy and catalog design, D29–D39 the web session design. This document continues at **D40**.

**The question this phase answers:** what is the app's design *system* — not a skin — and what
proves it is one?

---

## Context

`apps/web` works and is styled by accident. `packages/ui/src/tokens.css` still holds only the
template's emerald ramp (`--color-brand-50`…`900`) and `--radius-brand`; `button.tsx` paints with
`bg-brand-600`; the pages paint with `text-gray-600`, `border-gray-300`, `text-gray-700`. There is
no *semantic* layer at all — nothing named for the job a colour does.

The consequence is not that the app looks bad. It is that there is nowhere to change the design.
Switching the app's look today means editing four components and seven page files, and the products
page would then match the session page by hand, which is how two pages that were once identical
drift apart.

Five directions were drawn and rendered against the same screens before this spec was written
(`docs/design/index.html`, a working artifact and deliberately not committed). The decision below
is the outcome of looking at them, not a preference stated in the abstract.

---

## D40 — The design system is a token layer plus components, in `@app/ui`

`packages/ui` gains the semantic layer it is missing; the components read from it. One direction
ships, not five.

Five switchable themes was considered and rejected: each theme is another set of text-on-surface
pairs to keep above 4.5:1, and this is one product with one identity. The exploration files are the
record of how the direction was chosen; the app carries the direction that won.

**Observable:** changing the app's look is a change to one file, and the contrast test re-reads it.

## D41 — Three token layers, and components name roles rather than colours

```
palette      raw OKLCH values, named by colour family, never by role
semantic     what components reference — named for the job, never the hue
direction    one set of palette values, in tokens.css
```

The semantic names are the interface. Declared as `--color-*` so Tailwind 4 generates the
utilities:

```
surface   canvas · panel · sunken · rail · rail-edge
text      ink · ink-muted · ink-faint · ink-on-action · ink-on-rail
edge      rule · rule-strong
action    action · action-hover · action-ink
state     attention · attention-wash · positive · positive-wash
control   focus-ring
```

Spacing is **not** redefined: Tailwind's default scale is a 4px step already, and a second scale
would be a second thing to keep in agreement.

**Rejected:** naming semantic tokens after hues (`--color-indigo-700`). It reads as a palette and
behaves like one — the moment the direction changes, every component's class name becomes a lie.

**Where the values come from.** This spec fixes the architecture and the direction; it does not list
OKLCH values. They are carried over from the exploration set, which was already measured — every
text-on-surface pair in the five directions was computed and corrected until it cleared 4.5:1, and
selvedge's set is the one those measurements were taken from. The implementation plan pins the
literal values into `tokens.css`, and the contrast test (D49) re-derives the same numbers, so a value
transcribed wrongly fails rather than ships.

## D42 — The direction is selvedge

Indigo chrome, undyed-linen canvas, warm dark ink, a single indigo action colour, and madder red
reserved for attention.

It won for a reason that is not aesthetic preference: it is the only one of the five whose
vocabulary comes from the goods rather than from software. The product holds physical stock and was
seeded with Egyptian cotton textiles — dye, thread, selvedge. Its signature move is structural
rather than decorative: a 3px thread down the leading edge of each table row, coloured by status, so
the one row an operator is hunting for is findable by scanning the left margin without reading a
word.

**Rejected, with reasons:**

- **tally** (white canvas, light bordered rail, quantity drawn as length) — calm and disciplined,
  and its quantity track is a genuinely good information idea. Rejected as the *direction* because a
  rail defined only by a border reads as an absence rather than a plane, and the app's shell is
  built around that plane. Its track is not lost: it belongs beside the numbers when the catalog
  page arrives.
- **nightshift** (warm charcoal, amber action, rail lighter than the canvas) — the most striking,
  and the right answer for a screen that is open all day. Rejected because a saturated amber as the
  *primary action* fights the one thing the app asks an operator to do repeatedly.
- **copperplate** — coherent, but its instrument-panel feel comes mostly from borders and bevels,
  which read as texture rather than as information.
- **shadcn/ui's own theme** — the safe, conventional answer. Rejected because it is the same
  monochrome-plus-near-black-action that every other product reaches for, and because adopting the
  component layer would have meant expressing our token names in shadcn's vocabulary. See D44.

## D43 — State colours are literal values, not computed at runtime

`color-mix()` and relative colour syntax are legitimate, and were used in the exploration file. They
are rejected here: a colour computed at runtime cannot be contrast-checked before it ships, and the
contrast test (D49) has to read the same values the browser will.

**Consequence:** the palette carries the handful of extra steps that would otherwise be computed —
the attention hue needs its base step and its wash as two literal values, not one value and a mix.
Those are palette steps named for the colour family (`--palette-madder-600`), with the semantic
`--color-attention` pointing at one of them. The two layers must not borrow each other's names: the
moment a palette step is called `attention`, D41 has been quietly undone.

## D44 — Components stay hand-rolled; Radix arrives per-widget, when a widget needs it

`packages/ui` has zero runtime dependencies today and keeps them. Components are `'use client'`,
styled with Tailwind utilities that reference semantic tokens.

**Rejected:** adopting shadcn/ui as the component layer. It is a real, well-built system and the
right answer for some projects. It was rejected here for three stated reasons: it would add Radix,
`cva`, `clsx` and `tailwind-merge` to a package that depends on nothing; our semantic token names
would have to become shadcn's (`background`/`foreground`/`primary`/`muted`/`border`/`ring`) or gain
a mapping layer, which is a second source of truth — the thing this repository refuses everywhere
else; and the direction's signature moves are not shadcn components, so they would sit against the
convention rather than with it.

**Not deferred silently:** the day a dialog, combobox or popover is needed, the Radix primitive for
*that widget* is adopted and nothing else. shadcn's value peaks exactly where we have no caller yet.

## D45 — `Field` is added, and it fixes a defect this phase would otherwise repeat

`Label`, `Input` and the field's error message, wired together once.

This is not a convenience. The login and register forms currently render a field error without an
`aria-describedby` linking it to the input, so a screen reader announces the input and never mentions
the error. Four fields across two forms are wrong in the same way, which is the argument for a
reusable component stated exactly: wire it once, and every field inherits it.

**Observable:** a component test asserts the input's `aria-describedby` resolves to the element
carrying the message, and fails if the association is removed.

## D46 — `busy` uses `aria-busy` and `aria-disabled`, never `disabled`

A genuinely `disabled` submit button drops keyboard focus, so a keyboard user is thrown back to the
top of the form mid-submit. `aria-disabled` keeps the button focusable and announced as unavailable,
and the click handler is guarded, so a double submit is still impossible.

## D47 — The shell lives in `apps/web`, not in `@app/ui`

The rail knows about organizations, sessions and routing. The design system does not. `@app/ui` holds
what is true of the design system in any app; `apps/web` holds this app's chrome.

**Observable:** a rail that needed a session type would be a boundary violation, and the boundary is
already a build error.

## D48 — Catalog-only tokens are deferred to the catalog phase

The status thread, the quantity track, and the `published`/`draft` state colours are part of the
direction and none of them has a caller in this phase — nothing in scope renders a table.

**Consequence, stated honestly:** selvedge lands here as its palette, its plane and its type; its
signature arrives with the first table. That is a smaller loss than shipping a thread token nothing
draws, and it is the same line this repository drew when it removed `ARCHIVED` from `ProductStatus`
for having no endpoint able to reach it.

## D49 — Contrast is a test, not a promise

A unit test reads the token values and asserts every text-on-surface pair clears 4.5:1 — the same
computation the exploration file performs, run in CI rather than on a page.

This is the mechanism that makes "accessible" checkable. It is also what makes D43 load-bearing: the
test can only read literal values.

## D50 — The theme is light, and the test that asserts it stops naming a colour

`apps/web/src/app/globals.css` already sets `color-scheme: light` and deliberately does not follow
the operating system, for the reason the previous phase recorded: half a theme is worse than one.

The behavioural test currently asserts the page background is exactly `rgb(255, 255, 255)`, and that
the field's background is exactly `rgb(255, 255, 255)` too. Selvedge's canvas is linen and its panels
are a warm near-white, so both assertions break. Neither should survive in that form, because each
asserts *a colour* where the intent was to assert *a property*.

What the test should assert instead, all under an emulated dark operating system:

- `color-scheme` is `light` — unchanged, and still the thing that stops the OS deciding;
- the page background is light, measured as relative luminance above 0.7, and the body text against
  it clears 7:1 — so a future dark direction fails loudly rather than silently;
- the primary action still has a non-transparent background that differs from the page it sits on —
  this is the assertion that caught the unstyled button, and it is colour-independent.

**Consequence:** the test no longer fails when the direction changes, and still fails if the theme
starts following the OS, or if a component stops being painted at all — which are the two properties
it was written to protect.

## D51 — The work is a stacked pull request on the auth slice

A new branch off `feat/web-auth-session`, with its own pull request based on that branch, retargeted
to `main` once the auth slice merges.

`apps/web`'s first real screens exist only on that branch, so the design work cannot branch from
`main`. Adding it to the auth pull request was rejected: that change is already 73 files across
contracts, api, web, e2e and infra, and a reviewer should be able to judge "does auth work" and "is
this the right design system" as two separate reads.

**Risk, stated:** the base branch must not be force-pushed while the stacked pull request is open, or
the stacked pull request breaks. `git-delivery-workflow` records that failure mode.

---

## Out of scope

- **The products page and its table.** The rail's navigation has one entry because one section
  exists; the thread, the quantity track and the published/draft colours arrive with it (D48).
- **Dark mode.** There is one light theme, and `color-scheme: light` says so. A dark palette belongs
  in `tokens.css` beside this one, not as a media query the components know nothing about.
- **A component kit ahead of its pages.** No `Table`, `Badge`, `Dialog` or `Status` until a page
  renders one.
- **Density as a user setting**, motion, and view transitions.

## What this phase does not prove

- **Nothing about how it looks, measured.** The tests prove contrast, wiring and states. Whether
  selvedge is *good* is a judgement a person makes by looking, and no assertion in this repository
  can carry it.
- **No load or bundle measurement.** `@app/ui` stays dependency-free, which makes a regression
  unlikely rather than measured.
- **No visual regression testing.** A pixel-diff harness was considered and refused: the repository
  has no stable rendering environment for it, and a flaky visual gate is worse than none.

## Deliverables

1. The semantic token layer and selvedge's values in `packages/ui/src/tokens.css`.
2. `Button` (variants, sizes, `busy`), `Input` (sizes, `invalid`, focus ring), `Label`, `Alert`,
   and the new `Field`.
3. The rail shell in `apps/web`, with the tenant and its organization picker in the rail and the page
   title and signed-in user in the top bar — each thing in one place, because the exploration mockups
   duplicated both and that duplication was a mistake.
4. Sign-in, register and the session screen rebuilt on the primitives, with no ad-hoc grey left.
5. The contrast test (D49) and the palette-agnostic style assertion (D50).
6. ADR 012, recording the component-layer decision with shadcn as the rejected alternative, and the
   row it needs in `docs/adr/README.md`.
7. `docs/superpowers/STATUS.md` evidence for the phase.
