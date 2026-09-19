import { describe, expect, it } from 'vitest';
import { MemberRoles } from '@app/contracts';
import { canManageMembership, canReadTenant } from '../src/roles';

describe('role rules', () => {
  it('lets only an owner manage membership', () => {
    expect(canManageMembership(MemberRoles.OWNER)).toBe(true);
    expect(canManageMembership(MemberRoles.MEMBER)).toBe(false);
  });

  it('lets both roles read tenant data', () => {
    expect(canReadTenant(MemberRoles.OWNER)).toBe(true);
    expect(canReadTenant(MemberRoles.MEMBER)).toBe(true);
  });
});
