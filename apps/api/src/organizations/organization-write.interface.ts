import type { Organization } from '@app/contracts';

export const OrganizationWriteOutcomes = {
  CREATED: 'CREATED',
  SLUG_TAKEN: 'SLUG_TAKEN',
} as const;
export type OrganizationWriteOutcome =
  (typeof OrganizationWriteOutcomes)[keyof typeof OrganizationWriteOutcomes];

/**
 * Creation is the one write in this module where the database can refuse for a
 * reason the caller can act on: the slug is unique.
 *
 * Returned as an outcome rather than thrown, for two reasons. The classification
 * stays in the layer that owns Prisma — a service importing Prisma just to read
 * an error code is the defect the layering rule exists to prevent — and the HTTP
 * answer remains the service's decision rather than the database's.
 */
export interface OrganizationWriteResult {
  outcome: OrganizationWriteOutcome;
  organization: Organization | null;
}
