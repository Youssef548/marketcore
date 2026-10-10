// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, oklchToRgb, relativeLuminance, type Oklch } from './support/oklch';

const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** Every `--name: value` in a chunk of stylesheet. */
function declarations(chunk: string): Map<string, string> {
  const declared = new Map<string, string>();
  for (const [, name, value] of chunk.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
    declared.set(name, value.trim());
  }
  return declared;
}

/**
 * Two themes, one interface.
 *
 * The light set is everything before the dark block; the dark set is the block
 * itself, which re-declares the same twenty-three names plus its own palette. Each
 * is checked on its own, because a theme is a value set rather than a variant of
 * one — and a contrast failure in the theme nobody looks at all day is exactly the
 * kind that ships.
 */
const DARK_SELECTOR = "[data-theme='dark']";
const split = css.indexOf(DARK_SELECTOR);
const THEMES = [
  { name: 'Quartz (light)', declared: declarations(css.slice(0, split)) },
  { name: 'Graphite (dark)', declared: declarations(css.slice(split)) },
];

/** A semantic token, with its `var()` chain resolved to the palette literal. */
function token(declared: Map<string, string>, name: string): Oklch {
  const value = declared.get(`--color-${name}`);
  if (value === undefined) throw new Error(`--color-${name} is not declared`);

  const reference = /^var\((--[a-z0-9-]+)\)$/i.exec(value);
  const literal = reference === null ? value : declared.get(reference[1]);
  if (literal === undefined) throw new Error(`--color-${name} points at an undeclared token`);

  const parts = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(literal);
  if (parts === null) {
    throw new Error(`--color-${name} resolves to ${literal}, which is not a literal oklch()`);
  }

  return { l: Number(parts[1]), c: Number(parts[2]), h: Number(parts[3]) };
}

/** The semantic interface, fixed by D41 and carried unchanged into Quartz. The list is the assertion. */
const SEMANTIC_TOKENS = [
  'canvas',
  'panel',
  'sunken',
  'rail',
  'rail-edge',
  'rail-hover',
  'rail-active',
  'ink',
  'ink-muted',
  'ink-faint',
  'ink-on-action',
  'ink-on-rail',
  'ink-on-rail-muted',
  'rule',
  'rule-strong',
  'action',
  'action-hover',
  'action-ink',
  'attention',
  'attention-wash',
  'positive',
  'positive-wash',
  'focus-ring',
];

/** The pairs the components actually paint. Not every token on every other. */
const TEXT_ON_SURFACE: [string, string][] = [
  ['ink', 'canvas'],
  ['ink', 'panel'],
  ['ink', 'sunken'],
  ['ink-muted', 'canvas'],
  ['ink-muted', 'panel'],
  ['ink-muted', 'sunken'],
  ['ink-faint', 'canvas'],
  ['ink-faint', 'panel'],
  ['ink-faint', 'sunken'],
  ['ink-on-rail', 'rail'],
  ['ink-on-rail', 'rail-edge'],
  ['ink-on-rail', 'rail-hover'],
  ['ink-on-rail-muted', 'rail'],
  ['ink-on-rail-muted', 'rail-hover'],
  // The active rail item carries a *light* accent in the dark theme and a dark one in
  // the light theme, so its text is `ink-on-action` — dark here, light there. Deriving
  // the dark palette is what found this: `ink-on-rail` failed on `rail-active` at 2.5:1.
  ['ink-on-action', 'rail-active'],
  ['ink-on-action', 'action'],
  ['ink-on-action', 'action-hover'],
  ['attention', 'canvas'],
  ['attention', 'panel'],
  ['attention', 'attention-wash'],
  ['positive', 'canvas'],
  ['positive', 'panel'],
  ['positive', 'positive-wash'],
  ['ink', 'attention-wash'],
  ['ink', 'positive-wash'],
];

describe.each(THEMES)('the $name palette', ({ declared }) => {
  it('declares exactly the semantic tokens the components name', () => {
    const declaredSemantic = [...declared.keys()]
      .filter((name) => name.startsWith('--color-'))
      .sort();

    expect(declaredSemantic).toEqual(SEMANTIC_TOKENS.map((name) => `--color-${name}`).sort());
  });

  it('resolves every semantic token to a literal, so contrast can be read before it ships', () => {
    for (const name of SEMANTIC_TOKENS) {
      expect(() => token(declared, name), `--color-${name} resolves to a literal oklch()`).not.toThrow();
    }
  });

  it('clears 4.5:1 for every text-on-surface pair the components paint', () => {
    const measured = TEXT_ON_SURFACE.map(([text, surface]) => ({
      pair: `${text} on ${surface}`,
      ratio: Number(contrastRatio(token(declared, text), token(declared, surface)).toFixed(2)),
    }));

    expect(measured.filter(({ ratio }) => ratio < 4.5)).toEqual([]);
  });

  it('keeps the text ramp ordered against the surface, so the faint step is actually fainter', () => {
    // Measured as distance from the canvas rather than as brightness, because the
    // direction of the ramp inverts between themes: ink is darkest on a light theme
    // and lightest on a dark one. Asserting "ascending luminance" would pin the light
    // theme and quietly require the dark theme to be wrong.
    const surface = relativeLuminance(oklchToRgb(token(declared, 'canvas')));
    const distance = ['ink', 'ink-muted', 'ink-faint'].map((name) =>
      Math.abs(relativeLuminance(oklchToRgb(token(declared, name))) - surface),
    );

    expect(distance[0]).toBeGreaterThan(distance[1]);
    expect(distance[1]).toBeGreaterThan(distance[2]);
  });

  it('keeps palette names and semantic names apart, so a palette step is never called a role', () => {
    const semantic = new Set(SEMANTIC_TOKENS);
    const families = [...declared.keys()]
      .filter((name) => name.startsWith('--palette-'))
      .map((name) => name.slice('--palette-'.length).replace(/-\d+$/, ''));

    expect(families.filter((family) => semantic.has(family))).toEqual([]);
  });
});
