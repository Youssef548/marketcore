import type { MemberRole } from '@app/contracts';
import type { TenantContext, TenantScope } from './tenant.interface';

/**
 * The only sanctioned way to construct a TenantContext. An empty id throws here
 * rather than silently producing a filter that matches nothing or everything.
 */
export function buildTenantContext(organizationId: string, role: MemberRole): TenantContext {
  if (organizationId.length === 0) {
    throw new Error('buildTenantContext requires an organizationId');
  }
  return { organizationId, role };
}

/**
 * The single definition of the tenant filter. Every repository composes its
 * `where` from this, so the shape cannot drift between call sites.
 */
export function tenantScope(tenant: TenantContext): TenantScope {
  return { organizationId: tenant.organizationId };
}
