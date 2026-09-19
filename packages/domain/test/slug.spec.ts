import { describe, expect, it } from 'vitest';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '@app/contracts';
import { slugify } from '../src/slug';

describe('slugify', () => {
  it('turns a name into something the contract accepts', () => {
    // Validated through the contract's own pattern rather than a second copy of it,
    // so the two cannot drift apart.
    expect(SLUG_PATTERN.test(slugify('  Youssef Retail Co.  '))).toBe(true);
    expect(slugify('  Youssef Retail Co.  ')).toBe('youssef-retail-co');
  });

  it('collapses runs of separators rather than emitting them', () => {
    expect(slugify('A -- B')).toBe('a-b');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('  --Edge Case--  ')).toBe('edge-case');
  });

  it('does not leave a trailing separator when a long name is truncated', () => {
    // The property suite's shrunk counterexample, kept here as a named regression:
    // a 49-character run puts the 50th character on the separator, so truncating
    // before the strip produced "aaa…a-", which the contract's own pattern rejects.
    const slug = slugify(`${'a'.repeat(49)}-b`);

    expect(slug).toBe('a'.repeat(49));
    expect(SLUG_PATTERN.test(slug)).toBe(true);
  });

  it('strips every leading separator, not only the first', () => {
    // From a surviving mutant: `^-+` could become `^-` and nothing failed, because
    // no test presented more than one leading separator.
    expect(slugify('---abc')).toBe('abc');
    expect(slugify('___abc')).toBe('abc');
    expect(slugify('  -- A -- B --  ')).toBe('a-b');
  });

  it('trims before truncating, so padding cannot spend the length budget', () => {
    // Also from a surviving mutant: removing `.trim()` looked harmless because the
    // later strip removes the separators whitespace turns into — but the truncation
    // happens between them, so the padding silently costs characters.
    expect(slugify(`  ${'a'.repeat(SLUG_MAX_LENGTH + 5)}`)).toBe('a'.repeat(SLUG_MAX_LENGTH));
  });
});
