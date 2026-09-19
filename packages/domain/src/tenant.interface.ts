import type { MemberRole } from '@app/contracts';

/**
 * The tenant a request is acting within. Built by the guard from a validated
 * membership, never assembled by hand at a call site.
 */
export interface TenantContext {
  organizationId: string;
  role: MemberRole;
}

/** The filter shape every tenant-scoped query composes its `where` from. */
export interface TenantScope {
  organizationId: string;
}
