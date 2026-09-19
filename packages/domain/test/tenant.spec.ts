import { describe, expect, it } from 'vitest';
import { MemberRoles } from '@app/contracts';
import { buildTenantContext, tenantScope } from '../src/tenant';

describe('buildTenantContext', () => {
  it('carries the organization and the role the guard resolved', () => {
    const tenant = buildTenantContext('org_1', MemberRoles.OWNER);

    expect(tenant).toEqual({ organizationId: 'org_1', role: MemberRoles.OWNER });
  });

  it('refuses to build without an organization id', () => {
    // The invalid state is unrepresentable rather than validated later: a
    // TenantContext that exists always names a tenant.
    expect(() => buildTenantContext('', MemberRoles.MEMBER)).toThrow(/organizationId/);
  });
});

describe('tenantScope', () => {
  it('produces the filter every tenant query composes from', () => {
    const tenant = buildTenantContext('org_2', MemberRoles.MEMBER);

    expect(tenantScope(tenant)).toEqual({ organizationId: 'org_2' });
  });
});
