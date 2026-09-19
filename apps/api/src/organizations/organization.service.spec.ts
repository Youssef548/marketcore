import { ConflictException, NotFoundException } from '@nestjs/common';
import { MemberRoles } from '@app/contracts';
import { buildTenantContext } from '@app/domain';
import { MemberRemovalOutcomes } from './membership.interface';
import type { OrganizationRepository } from './organization.repository';
import { OrganizationWriteOutcomes } from './organization-write.interface';
import { OrganizationService } from './organization.service';
import type { MembershipRepository } from './membership.repository';

const tenant = buildTenantContext('org_1', MemberRoles.OWNER);

const build = (
  overrides: {
    removal?: string;
    findUserByEmail?: jest.Mock;
    findByOrgAndUser?: jest.Mock;
  } = {},
) => {
  const membershipRepository = {
    removeKeepingAnOwner: jest.fn().mockResolvedValue(overrides.removal ?? MemberRemovalOutcomes.REMOVED),
    findUserByEmail: overrides.findUserByEmail ?? jest.fn().mockResolvedValue({ id: 'u2' }),
    findByOrgAndUser:
      overrides.findByOrgAndUser ??
      jest.fn().mockResolvedValue({ organizationId: 'org_1', userId: 'u2', role: MemberRoles.MEMBER }),
    add: jest.fn().mockResolvedValue(undefined),
    listByOrg: jest.fn(),
  } as unknown as MembershipRepository;

  const organizationRepository = {
    createWithOwner: jest.fn().mockResolvedValue({
      outcome: OrganizationWriteOutcomes.CREATED,
      organization: {
        id: 'org_1',
        name: 'Nile',
        slug: 'nile',
        status: 'ACTIVE',
        role: MemberRoles.OWNER,
      },
    }),
    listForUser: jest.fn(),
    existsActive: jest.fn(),
  } as unknown as OrganizationRepository;

  return {
    service: new OrganizationService(organizationRepository, membershipRepository),
    membershipRepository,
    organizationRepository,
  };
};

describe('OrganizationService', () => {
  it('answers CONFLICT when the removal would leave no owner', async () => {
    // The rule itself — count and delete, atomically — lives in the repository,
    // because a rule over sibling rows needs one transaction to hold it. This
    // asserts the mapping from its verdict, and the concurrency proof is
    // owner-rule.integration-spec.ts against real Postgres.
    const { service } = build({ removal: MemberRemovalOutcomes.LAST_OWNER });

    await expect(service.removeMember(tenant, 'u2')).rejects.toBeInstanceOf(ConflictException);
  });

  it('answers NOT_FOUND when the target is not a member', async () => {
    const { service } = build({ removal: MemberRemovalOutcomes.NOT_A_MEMBER });

    await expect(service.removeMember(tenant, 'u2')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolves when the member is removed', async () => {
    const { service } = build({ removal: MemberRemovalOutcomes.REMOVED });

    await expect(service.removeMember(tenant, 'u2')).resolves.toBeUndefined();
  });

  it('answers CONFLICT when the slug is already taken', async () => {
    const { service, organizationRepository } = build();
    (organizationRepository.createWithOwner as jest.Mock).mockResolvedValue({
      outcome: OrganizationWriteOutcomes.SLUG_TAKEN,
    });

    await expect(service.create('Nile', 'nile', 'u1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns the created organization on success', async () => {
    const { service } = build();

    await expect(service.create('Nile', 'nile', 'u1')).resolves.toMatchObject({
      slug: 'nile',
      role: MemberRoles.OWNER,
    });
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
