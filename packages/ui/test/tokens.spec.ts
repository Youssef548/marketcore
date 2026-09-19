// @vitest-environment node
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
  ['ink-on-rail', 'rail-active'],
  ['ink-on-rail-muted', 'rail'],
  ['ink-on-rail-muted', 'rail-hover'],
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
