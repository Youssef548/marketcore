import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberRoles, type Organization, type OrganizationMember } from '@app/contracts';
import { slugify, type TenantContext } from '@app/domain';
import { OrganizationRepository } from './organization.repository';
import { MemberRemovalOutcomes } from './membership.interface';
import { OrganizationMessages } from './organization.constants';
import { OrganizationWriteOutcomes } from './organization-write.interface';
import { MembershipRepository } from './membership.repository';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  /**
   * `slug` is optional at the contract, so a caller may supply a name only and get
   * a slug derived from it. Both paths reach the same unique constraint, which is
   * the only authority on whether the slug is free.
   */
  async create(name: string, slug: string | undefined, userId: string): Promise<Organization> {
    const result = await this.organizationRepository.createWithOwner(
      name,
      slug ?? slugify(name),
      userId,
    );

    // The union does the narrowing, which is why there is no null check here: the
    // repository cannot return "created with no organization", so there is no
    // impossible state for this line to defend against.
    if (result.outcome === OrganizationWriteOutcomes.SLUG_TAKEN) {
      throw new ConflictException(OrganizationMessages.SLUG_TAKEN);
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
    if (user === null) throw new NotFoundException(OrganizationMessages.NO_SUCH_USER);

    const existing = await this.membershipRepository.findByOrgAndUser(
      tenant.organizationId,
      user.id,
    );
    if (existing !== null) throw new ConflictException(OrganizationMessages.ALREADY_A_MEMBER);

    await this.membershipRepository.add(tenant.organizationId, user.id, MemberRoles.MEMBER);
  }

  /**
   * "An organization retains at least one owner" is a rule over sibling rows,
   * which no CHECK can express. It is enforced inside one locked transaction in the
   * repository — counting owners and then deleting them are two statements, and a
   * plain transaction lets two concurrent removals of two owners both succeed and
   * leave none. This method only turns the outcome into a status.
   */
  async removeMember(tenant: TenantContext, userId: string): Promise<void> {
    const outcome = await this.membershipRepository.removeKeepingAnOwner(
      tenant.organizationId,
      userId,
    );

    if (outcome === MemberRemovalOutcomes.NOT_A_MEMBER) {
      throw new NotFoundException(OrganizationMessages.NOT_A_MEMBER);
    }
    if (outcome === MemberRemovalOutcomes.LAST_OWNER) {
      throw new ConflictException(OrganizationMessages.LAST_OWNER);
    }
  }
}
