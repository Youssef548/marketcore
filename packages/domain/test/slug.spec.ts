import { describe, expect, it } from 'vitest';
import { isValidSlug, slugify } from '../src/slug';

describe('slugify', () => {
  it('turns a name into the pattern the contract accepts', () => {
    expect(slugify('  Youssef Retail Co.  ')).toBe('youssef-retail-co');
    expect(isValidSlug(slugify('Nile Traders'))).toBe(true);
  });

  it('collapses runs of separators rather than emitting them', () => {
    expect(slugify('A -- B')).toBe('a-b');
  });
});

describe('isValidSlug', () => {
  it('rejects an uppercase or over-long slug', () => {
    expect(isValidSlug('NotASlug')).toBe(false);
    expect(isValidSlug('a'.repeat(51))).toBe(false);
  });
});
