import { SLUG_MAX_LENGTH } from '@app/contracts';

/**
 * Derives a candidate slug from a display name, for a caller that supplies only a
 * name.
 *
 * Validation belongs to the contract — `CreateOrganizationRequestSchema` applies
 * `SLUG_PATTERN` to whatever arrives at the boundary — so this does not restate
 * the pattern, and there is no second validator here to drift from it. Uniqueness
 * is the database's job.
 */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH);
}
