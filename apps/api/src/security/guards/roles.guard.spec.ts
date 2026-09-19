import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { MemberRoles } from '@app/contracts';
import { buildTenantContext, type TenantContext } from '@app/domain';
import { RolesGuard } from './roles.guard';

const contextFor = (tenant: TenantContext | undefined) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ tenant }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext;

const guardFor = (ownerOnly: boolean) =>
  new RolesGuard({ getAllAndOverride: jest.fn().mockReturnValue(ownerOnly) } as never);

describe('RolesGuard', () => {
  it('lets any authenticated caller through a route that is not owner-only', () => {
    expect(guardFor(false).canActivate(contextFor(undefined))).toBe(true);
  });

  it('refuses an owner-only route when no tenant was resolved', () => {
    // Fails closed: if the organization guard were skipped or reordered, this is a
    // 403 rather than an accidental pass.
    expect(() => guardFor(true).canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });

  it('refuses an owner-only route for a member', () => {
    const tenant = buildTenantContext('org_1', MemberRoles.MEMBER);

    expect(() => guardFor(true).canActivate(contextFor(tenant))).toThrow(ForbiddenException);
  });

  it('allows an owner-only route for an owner', () => {
    const tenant = buildTenantContext('org_1', MemberRoles.OWNER);

    expect(guardFor(true).canActivate(contextFor(tenant))).toBe(true);
  });
});
