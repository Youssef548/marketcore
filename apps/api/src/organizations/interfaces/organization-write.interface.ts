import type { Organization } from '@app/contracts';

export const OrganizationWriteOutcomes = {
  CREATED: 'CREATED',
  SLUG_TAKEN: 'SLUG_TAKEN',
} as const;
export type OrganizationWriteOutcome =
  (typeof OrganizationWriteOutcomes)[keyof typeof OrganizationWriteOutcomes];

/**
 * The result of creating an organization.
 *
 * Creation is the one write in this module where the database can refuse for a
 * reason the caller can act on: the slug is unique. Returned rather than thrown,
 * so the classification stays in the layer that owns Prisma — a service importing
 * Prisma just to read an error code is the defect the layering rule prevents —
 * while the HTTP answer remains the service's decision.
 *
 * A **discriminated union**, not a record with a nullable organization. The
 * earlier shape allowed `CREATED` with a null organization, which is a state that
 * cannot happen and which every caller then had to guard against; here the
 * invalid combination has no representation at all.
 */
export type OrganizationWriteResult =
  | { outcome: typeof OrganizationWriteOutcomes.CREATED; organization: Organization }
  | { outcome: typeof OrganizationWriteOutcomes.SLUG_TAKEN };
