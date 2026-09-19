import { SLUG_MAX_LENGTH } from '@app/contracts';

/**
 * Derives a candidate slug from a display name, for a caller that supplies only a
 * name.
 *
 * Validation belongs to the contract — `CreateOrganizationRequestSchema` applies
 * `SLUG_PATTERN` to whatever arrives at the boundary — so this does not restate
 * the pattern, and there is no second validator here to drift from it. Uniqueness
 * is the database's job.
 *
 * The truncation happens **before** the trailing-separator strip, and the order is
 * load-bearing. Cutting to `SLUG_MAX_LENGTH` first can land the cut on a separator,
 * which would leave a slug ending in `-` — a value this project's own `SLUG_PATTERN`
 * rejects. Stripping afterwards is what makes the result always contract-valid; a
 * property test over names that straddle the limit found this, and the shortened
 * example lives in test/slug.spec.ts.
 */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX_LENGTH)
    // Mutation testing reports the two `Regex` mutants below (`^-+` → `^-`, and
    // `-+$` → `-$`) as surviving. They are equivalent mutants, not a test gap: the
    // replace above collapses every run of non-alphanumerics to a single '-', and a
    // slice can only shorten, so there is never more than one leading or trailing
    // separator for the `+` to matter. No input can tell them apart, which is why no
    // test kills them.
    .replace(/^-+|-+$/g, '');
}
