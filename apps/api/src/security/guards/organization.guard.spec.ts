import { BadRequestException, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { MemberRoles, ORGANIZATION_ID_HEADER } from '@app/contracts';
import { OrganizationGuard } from './organization.guard';

const contextFor = (headers: Record<string, string>, user: { id: string } | undefined) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers, user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext;

const guardWith = (membership: unknown, active = true, ownerOnly = false) =>
  new OrganizationGuard(
    { findByOrgAndUser: jest.fn().mockResolvedValue(membership) } as never,
    { existsActive: jest.fn().mockResolvedValue(active) } as never,
    { getAllAndOverride: jest.fn().mockReturnValue(ownerOnly) } as never,
  );

describe('OrganizationGuard', () => {
  it('refuses a request that names no organization', async () => {
    await expect(guardWith(null).canActivate(contextFor({}, { id: 'u1' }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses an organization the caller is not a member of', async () => {
    await expect(
      guardWith(null).canActivate(contextFor({ [ORGANIZATION_ID_HEADER]: 'org_9' }, { id: 'u1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an inactive organization even for a member', async () => {
    const guard = guardWith(
      { organizationId: 'org_1', userId: 'u1', role: MemberRoles.OWNER },
      false,
    );

    await expect(
      guard.canActivate(contextFor({ [ORGANIZATION_ID_HEADER]: 'org_1' }, { id: 'u1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('attaches a tenant context on success', async () => {
    const request: {
      headers: Record<string, string>;
      user: { id: string };
      tenant?: unknown;
    } = { headers: { [ORGANIZATION_ID_HEADER]: 'org_1' }, user: { id: 'u1' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
    const guard = guardWith({ organizationId: 'org_1', userId: 'u1', role: MemberRoles.MEMBER });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.tenant).toEqual({ organizationId: 'org_1', role: MemberRoles.MEMBER });
  });
});
