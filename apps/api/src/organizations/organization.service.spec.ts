import { ConflictException, NotFoundException } from '@nestjs/common';
import { MemberRoles } from '@app/contracts';
import { buildTenantContext } from '@app/domain';
import type { MembershipRepository } from './membership.repository';
import type { OrganizationRepository } from './organization.repository';
import { OrganizationService } from './organization.service';

const tenant = buildTenantContext('org_1', MemberRoles.OWNER);

const build = (overrides: {
  countOwners?: jest.Mock;
  findUserByEmail?: jest.Mock;
  findByOrgAndUser?: jest.Mock;
  remove?: jest.Mock;
}) => {
  const membershipRepository = {
    countOwners: overrides.countOwners ?? jest.fn().mockResolvedValue(2),
    findUserByEmail: overrides.findUserByEmail ?? jest.fn().mockResolvedValue({ id: 'u2' }),
    findByOrgAndUser:
      overrides.findByOrgAndUser ??
      jest.fn().mockResolvedValue({ organizationId: 'org_1', userId: 'u2', role: MemberRoles.MEMBER }),
    add: jest.fn().mockResolvedValue(undefined),
    remove: overrides.remove ?? jest.fn().mockResolvedValue(undefined),
    listByOrg: jest.fn(),
  } as unknown as MembershipRepository;

  const organizationRepository = {
    createWithOwner: jest.fn(),
    listForUser: jest.fn(),
    existsActive: jest.fn(),
  } as unknown as OrganizationRepository;

  return {
    service: new OrganizationService(organizationRepository, membershipRepository),
    membershipRepository,
  };
};

describe('OrganizationService', () => {
  it('refuses to remove the last owner, which is a rule and not a constraint', async () => {
    const { service } = build({
      countOwners: jest.fn().mockResolvedValue(1),
      findByOrgAndUser: jest.fn().mockResolvedValue({
        organizationId: 'org_1',
        userId: 'u2',
        role: MemberRoles.OWNER,
      }),
    });

    await expect(service.removeMember(tenant, 'u2')).rejects.toBeInstanceOf(ConflictException);
  });

  it('removes a member when another owner remains', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const { service } = build({ countOwners: jest.fn().mockResolvedValue(2), remove });

    await service.removeMember(tenant, 'u2');

    expect(remove).toHaveBeenCalledWith('org_1', 'u2');
  });

  it('removes a plain member without counting owners at all', async () => {
    // The count is a query; a member cannot be the last owner, so paying for it
    // would be a query whose answer could not change the decision.
    const countOwners = jest.fn().mockResolvedValue(1);
    const remove = jest.fn().mockResolvedValue(undefined);
    const { service } = build({ countOwners, remove });

    await service.removeMember(tenant, 'u2');

    expect(remove).toHaveBeenCalledWith('org_1', 'u2');
    expect(countOwners).not.toHaveBeenCalled();
  });

  it('reports an unknown email rather than creating a phantom membership', async () => {
    const { service } = build({ findUserByEmail: jest.fn().mockResolvedValue(null) });

    await expect(service.addMember(tenant, 'ghost@b.test')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to add someone who is already a member', async () => {
    const { service } = build({
      findByOrgAndUser: jest.fn().mockResolvedValue({
        organizationId: 'org_1',
        userId: 'u2',
        role: MemberRoles.MEMBER,
      }),
    });

    await expect(service.addMember(tenant, 'u2@b.test')).rejects.toBeInstanceOf(ConflictException);
  });
});
