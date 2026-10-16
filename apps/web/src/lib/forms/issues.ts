import type { FieldErrors, ValidationIssue } from './interfaces/forms.interface';

/**
 * The first message per field, which is the one a person reads.
 *
 * A field can fail several rules at once — an empty password is both too short and missing a
 * character class — and listing them all under one input reads as a wall. An issue with no
 * path belongs to the form as a whole, under `form`.
 */
export function firstIssuePerField(issues: readonly ValidationIssue[]): FieldErrors {
  const collected: FieldErrors = {};

  for (const issue of issues) {
    const field = String(issue.path[0] ?? 'form');
    collected[field] ??= issue.message;
  }

  return collected;
}
