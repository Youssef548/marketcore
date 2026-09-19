import { describe, expect, it } from 'vitest';
import { SLUG_PATTERN } from '@app/contracts';
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
});
