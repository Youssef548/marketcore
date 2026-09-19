import type { MemberRole } from '@app/contracts';

/**
 * The membership a request's tenant is resolved from.
 *
 * This is the only thing that makes the organization header true: the caller may
 * send any value they like, and the guard believes none of it beyond this row.
 */
export interface MembershipRecord {
  organizationId: string;
  userId: string;
  role: MemberRole;
}

/**
 * What happened when a member was removed.
 *
 * Three outcomes rather than a boolean, because the service has to answer three
 * different ways — 404, 409, 204 — and the layer that knows which is the one that
 * ran the count and the delete.
 */
export const MemberRemovalOutcomes = {
  REMOVED: 'REMOVED',
  NOT_A_MEMBER: 'NOT_A_MEMBER',
  LAST_OWNER: 'LAST_OWNER',
} as const;
export type MemberRemovalOutcome =
  (typeof MemberRemovalOutcomes)[keyof typeof MemberRemovalOutcomes];
