import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '@app/contracts';
import { slugify } from '../src/slug';

/**
 * Random generation cannot reach the case that matters here. The interesting input
 * is a run of alphanumerics long enough that truncation lands *on* a separator, and
 * no alphabet-wide generator produces a 49-character run by chance — the first
 * attempt at this used `fc.array(fc.constantFrom(...))` and never got close.
 *
 * So the boundary is constructed rather than hoped for: the run length straddles
 * SLUG_MAX_LENGTH and the separator sits exactly where the cut will fall.
 */
const nameAtTruncationBoundary = fc
  .tuple(
    fc.integer({ min: SLUG_MAX_LENGTH - 3, max: SLUG_MAX_LENGTH + 5 }),
    fc.constantFrom('-', '_', ' ', '.', '/'),
    fc.integer({ min: 0, max: 5 }),
  )
  .map(
    ([runLength, separator, tailLength]) =>
      `${'a'.repeat(runLength)}${separator}${'b'.repeat(tailLength)}`,
  );

/**
 * The contract's pattern is the oracle. An example test can only show that one
 * name slugifies well; these properties hold for every name, which is the actual
 * claim `slugify` makes when it is the only thing standing between a display name
 * and a stored, public handle.
 */
describe('slugify (property)', () => {
  it('never exceeds the contract maximum, however long the name', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), (name) => {
        expect(slugify(name).length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
      }),
    );
  });

  it('produces a value the contract accepts whenever it produces anything at all', () => {
    // Empty is a legitimate outcome — a name made entirely of punctuation has no
    // slug in it — so the claim is conditional on non-emptiness, not on `slugify`
    // always succeeding.
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), (name) => {
        const slug = slugify(name);
        fc.pre(slug.length > 0);
        expect(slug).toMatch(SLUG_PATTERN);
      }),
    );
  });

  it('emits only characters the pattern allows, for any unicode input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (name) => {
        expect(slugify(name)).toMatch(/^[a-z0-9-]*$/);
      }),
    );
  });

  it('never leaves a leading or trailing separator', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (name) => {
        const slug = slugify(name);
        expect(slug.startsWith('-')).toBe(false);
        expect(slug.endsWith('-')).toBe(false);
      }),
    );
  });

  it('strips a whole run of leading separators, not just the first', () => {
    // A generator over arbitrary unicode produces two leading separators only by
    // chance, so the run is constructed. Mutation testing found that `^-+` could
    // become `^-` — stripping one separator and leaving the rest — with every test
    // still green.
    const leadingSeparators = fc
      .tuple(
        fc.integer({ min: 1, max: 8 }),
        fc.constantFrom('-', '_', ' ', '.', '/'),
        fc.string({ minLength: 1, maxLength: SLUG_MAX_LENGTH + 5 }),
      )
      .map(([count, separator, body]) => separator.repeat(count) + body);

    fc.assert(
      fc.property(leadingSeparators, (name) => {
        const slug = slugify(name);
        fc.pre(slug.length > 0);

        expect(slug.startsWith('-')).toBe(false);
        expect(slug).toMatch(SLUG_PATTERN);
      }),
    );
  });

  it('satisfies the pattern at the truncation boundary, where narrowing is forced', () => {
    // Same claim as the pattern test above, but over inputs that actually reach
    // SLUG_MAX_LENGTH. Without this the boundary is never exercised, and a slug
    // truncated to end on a separator would go unnoticed.
    fc.assert(
      fc.property(nameAtTruncationBoundary, (name) => {
        const slug = slugify(name);
        fc.pre(slug.length > 0);

        expect(slug).toMatch(SLUG_PATTERN);
      }),
    );
  });

  it('is idempotent — slugifying a slug changes nothing', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (name) => {
        const once = slugify(name);
        expect(slugify(once)).toBe(once);
      }),
    );
  });

  it('lowercases, so a handle cannot differ only by case', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (name) => {
        expect(slugify(name)).toBe(slugify(name).toLowerCase());
      }),
    );
  });
});
