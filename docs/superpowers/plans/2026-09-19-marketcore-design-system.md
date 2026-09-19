# MarketCore — the web design system implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `packages/ui` gains the semantic token layer it is missing, the components read from it, and
`apps/web` is rebuilt on it — rail shell, sign-in, register and the session screen — with contrast as
a test rather than a promise.

**Architecture:** Three token layers in `packages/ui/src/tokens.css` — palette (raw OKLCH, named by
colour family), semantic (named for the job, declared as `--color-*` so Tailwind 4 generates the
utilities), and the direction (selvedge's one set of palette values). Components are hand-rolled,
`'use client'`, dependency-free, and name roles rather than colours. `apps/web` holds the chrome the
design system must not know about (D47).

**Tech Stack:** Tailwind 4 (`@theme`), React 19, TypeScript, Vitest (+ jsdom, Testing Library) in
`@app/ui`, Playwright in `apps/e2e`.

**Spec:** `docs/superpowers/specs/2026-09-19-marketcore-design-system-design.md` (D40–D51 — the spec
is the binding authority; this plan argues from it)

## Global Constraints

- `@app/ui` keeps **zero runtime dependencies**. Test-only tooling is a devDependency, which is a
  different thing (D44).
- Components are `'use client'`, styled with Tailwind utilities that reference **semantic tokens
  only**. A component that names a colour (`bg-brand-600`, `text-gray-600`) is the defect this phase
  exists to remove.
- **Palette names and semantic names never borrow from each other** (D43). No palette step may be
  called `attention`; no component may reference `--palette-*`.
- Every token value is a **literal** `oklch()`. No `color-mix()`, no relative colour syntax: a colour
  computed at runtime cannot be contrast-checked before it ships (D43).
- Spacing is **not** redefined. Tailwind's default scale is a 4px step already (D41).
- **`busy` never sets `disabled`** (D46). It sets `aria-busy` and `aria-disabled`, and the click
  handler is guarded so a double submit is still impossible.
- The theme is **light**, and `color-scheme: light` says so. It does not follow the operating system
  (D50).
- One fact lives in one place: the tenant in the rail, the page title and signed-in user in the top
  bar (D47, deliverable 3).
- The browser still never holds a token. Nothing in this phase touches the cookie or the BFF.
- No `gray-*`, `brand-*`, `red-*` or `green-*` utility survives in `apps/web/src` or
  `packages/ui/src`.

### Token values — derived, not invented

The spec fixes the architecture and the direction and explicitly does not list OKLCH values; it says
they are carried over from the exploration set (`docs/design/app.html`, selvedge's token map) and
that the contrast test re-derives the same numbers. Converting that set to OKLCH and measuring
**every text-on-surface pair** found two pairs the exploration's hex could not support, so the plan
pins the corrected literals:

| Pair | Exploration value | Measured | Corrected literal | Measured |
|---|---|---|---|---|
| `ink-faint` on `sunken` | `#76736d` | 3.77:1 | `oklch(0.51 0.01 84.6)` | **4.58:1** |
| `rail-muted` on `rail-hover` | `#8e95a2` | 3.83:1 | `oklch(0.72 0.021 263)` | **4.66:1** |

`ink-muted` moves with `ink-faint` (`oklch(0.45 0.015 84.6)`) so the text ramp stays ordered — the
faint step must be fainter than the muted one, which it would not have been had `ink-faint` alone
been darkened to `ink-muted`'s own lightness. The worst pair in the final set is 4.58:1.

Three semantic names are added beyond D41's literal list, because the direction's own mockup paints
them and nothing in the list covers them: `--color-rail-hover`, `--color-rail-active` (the rail's
hover and selected planes) and `--color-ink-on-rail-muted` (the rail's secondary text, without which
the role label and inactive nav are either unreadable or unexpressible). Recorded in Task 9's ledger.

---

### Task 1: The selvedge token layer, and the contrast test that reads it

**Files:**
- Modify: `packages/ui/src/tokens.css` (replaces the template's emerald ramp)
- Create: `packages/ui/vitest.config.ts`
- Create: `packages/ui/test/support/oklch.ts`
- Create: `packages/ui/test/tokens.spec.ts`
- Modify: `packages/ui/package.json` (a `test` script, test devDependencies)
- Modify: `packages/ui/tsconfig.json` (`include` gains `test`)

**Interfaces:**
- Produces: the semantic token names every later task writes classes against —
  `canvas panel sunken rail rail-edge rail-hover rail-active`, `ink ink-muted ink-faint
  ink-on-action ink-on-rail ink-on-rail-muted`, `rule rule-strong`, `action action-hover action-ink`,
  `attention attention-wash positive positive-wash`, `focus-ring` — plus `--radius-brand: 7px`.
  Tailwind generates `bg-canvas`, `text-ink`, `border-rule`, `bg-attention-wash`, `bg-action`,
  `text-ink-on-rail-muted`, `outline-focus-ring`, `rounded-brand` from them.
- Produces: `contrastRatio(foreground: Oklch, background: Oklch): number` and
  `relativeLuminance(rgb: [number, number, number]): number` in `test/support/oklch.ts`.

- [ ] **Step 1: Write the failing contrast test**

Create `packages/ui/test/support/oklch.ts`:

```ts
/**
 * OKLCH ⇄ sRGB, and WCAG relative luminance.
 *
 * Written out rather than imported: the token file's contrast is what is under
 * test, so the conversion has to be inspectable here and must not move with a
 * library's next release. The matrices are Björn Ottosson's.
 */

const srgbToLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const linearToSrgb = (channel: number): number =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export function oklchToRgb({ l, c, h }: Oklch): [number, number, number] {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const long_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const medium_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const short_ = l - 0.0894841775 * a - 1.291485548 * b;

  const long = long_ ** 3;
  const medium = medium_ ** 3;
  const short = short_ ** 3;

  return [
    linearToSrgb(4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short),
    linearToSrgb(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short),
    linearToSrgb(-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short),
  ];
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG 2.x contrast ratio. 4.5:1 is the floor for body text. */
export function contrastRatio(foreground: Oklch, background: Oklch): number {
  const [lighter, darker] = [
    relativeLuminance(oklchToRgb(foreground)),
    relativeLuminance(oklchToRgb(background)),
  ].sort((a, b) => b - a);

  return (lighter + 0.05) / (darker + 0.05);
}
```

Create `packages/ui/test/tokens.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, oklchToRgb, relativeLuminance, type Oklch } from './support/oklch';

const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');

/** Every `--name: value` in the stylesheet, comments stripped. */
const declared = new Map<string, string>();
for (const [, name, value] of css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
  declared.set(name, value.trim());
}

/** A semantic token, with its `var()` chain resolved to the palette literal. */
function token(name: string): Oklch {
  const value = declared.get(`--color-${name}`);
  if (value === undefined) throw new Error(`--color-${name} is not declared in tokens.css`);

  const reference = /^var\((--[a-z0-9-]+)\)$/i.exec(value);
  const literal = reference === null ? value : declared.get(reference[1]);
  if (literal === undefined) throw new Error(`--color-${name} points at a token that is not declared`);

  const parts = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(literal);
  if (parts === null) {
    throw new Error(`--color-${name} resolves to ${literal}, which is not a literal oklch()`);
  }

  return { l: Number(parts[1]), c: Number(parts[2]), h: Number(parts[3]) };
}

/** The names D41 fixes as the interface. The list is the assertion. */
const SEMANTIC_TOKENS = [
  'canvas', 'panel', 'sunken', 'rail', 'rail-edge', 'rail-hover', 'rail-active',
  'ink', 'ink-muted', 'ink-faint', 'ink-on-action', 'ink-on-rail', 'ink-on-rail-muted',
  'rule', 'rule-strong',
  'action', 'action-hover', 'action-ink',
  'attention', 'attention-wash', 'positive', 'positive-wash',
  'focus-ring',
];

/** The pairs the components actually paint. Not every token on every other. */
const TEXT_ON_SURFACE: [string, string][] = [
  ['ink', 'canvas'], ['ink', 'panel'], ['ink', 'sunken'],
  ['ink-muted', 'canvas'], ['ink-muted', 'panel'], ['ink-muted', 'sunken'],
  ['ink-faint', 'canvas'], ['ink-faint', 'panel'], ['ink-faint', 'sunken'],
  ['ink-on-rail', 'rail'], ['ink-on-rail', 'rail-edge'],
  ['ink-on-rail', 'rail-hover'], ['ink-on-rail', 'rail-active'],
  ['ink-on-rail-muted', 'rail'], ['ink-on-rail-muted', 'rail-hover'],
  ['ink-on-action', 'action'], ['ink-on-action', 'action-hover'],
  ['attention', 'canvas'], ['attention', 'panel'], ['attention', 'attention-wash'],
  ['positive', 'canvas'], ['positive', 'panel'], ['positive', 'positive-wash'],
  ['ink', 'attention-wash'], ['ink', 'positive-wash'],
];

describe('the selvedge palette', () => {
  it('declares exactly the semantic tokens the components name', () => {
    const declaredSemantic = [...declared.keys()]
      .filter((name) => name.startsWith('--color-'))
      .sort();

    expect(declaredSemantic).toEqual(SEMANTIC_TOKENS.map((name) => `--color-${name}`).sort());
  });

  it('resolves every semantic token to a literal, so contrast can be read before it ships', () => {
    for (const name of SEMANTIC_TOKENS) {
      expect(() => token(name), `--color-${name} resolves to a literal oklch()`).not.toThrow();
    }
  });

  it('clears 4.5:1 for every text-on-surface pair the components paint', () => {
    const measured = TEXT_ON_SURFACE.map(([text, surface]) => ({
      pair: `${text} on ${surface}`,
      ratio: Number(contrastRatio(token(text), token(surface)).toFixed(2)),
    }));

    expect(measured.filter(({ ratio }) => ratio < 4.5)).toEqual([]);
  });

  it('keeps the text ramp ordered, so the faint step is actually fainter', () => {
    const luminances = ['ink', 'ink-muted', 'ink-faint'].map((name) =>
      relativeLuminance(oklchToRgb(token(name))),
    );

    expect(luminances).toEqual([...luminances].sort((a, b) => a - b));
  });

  it('keeps palette names and semantic names apart, so a palette step is never called a role', () => {
    const semantic = new Set(SEMANTIC_TOKENS);
    const families = [...declared.keys()]
      .filter((name) => name.startsWith('--palette-'))
      .map((name) => name.slice('--palette-'.length).replace(/-\d+$/, ''));

    expect(families.filter((family) => semantic.has(family))).toEqual([]);
  });
});
```

Create `packages/ui/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @app/ui test`
Expected: FAIL — `--color-canvas is not declared in tokens.css` (the file still holds the emerald
ramp), and `@app/ui` has no `test` script yet, so add the script and devDependencies first:
`vitest`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `react-dom`, `@types/react-dom`.

```bash
pnpm --filter @app/ui add -D vitest jsdom @testing-library/react @testing-library/dom react-dom @types/react-dom
```

- [ ] **Step 3: Write the token layer**

Replace the whole of `packages/ui/src/tokens.css` with:

```css
/* The design system's token layer.
 *
 * Three layers, in this file and nowhere else:
 *
 *   palette    raw OKLCH values, named by colour family — never by role
 *   semantic   what components reference — named for the job, never the hue
 *   direction  one set of palette values, and this is selvedge's
 *
 * A component that writes `bg-brand-600` names a colour; one that writes
 * `bg-action` names what the colour is *for*. The second survives the direction
 * changing, and the first becomes a lie the moment it does.
 *
 * Tailwind 4 generates utilities from `--color-*` in `@theme`, so the semantic
 * names are the design system's public interface — `bg-canvas`, `text-ink`,
 * `border-rule`, `bg-attention-wash` — and this file is the one file changing the
 * app's look means changing.
 *
 * Values are literal rather than computed. `color-mix()` and relative colour
 * syntax are legitimate and were used in the exploration file, but a colour
 * computed at runtime cannot be contrast-checked before it ships, and
 * `test/tokens.spec.ts` has to read the same values the browser will. That is why
 * attention and its wash are two palette steps rather than one value and a mix.
 *
 * Spacing is deliberately not redefined: Tailwind's default scale is already a
 * 4px step, and a second scale would be a second thing to keep in agreement.
 */

/* Direction: selvedge — indigo chrome, undyed-linen canvas, warm dark ink, one
 * indigo action colour, and madder red reserved for attention.
 *
 * Every text-on-surface pair here clears 4.5:1, measured (not asserted in prose)
 * by `test/tokens.spec.ts`, which re-derives these numbers from these literals.
 * The muted and faint greys are darker than the exploration's, so that
 * `ink-faint` clears on `sunken`; the rail's muted ink is lighter, so that it
 * clears on `rail-hover`. The ramp stays ordered, which is why `ink-muted` moved
 * with `ink-faint` rather than being left where it was. */
:root {
  /* Palette — raw OKLCH, named by colour family. Never referenced by a
   * component: a palette step is a colour, and a component needs a job. */
  --palette-linen-50: oklch(0.994 0.006 84.6);
  --palette-linen-100: oklch(0.958 0.011 89.7);
  --palette-linen-200: oklch(0.923 0.017 88);
  --palette-linen-300: oklch(0.864 0.011 89.7);
  --palette-linen-400: oklch(0.751 0.01 87.5);

  --palette-umber-400: oklch(0.51 0.01 84.6);
  --palette-umber-500: oklch(0.45 0.015 84.6);
  --palette-umber-900: oklch(0.245 0.012 84.6);

  --palette-indigo-300: oklch(0.72 0.021 263);
  --palette-indigo-400: oklch(0.62 0.11 263);
  --palette-indigo-500: oklch(0.497 0.064 264.2);
  --palette-indigo-600: oklch(0.401 0.042 263.2);
  --palette-indigo-700: oklch(0.391 0.08 263.8);
  --palette-indigo-800: oklch(0.345 0.047 263);
  --palette-indigo-900: oklch(0.287 0.053 262.6);
  --palette-indigo-950: oklch(0.229 0.048 262.4);

  --palette-madder-100: oklch(0.955 0.022 32);
  --palette-madder-600: oklch(0.488 0.13 31.2);

  --palette-moss-100: oklch(0.955 0.02 155);
  --palette-moss-600: oklch(0.479 0.078 161.1);

  --palette-paper-0: oklch(1 0 0);

  --radius-brand: 7px;
}

/* Semantic — the interface. Named for the job a colour does, so a component
 * never learns the direction's hue and a direction never has to edit a
 * component. */
@theme {
  /* surface — the planes a screen is built from */
  --color-canvas: var(--palette-linen-100);
  --color-panel: var(--palette-linen-50);
  --color-sunken: var(--palette-linen-200);
  --color-rail: var(--palette-indigo-900);
  --color-rail-edge: var(--palette-indigo-950);
  --color-rail-hover: var(--palette-indigo-800);
  --color-rail-active: var(--palette-indigo-600);

  /* text */
  --color-ink: var(--palette-umber-900);
  --color-ink-muted: var(--palette-umber-500);
  --color-ink-faint: var(--palette-umber-400);
  --color-ink-on-action: var(--palette-paper-0);
  --color-ink-on-rail: var(--palette-paper-0);
  --color-ink-on-rail-muted: var(--palette-indigo-300);

  /* edge */
  --color-rule: var(--palette-linen-300);
  --color-rule-strong: var(--palette-linen-400);

  /* action */
  --color-action: var(--palette-indigo-700);
  --color-action-hover: var(--palette-indigo-500);
  --color-action-ink: var(--palette-paper-0);

  /* state */
  --color-attention: var(--palette-madder-600);
  --color-attention-wash: var(--palette-madder-100);
  --color-positive: var(--palette-moss-600);
  --color-positive-wash: var(--palette-moss-100);

  /* control */
  --color-focus-ring: var(--palette-indigo-400);
}
```

Extend `packages/ui/tsconfig.json` to `"include": ["src", "test"]` so the test is typechecked
(it is compiled by nobody otherwise — week 1's fifth finding).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @app/ui test`
Expected: PASS — 5 tests. Then `pnpm --filter @app/ui typecheck` and `pnpm --filter @app/ui lint`.

- [ ] **Step 5: Confirm Tailwind actually emits the utilities**

The failure mode this catches is week 2's `@source` finding in reverse: tokens that compile but
generate nothing.

Run: `pnpm --filter web build` and then
`grep -c 'bg-canvas\|text-ink\|bg-rail' apps/web/.next/static/css/*.css`
Expected: a non-zero count, proving `@theme` generated utilities from the semantic names.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/tokens.css packages/ui/test packages/ui/vitest.config.ts \
  packages/ui/package.json packages/ui/tsconfig.json pnpm-lock.yaml
git commit -m "feat(ui): the semantic token layer, and selvedge's values in it"
```

---

### Task 2: `Button` — variants, sizes, and `busy` that keeps focus

**Files:**
- Modify: `packages/ui/src/button.tsx`
- Create: `packages/ui/test/button.spec.tsx`

**Interfaces:**
- Consumes: `bg-action`, `text-ink-on-action`, `hover:bg-action-hover`, `text-action`,
  `hover:bg-sunken`, `outline-focus-ring`, `rounded-brand` (Task 1).
- Produces: `ButtonVariant = 'primary' | 'ghost'`, `ButtonSize = 'md' | 'sm'`, and
  `ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?, size?, busy? }`. Task 6 passes
  `busy={pending}`; nothing passes `disabled` any more.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/test/button.spec.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from '../src/button';

describe('Button', () => {
  it('is not natively disabled while busy, so a keyboard user is not thrown off the form', () => {
    // A genuinely `disabled` submit button drops focus, which sends a keyboard
    // user back to the top of the form mid-submit. `aria-disabled` keeps the
    // button focusable and announced as unavailable.
    render(<Button busy>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  it('refuses a click while busy, so a double submit is still impossible', () => {
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Save
      </Button>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('hands the click through when it is not busy', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('announces nothing when it is not busy', () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.getAttribute('aria-busy')).toBeNull();
    expect(button.getAttribute('aria-disabled')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @app/ui test -- button`
Expected: FAIL — `busy` is not a prop of `ButtonProps` (typecheck) and `aria-busy` is absent.

- [ ] **Step 3: Implement**

Replace `packages/ui/src/button.tsx` with:

```tsx
'use client';

import type { ButtonHTMLAttributes, MouseEvent } from 'react';

export type ButtonVariant = 'primary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Work is in flight. Sets `aria-busy` and `aria-disabled` and guards the click —
   * deliberately not `disabled`, which drops keyboard focus and throws a keyboard
   * user back to the top of the form mid-submit.
   */
  busy?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-action text-ink-on-action hover:bg-action-hover',
  ghost: 'bg-transparent text-action hover:bg-sunken',
};

const sizes: Record<ButtonSize, string> = {
  md: 'px-4 py-2 text-sm',
  sm: 'px-3 py-1.5 text-xs',
};

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  className = '',
  onClick,
  ...props
}: ButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (busy || props.disabled === true) {
      event.preventDefault();
      return;
    }

    onClick?.(event);
  }

  return (
    <button
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={handleClick}
      className={`inline-flex items-center justify-center rounded-brand font-medium transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @app/ui test -- button`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/button.tsx packages/ui/test/button.spec.tsx
git commit -m "feat(ui): Button names roles, and busy keeps the keyboard where it was"
```

---

### Task 3: `Input`, `Label` and `Alert` on the semantic layer

**Files:**
- Modify: `packages/ui/src/input.tsx`, `packages/ui/src/label.tsx`, `packages/ui/src/alert.tsx`
- Create: `packages/ui/test/input.spec.tsx`, `packages/ui/test/alert.spec.tsx`

**Interfaces:**
- Consumes: `bg-panel`, `text-ink`, `placeholder:text-ink-faint`, `border-rule-strong`,
  `focus:border-action`, `border-attention`, `outline-focus-ring`, `bg-attention-wash`,
  `text-attention`, `bg-positive-wash`, `text-positive`, `border-rule` (Task 1).
- Produces: `InputSize = 'md' | 'sm'`; `InputProps` gains `size`. `AlertProps` becomes
  `Omit<HTMLAttributes<HTMLParagraphElement>, 'children'> & { variant?, children? }`, so Task 4 can
  hand it an `id` — the `aria-describedby` target.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/test/input.spec.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from '../src/input';

describe('Input', () => {
  it('reaches a screen reader when it is invalid, not only the eye', () => {
    render(<Input aria-label="Email" invalid />);

    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
  });

  it('says nothing about validity when it is valid', () => {
    render(<Input aria-label="Email" />);

    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBeNull();
  });
});
```

Create `packages/ui/test/alert.spec.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert } from '../src/alert';

describe('Alert', () => {
  it('announces the message rather than merely showing it', () => {
    render(<Alert>Invalid credentials</Alert>);

    expect(screen.getByRole('alert').textContent).toBe('Invalid credentials');
  });

  it('renders nothing at all when there is nothing to say', () => {
    const { container } = render(<Alert>{null}</Alert>);

    expect(container.innerHTML).toBe('');
  });

  it('carries an id, so a field can point its input at the message', () => {
    render(<Alert id="email-error">Required</Alert>);

    expect(screen.getByRole('alert').id).toBe('email-error');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @app/ui test -- input alert`
Expected: FAIL — `Alert` does not forward `id`; the `invalid` assertion passes already but the
`Alert` id assertion does not.

- [ ] **Step 3: Implement**

Replace `packages/ui/src/input.tsx` with:

```tsx
'use client';

import type { InputHTMLAttributes } from 'react';

export type InputSize = 'md' | 'sm';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /**
   * Marks the field as failing validation. Sets `aria-invalid` as well as the
   * colour, so the state reaches a screen reader rather than only the eye.
   */
  invalid?: boolean;
  size?: InputSize;
}

const sizes: Record<InputSize, string> = {
  md: 'px-3 py-2 text-sm',
  sm: 'px-2.5 py-1.5 text-xs',
};

const borders = {
  valid: 'border-rule-strong focus:border-action',
  invalid: 'border-attention focus:border-attention',
} as const;

export function Input({
  invalid = false,
  size = 'md',
  className = '',
  ...props
}: InputProps) {
  const border = invalid ? borders.invalid : borders.valid;

  return (
    <input
      aria-invalid={invalid || undefined}
      // The surface and text colours are stated rather than inherited. A form control
      // with no background takes whatever the platform gives it, which is how an input
      // ends up as a white slab on a dark page the moment the theme is not the one the
      // component assumed.
      className={`w-full rounded-brand border bg-panel text-ink transition-colors outline-none placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-focus-ring disabled:opacity-50 ${sizes[size]} ${border} ${className}`}
      {...props}
    />
  );
}
```

Replace `packages/ui/src/label.tsx` with:

```tsx
import type { LabelHTMLAttributes } from 'react';

export function Label({ className = '', ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`block text-sm font-medium text-ink ${className}`} {...props} />;
}
```

Replace `packages/ui/src/alert.tsx` with:

```tsx
import type { HTMLAttributes, ReactNode } from 'react';

export type AlertVariant = 'error' | 'success';

export interface AlertProps extends Omit<HTMLAttributes<HTMLParagraphElement>, 'children'> {
  variant?: AlertVariant;
  children?: ReactNode;
}

const variants: Record<AlertVariant, string> = {
  error: 'border-attention bg-attention-wash text-attention',
  success: 'border-positive bg-positive-wash text-positive',
};

/**
 * One message, announced rather than merely shown.
 *
 * `role="alert"` is the point: a form that reports a refusal only through colour and
 * position is invisible to a screen reader, and the refusal is the one thing the
 * user needs to perceive. It serves both a field-level message and a form-level one,
 * which is why it is not named for either — and it forwards an `id`, because a field
 * has to be able to point its input at it.
 */
export function Alert({ variant = 'error', className = '', children, ...props }: AlertProps) {
  if (!children) return null;

  return (
    <p
      role="alert"
      className={`rounded-brand border px-3 py-2 text-sm ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </p>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @app/ui test && pnpm --filter @app/ui typecheck && pnpm --filter @app/ui lint`
Expected: PASS — 11 tests across the four spec files.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/input.tsx packages/ui/src/label.tsx packages/ui/src/alert.tsx \
  packages/ui/test/input.spec.tsx packages/ui/test/alert.spec.tsx
git commit -m "feat(ui): Input, Label and Alert on the semantic layer"
```

---

### Task 4: `Field` — the labelled field and its message, wired once

**Files:**
- Create: `packages/ui/src/field.tsx`
- Modify: `packages/ui/src/index.ts` (`export * from './field';`)
- Create: `packages/ui/test/field.spec.tsx`

**Interfaces:**
- Consumes: `Input`, `Label`, `Alert` (Task 3).
- Produces: `FieldProps = Omit<InputProps, 'id' | 'invalid'> & { label: ReactNode; error?: string | null; id?: string }`.
  Task 6 renders `<Field label="Email" ... />` with no `id` and relies on the generated one.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/test/field.spec.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field } from '../src/field';

describe('Field', () => {
  it('points the input at the element carrying its message', () => {
    // The defect this component exists to fix: the login and register forms each
    // rendered an error paragraph beside an input with nothing linking the two, so
    // a screen reader announced the input and never mentioned why it was refused.
    render(<Field label="Email" error="Enter an email address" />);

    const input = screen.getByLabelText('Email');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const message = document.getElementById(describedBy as string);
    expect(message?.textContent).toBe('Enter an email address');
  });

  it('leaves the association off when there is no message to describe', () => {
    render(<Field label="Email" />);

    expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('marks the input invalid only while it is refused', () => {
    const { rerender } = render(<Field label="Email" error="Required" />);
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');

    rerender(<Field label="Email" />);
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBeNull();
  });

  it('uses the id it is given, so a caller can own it', () => {
    render(<Field id="email" label="Email" error="Required" />);

    expect(screen.getByLabelText('Email').id).toBe('email');
    expect(screen.getByRole('alert').id).toBe('email-error');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @app/ui test -- field`
Expected: FAIL — `../src/field` does not exist.

- [ ] **Step 3: Implement**

Create `packages/ui/src/field.tsx`:

```tsx
'use client';

import { useId, type ReactNode } from 'react';
import { Alert } from './alert';
import { Input, type InputProps } from './input';
import { Label } from './label';

export interface FieldProps extends Omit<InputProps, 'id' | 'invalid'> {
  label: ReactNode;
  /** The message a refusal produced, if any. */
  error?: string | null;
  id?: string;
}

/**
 * A label, an input and the message that explains a refusal — wired once.
 *
 * This is not a convenience. A field error with nothing associating it to its input
 * is announced by a screen reader as an input, with the reason it was refused never
 * mentioned. Four fields across two forms were wrong in the same way, which is the
 * argument for a component stated exactly: wire it once, and every field inherits it.
 *
 * The generated id is React's `useId` rather than a counter, because it is stable
 * across a server render and the client's hydration of it.
 */
export function Field({ label, error = null, id, className = '', ...inputProps }: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        invalid={error !== null}
        aria-describedby={error === null ? undefined : errorId}
        className={className}
        {...inputProps}
      />
      <Alert id={errorId}>{error}</Alert>
    </div>
  );
}
```

Add `export * from './field';` to `packages/ui/src/index.ts`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @app/ui test && pnpm --filter @app/ui typecheck`
Expected: PASS — 15 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/field.tsx packages/ui/src/index.ts packages/ui/test/field.spec.tsx
git commit -m "feat(ui): Field, which is where the field error stops being invisible"
```

---

### Task 5: The shell — a rail, a top bar, and the page title

**Files:**
- Create: `apps/web/src/app/(dash)/rail.tsx`
- Create: `apps/web/src/app/(dash)/top-bar.tsx`
- Create: `apps/web/src/app/(dash)/page-title.ts`
- Create: `apps/web/src/app/(dash)/page-title.test.ts`
- Modify: `apps/web/src/app/(dash)/chrome.tsx` (the layout it returns)
- Modify: `apps/web/src/app/(dash)/organization-switcher.tsx` (repainted, now in the rail)
- Modify: `apps/web/src/app/(dash)/chrome.test.tsx` (mock `usePathname`; the shell now has a rail)

**Interfaces:**
- Consumes: `bg-rail`, `bg-rail-hover`, `bg-rail-active`, `text-ink-on-rail`,
  `text-ink-on-rail-muted`, `border-rail-edge`, `bg-panel`, `border-rule`, `text-ink`,
  `text-ink-muted`, `bg-canvas` (Task 1); `Button` (Task 2); `Alert` (Task 3).
- Produces: `pageTitle(pathname: string): string | null`; `Rail({ appName })`;
  `TopBar()`. `DashboardChrome`'s public shape (`{ appName, children }`) is unchanged, so
  `(dash)/layout.tsx` is untouched.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/(dash)/page-title.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pageTitle } from './page-title';

describe('the page title', () => {
  it('names the page the path belongs to', () => {
    expect(pageTitle('/dashboard')).toBe('Your session');
  });

  it('says nothing rather than guessing for a path it does not know', () => {
    // The empty string is the honest answer: a title invented from a path segment
    // would be the shell claiming to know a page it has never been told about.
    expect(pageTitle('/dashboard/orders')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- page-title`
Expected: FAIL — `./page-title` does not exist.

- [ ] **Step 3: Implement**

Create `apps/web/src/app/(dash)/page-title.ts`:

```ts
/**
 * The title the top bar shows for a path.
 *
 * Derived from the pathname rather than pushed up by each page: the shell and the
 * page would otherwise both state where you are, and two statements of one fact
 * drift. One entry, because one page exists — the products page adds its own row
 * rather than a second mechanism.
 */
const TITLES: Record<string, string> = {
  '/dashboard': 'Your session',
};

export function pageTitle(pathname: string): string | null {
  return TITLES[pathname] ?? null;
}
```

Create `apps/web/src/app/(dash)/top-bar.tsx`:

```tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@app/ui';
import { signOut, useSession } from '@/lib/session/client';
import { pageTitle } from './page-title';

/**
 * The page title and who is signed in.
 *
 * Both live here and nowhere else. The exploration mockups showed the user in the
 * rail and again in the top bar, which is two places to keep in agreement about one
 * fact.
 */
export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { state } = useSession();

  if (state.status !== 'ready') return null;

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-rule bg-panel px-6 py-3">
      <h1 className="text-base font-semibold text-ink">{pageTitle(pathname)}</h1>

      <div className="flex items-center gap-3">
        <span className="text-xs text-ink-muted">{state.session.user.email}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void signOut().then(() => router.replace('/login'));
          }}
        >
          Sign out
        </Button>
      </div>
    </header>
  );
}
```

Create `apps/web/src/app/(dash)/rail.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useSession } from '@/lib/session/client';
import { OrganizationSwitcher } from './organization-switcher';

/**
 * The app's chrome: which tenant the session acts in, and where it can go.
 *
 * The tenant and its picker live here and nowhere else. It is `apps/web`'s
 * component rather than `@app/ui`'s because it knows about organizations, sessions
 * and routing, and the design system knows about none of them (D47).
 */
export function Rail({ appName }: { appName: string }) {
  const { state } = useSession();

  if (state.status !== 'ready') return null;

  const { organizations, activeOrganizationId } = state.session;
  const active = organizations.find(({ id }) => id === activeOrganizationId) ?? null;

  return (
    <aside className="flex flex-col gap-1 border-r border-rail-edge bg-rail px-3 py-4">
      <Link className="px-2 pb-4 text-sm font-semibold text-ink-on-rail" href="/dashboard">
        {appName}
      </Link>

      <div className="mb-3 space-y-2 rounded-brand bg-rail-hover px-2 py-2">
        <p className="text-sm font-medium text-ink-on-rail">
          {active === null ? 'No organization' : active.name}
        </p>
        <p className="text-xs text-ink-on-rail-muted">
          {active === null ? 'Choose one to continue' : active.role}
        </p>
        <OrganizationSwitcher />
      </div>

      <nav>
        <Link
          className="block rounded-brand px-2 py-1.5 text-sm text-ink-on-rail-muted hover:bg-rail-hover hover:text-ink-on-rail"
          href="/dashboard"
          aria-current="page"
        >
          Overview
        </Link>
      </nav>
    </aside>
  );
}
```

Replace `apps/web/src/app/(dash)/organization-switcher.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { Alert } from '@app/ui';
import { selectOrganization, useSession } from '@/lib/session/client';

/**
 * Which organization the session is acting in.
 *
 * Not decoration and not a preference: every tenant-scoped API call carries this as
 * `x-organization-id`, so it is the difference between reading your own products and
 * being refused. It is held in a cookie rather than in component state because the
 * next data page is fetched by the server, which can only read a cookie.
 *
 * When a visitor belongs to several organizations and has not chosen, the control
 * shows a placeholder rather than silently selecting the first — the API would
 * refuse a request that named nothing, and guessing would hide that from the person
 * who has to choose.
 */
export function OrganizationSwitcher() {
  const { state, reload } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (state.status !== 'ready') return null;

  const { organizations, activeOrganizationId } = state.session;
  if (organizations.length === 0) {
    return <p className="text-xs text-ink-on-rail-muted">No organizations</p>;
  }

  async function choose(organizationId: string) {
    setPending(true);
    setError(null);

    try {
      await selectOrganization(organizationId);
      await reload();
    } catch {
      setError('Could not change organization');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="sr-only">Active organization</span>
        <select
          className="w-full rounded-brand border border-rail-active bg-rail px-2 py-1 text-xs text-ink-on-rail"
          disabled={pending}
          value={activeOrganizationId ?? ''}
          onChange={(event) => void choose(event.target.value)}
        >
          {activeOrganizationId === null && (
            <option value="" disabled>
              Choose an organization
            </option>
          )}
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.name}
            </option>
          ))}
        </select>
      </label>
      <Alert>{error}</Alert>
    </div>
  );
}
```

Replace the return of `DashboardChrome` in `apps/web/src/app/(dash)/chrome.tsx` (the loading,
anonymous and failed branches stay exactly as they are):

```tsx
  return (
    <div className="grid min-h-screen grid-cols-[13rem_minmax(0,1fr)]">
      <Rail appName={appName} />

      <div className="flex min-w-0 flex-col bg-canvas">
        <TopBar />
        <main className="mx-auto w-full max-w-3xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
```

and its imports: `Link` is no longer used (the sign-out button and the app name moved to `TopBar`
and `Rail`), so drop it and add `import { Rail } from './rail';` and
`import { TopBar } from './top-bar';`. The loading branch's `text-gray-500` becomes `text-ink-muted`.

- [ ] **Step 4: Update `chrome.test.tsx` and run the tests**

`TopBar` calls `usePathname`, so the existing mock needs one more export:

```ts
const mocks = vi.hoisted(() => ({ replace: vi.fn(), pathname: vi.fn() }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => mocks.pathname(),
}));
```

with `mocks.pathname.mockReturnValue('/dashboard')` in `beforeEach`. The existing four assertions
keep their meaning; add one for the split deliverable 3 asks for:

```tsx
  it('names the tenant in the rail and the user in the top bar, each once', async () => {
    fetchMock.mockResolvedValue(response(200, SESSION));

    renderShell();
    await screen.findByText('owner@marketcore.test');

    // The exploration mockups showed both facts twice, and the duplication was a
    // mistake: one fact, one place.
    expect(screen.getAllByText('Nile Traders')).toHaveLength(1);
    expect(screen.getAllByText('owner@marketcore.test')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Your session' })).toBeTruthy();
  });
```

Run: `pnpm --filter web test -- page-title chrome`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(dash)"
git commit -m "feat(web): a rail, a top bar, and each fact in one place"
```

---

### Task 6: Sign-in, register and the session screen on the primitives

**Files:**
- Modify: `apps/web/src/app/globals.css` (the app's own colours come from the token layer)
- Modify: `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/app/(auth)/register/page.tsx`
- Modify: `apps/web/src/app/(dash)/dashboard/page.tsx`
- Modify: `apps/web/src/app/(auth)/layout.tsx`

**Interfaces:**
- Consumes: `Field` (Task 4), `Button` (Task 2), `Alert` (Task 3), the semantic tokens (Task 1).
- Produces: no new exports. The login and register field errors now arrive through `Field`'s
  `error` prop, and the submit buttons pass `busy={pending}` instead of `disabled={pending}`.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/app/(auth)/login/page.test.tsx`:

```tsx
  it('associates a refused field with the message that says why', async () => {
    render(<LoginPage />);
    fillIn('not-an-email', 'correct-horse-battery');
    submit();

    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));

    const email = screen.getByLabelText('Email');
    const describedBy = email.getAttribute('aria-describedby');
    expect(describedBy, 'the field error is described, not merely adjacent').toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toBeTruthy();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- login`
Expected: FAIL — the error paragraph has no id and the input no `aria-describedby`.

- [ ] **Step 3: Implement**

Replace `apps/web/src/app/(auth)/login/page.tsx`'s form body — imports become
`import { Alert, Button, Field } from '@app/ui';` and the two field blocks collapse:

```tsx
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        error={fieldErrors.email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        error={fieldErrors.password}
        onChange={(event) => setPassword(event.target.value)}
      />

      <Button type="submit" busy={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
```

and the remaining ad-hoc greys become roles: `text-gray-600` → `text-ink-muted`,
`text-brand-700 underline` → `text-action underline`, and the `<h1>` gains `text-ink`. The
form-level `<Alert>` and the `registered` success alert are unchanged.

Make the same three changes in `apps/web/src/app/(auth)/register/page.tsx` (its button label is
`Creating…` / `Create account`).

Repaint `apps/web/src/app/(dash)/dashboard/page.tsx`: `text-gray-600` → `text-ink-muted`,
`text-gray-500` → `text-ink-faint`, `border-gray-200` → `border-rule`, and the `<h1>` gains
`text-ink`.

Replace `apps/web/src/app/(auth)/layout.tsx`'s `<main>` class with
`"mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 bg-canvas px-6"`.

Replace `apps/web/src/app/globals.css` with:

```css
@import "tailwindcss";
/* Design tokens live in @app/ui so the API surface of the design system is a
 * package, not a set of files copied between apps. */
@import "@app/ui/tokens.css";

/* Tailwind 4 finds classes by walking the project and deliberately skips
 * `node_modules` — and `@app/ui` is reached through a symlink there. So every class
 * defined inside the shared package went missing from this stylesheet: the Button's
 * background (leaving a white label with no background), the Input's focus border,
 * the Alert's colours. The components rendered correctly and were simply painted with
 * nothing, which is why a test that asserted their presence passed while the page
 * looked broken. This is the line that makes the design system a package rather than
 * a copy. */
@source "../../../../packages/ui/src";

/* Light, explicitly.
 *
 * This file used to hand `--background` and `--foreground` to the operating system's
 * preference, which made the page dark for anyone whose machine is dark while every
 * colour in the components stayed a light-mode grey — half a theme, which is worse
 * than one. `color-scheme: light` is the load-bearing line: it tells the browser to
 * render form controls, scrollbars and the canvas in light mode rather than following
 * the OS.
 *
 * The page's own colours now come from the token layer rather than being literals
 * here: `--background`/`--foreground` were a second vocabulary for the same two jobs
 * the semantic layer already names, which is the second source of truth this
 * repository refuses everywhere else. A dark direction arrives as a second palette in
 * `@app/ui/tokens.css` — the package that owns this one — not as a media query here
 * that the components know nothing about. */
:root {
  color-scheme: light;
}

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--color-canvas);
  color: var(--color-ink);
  /* The loaded font, rather than the Arial that was here. The root layout loads
   * Geist and sets these variables, and nothing referenced them — so the app paid
   * for a webfont and rendered a fallback. */
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
}
```

- [ ] **Step 4: Run the tests and prove no ad-hoc colour is left**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web build`
Run: `grep -rn "gray-\|brand-\|red-\|green-\|white" apps/web/src packages/ui/src --include=*.tsx --include=*.ts`
Expected: no class-name match; `next build` succeeds and its CSS contains a `.bg-canvas` rule.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): sign-in, register and the session screen on the design system"
```

---

### Task 7: The style assertion stops naming a colour (D50)

**Files:**
- Modify: `apps/e2e/tests/web-journey.spec.ts`

**Interfaces:**
- Consumes: the rendered app from Task 6.
- Produces: no exports. The test asserts a *property* — light, and legible against — instead of
  `rgb(255, 255, 255)`.

- [ ] **Step 1: Write the failing test**

At the top of `apps/e2e/tests/web-journey.spec.ts`, add:

```ts
/** `rgb(r, g, b)` from `getComputedStyle`, as WCAG relative luminance. */
function luminance(rgb: string): number {
  const channels = (rgb.match(/\d+/g) ?? []).slice(0, 3).map(Number);

  const [r, g, b] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}
```

and replace the body of *paints the shared design system instead of shipping it unstyled* from the
`color-scheme` assertion onwards with:

```ts
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');

    const pageBackground = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    const bodyText = await page.evaluate(() => getComputedStyle(document.body).color);

    // Measured as a property, not as a colour. The old assertion pinned
    // `rgb(255, 255, 255)`, which asserts *a colour* where the intent was *a
    // property* — selvedge's canvas is linen, so it broke, and it would not have
    // caught a dark direction either. This fails loudly if the theme starts
    // following the OS or the ramp drops below legible, which are the two things
    // the assertion was written to protect.
    expect(luminance(pageBackground), 'the page is light whichever way the OS is set')
      .toBeGreaterThan(0.7);
    expect(contrast(pageBackground, bodyText), 'body text clears 7:1 on the page')
      .toBeGreaterThanOrEqual(7);

    const button = page.getByRole('button', { name: 'Sign in' });
    const buttonBackground = await button.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(buttonBackground, 'the primary button has a background').not.toBe('rgba(0, 0, 0, 0)');
    expect(buttonBackground, 'and is not the page it sits on').not.toBe(pageBackground);
```

Delete the `input`/`inputBackground` assertion (`'the field states its own surface'`) — it asserts a
colour where the intent was that the field is painted at all, and the button assertions above
already carry that property colour-independently.

- [ ] **Step 2: Run it against the harness**

```bash
docker compose -f docker-compose.e2e.yml up -d --build --wait
pnpm --filter "e2e..." run build
pnpm --filter e2e test:behavioural
```
Expected: PASS, 14 tests. The two new assertions must be seen passing rather than assumed — this is
the layer where a colour that never reaches the browser is discovered.

- [ ] **Step 3: Stop the stack**

```bash
docker compose -f docker-compose.e2e.yml down
```

- [ ] **Step 4: Commit**

```bash
git add apps/e2e/tests/web-journey.spec.ts
git commit -m "test(e2e): assert the theme is light, not that it is white"
```

---

### Task 8: ADR 012 — the component layer

**Files:**
- Create: `docs/adr/012-component-layer.md`
- Modify: `docs/adr/README.md` (one row in the index)

**Interfaces:** none in code. The ADR is cited by `packages/ui/src/button.tsx`'s neighbourhood and by
the spec's D44.

- [ ] **Step 1: Write the ADR**

Create `docs/adr/012-component-layer.md` using the template in `docs/adr/README.md`:

```markdown
# 012 Keep the component layer hand-rolled, and adopt Radix a widget at a time

- **Date:** 2026-09-19
- **Status:** Accepted
- **Phase:** the web design system (`docs/superpowers/specs/2026-09-19-marketcore-design-system-design.md`, D44)
- **Implements:** `feat/web-design-system`

## Context
`packages/ui` has zero runtime dependencies. The design system needs Button, Input, Label, Alert and
Field, and will need a dialog, a combobox and a popover before long. shadcn/ui is the conventional
answer and is a real, well-built system.

Adopting it would add Radix, `cva`, `clsx` and `tailwind-merge` to a package that depends on
nothing, and — the load-bearing part — our semantic token names would have to become shadcn's
(`background`/`foreground`/`primary`/`muted`/`border`/`ring`) or gain a mapping layer between the
two. That mapping is a second source of truth for what a colour means, which is the thing this
repository refuses everywhere else.

## Decision
Components stay hand-rolled, `'use client'`, styled with Tailwind utilities that reference semantic
tokens. The day a dialog, combobox or popover is needed, the Radix primitive for **that widget** is
adopted and nothing else.

## Alternatives considered
- **shadcn/ui as the component layer** — rejected for the three reasons above: dependencies in a
  package that has none, a second vocabulary for the same tokens, and its signature components sit
  against this direction rather than with it.
- **Radix now, ahead of a caller** — rejected as the scaffolding the phase gate forbids: an adopted
  primitive nothing renders is a dependency justified by a guess (the same line that deferred the
  status thread, D48).
- **A `cva`-style variant helper** — rejected as unnecessary at five components and two variants
  each; a `Record<Variant, string>` is the whole mechanism.

## Trade-offs
Radix's keyboard interaction, focus trapping and aria wiring are real work we will do by hand when a
widget needs them, and hand-rolled components are only as accessible as the review that checks them.
The contrast test and the `Field` test make two of those properties checkable; they do not make all
of them checkable.

## Consequences
- Adding a runtime dependency to `@app/ui` is now a decision that needs a superseding ADR.
- Accessibility for a widget is tested when the widget exists, not asserted in advance.
- The semantic token names are the design system's interface, and nothing translates them.

## Review date
2026-12-19
```

- [ ] **Step 2: Add the index row**

Add to the table in `docs/adr/README.md`, after 011:

```markdown
| [012](./012-component-layer.md) | Keep the component layer hand-rolled; adopt Radix per widget | Before the design system's first component | Accepted |
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/012-component-layer.md docs/adr/README.md
git commit -m "docs(adr): 012, the component layer, with shadcn as the rejected alternative"
```

---

### Task 9: Evidence, whole-suite verification, and the pull request

**Files:**
- Modify: `docs/superpowers/STATUS.md`

- [ ] **Step 1: Run the whole gate and record the real numbers**

```bash
pnpm turbo run lint typecheck test build
pnpm --filter web test:coverage
pnpm --filter @app/ui test
pnpm --filter api exec jest
pnpm --filter api test:e2e
pnpm --filter api test:integration
```
Record the counts actually printed. A claim that cannot name a runnable artifact does not appear
under **Proven**.

- [ ] **Step 2: Prove the boundary by breaking it**

`@app/ui` must not reference a palette token or a literal colour, and `apps/web` must not hold a
component the design system should own.

Run: `grep -rn "palette-" packages/ui/src --include=*.tsx`
Expected: no match. Then add `text-gray-600` to `packages/ui/src/label.tsx` and confirm
`grep` finds it, and revert — the check has to be seen failing to be a check.

- [ ] **Step 3: Write the STATUS.md section**

Add a section after the frontend-slice one, in the same shape: **Exit gate**, **Branch**, **Spec**,
**Plan**, **ADR**, then `### Proven` (a table of check/command/result), `### Delivered`,
`### Not proven / deferred`, `### Findings`, `### Deviations from the plan`, `### Next`. It must
record, at minimum:

- the contrast test's worst measured pair and the two values the exploration's hex could not
  support, with the corrected literals;
- the three semantic names added beyond D41's list, and why (`rail-hover`, `rail-active`,
  `ink-on-rail-muted` did not exist in the list and the direction's own mockup paints all three);
- the behavioural suite's new property-based assertions;
- **Not proven:** the input's border (`rule-strong` on `canvas`) measures 1.96:1, under the 3:1 WCAG
  1.4.11 asks of a UI boundary — the spec's test is text-on-surface only, so this is recorded rather
  than fixed; no visual regression testing (D-spec, refused); the products page and the status
  thread are not in this phase (D48).

- [ ] **Step 4: Commit the evidence**

```bash
git add docs/superpowers/STATUS.md docs/superpowers/plans/2026-09-19-marketcore-design-system.md
git commit -m "docs(status): the design system's evidence, and what it does not prove"
```

- [ ] **Step 5: Open the stacked pull request**

D51: a new branch off `feat/web-auth-session`, its own pull request based on that branch, retargeted
to `main` once the auth slice merges. Risk, stated in the PR: the base branch must not be
force-pushed while this pull request is open.

```bash
git fetch origin --prune
git ls-remote origin
git status --short
git push -u origin feat/web-design-system
gh pr create --base feat/web-auth-session --head feat/web-design-system \
  --title "feat: the web design system — token layers, selvedge, hand-rolled components" \
  --body-file <path-to-body>
```

The body states: what the phase is, that it is **stacked** on `feat/web-auth-session` and why it
cannot branch from `main`, the deliverables 1–7, the two corrected token values, and the three
semantic names added to D41's list.

---

## Completion checklist

- [ ] `pnpm turbo run lint typecheck test build` green, with the counts recorded
- [ ] `packages/ui` still has zero runtime dependencies
- [ ] No `gray-*`, `brand-*`, `red-*` or `green-*` utility in `apps/web/src` or `packages/ui/src`
- [ ] Every text-on-surface pair the components paint clears 4.5:1, measured by a test
- [ ] `Field`'s `aria-describedby` resolves to the message element, and the test fails if removed
- [ ] `busy` never sets `disabled`, and a busy button refuses the click
- [ ] The behavioural suite asserts the theme is light by luminance, not by `rgb(255,255,255)`
- [ ] ADR 012 exists and the index names it
- [ ] `docs/superpowers/STATUS.md` carries the phase's evidence and what it does not prove
- [ ] The pull request is open, stacked on `feat/web-auth-session`
