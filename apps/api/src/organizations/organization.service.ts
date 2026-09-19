import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberRoles, type Organization, type OrganizationMember } from '@app/contracts';
import { slugify, type TenantContext } from '@app/domain';
import { OrganizationRepository } from './organization.repository';
import { OrganizationWriteOutcomes } from './organization-write.interface';
import { MembershipRepository } from './membership.repository';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  async create(name: string, slug: string, userId: string): Promise<Organization> {
    const result = await this.organizationRepository.createWithOwner(
      name,
      slug ?? slugify(name),
      userId,
    );

    // The union does the narrowing, which is why there is no null check here: the
    // repository cannot return "created with no organization", so there is no
    // impossible state for this line to defend against.
    if (result.outcome === OrganizationWriteOutcomes.SLUG_TAKEN) {
      throw new ConflictException('That slug is already taken');
    }

    return result.organization;
  }

  async listForUser(userId: string): Promise<Organization[]> {
    return this.organizationRepository.listForUser(userId);
  }

  async listMembers(tenant: TenantContext): Promise<OrganizationMember[]> {
    return this.membershipRepository.listByOrg(tenant.organizationId);
  }

  /**
   * No role check here, deliberately. The `RolesGuard` on the route is the single
   * enforcement point for owner-only actions, and a second check in the service
   * would be a second answer to the same question — the contract says 403, and
   * only one of the two would say it.
   */
  async addMember(tenant: TenantContext, email: string): Promise<void> {
    const user = await this.membershipRepository.findUserByEmail(email);
    if (user === null) throw new NotFoundException('No user with that email');

    const existing = await this.membershipRepository.findByOrgAndUser(
      tenant.organizationId,
      user.id,
    );
    if (existing !== null) throw new ConflictException('Already a member');

    await this.membershipRepository.add(tenant.organizationId, user.id, MemberRoles.MEMBER);
  }

  /**
   * "An organization retains at least one owner" is a rule over sibling rows,
   * which no CHECK can express — so it is enforced here and labelled a rule
   * rather than implying the database guarantees it.
   */
  async removeMember(tenant: TenantContext, userId: string): Promise<void> {
    const target = await this.membershipRepository.findByOrgAndUser(tenant.organizationId, userId);
    if (target === null) throw new NotFoundException('Not a member');

    if (target.role === MemberRoles.OWNER) {
      const owners = await this.membershipRepository.countOwners(tenant.organizationId);
      if (owners <= 1) {
        throw new ConflictException('An organization must retain at least one owner');
      }
    }

    await this.membershipRepository.remove(tenant.organizationId, userId);
  }
}
