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
