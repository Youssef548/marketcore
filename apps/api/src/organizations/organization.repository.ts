import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/runtime';
import { MemberRoles, OrganizationStatuses, type Organization } from '@app/contracts';

@Injectable()
export class OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The organization and its first owner commit together. An organization with no
   * owner is a tenant nobody can administer, and no later request could repair it.
   */
  async createWithOwner(name: string, slug: string, userId: string): Promise<Organization> {
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name, slug },
        select: { id: true, name: true, slug: true, status: true },
      });
      await tx.organizationMember.create({
        data: { organizationId: organization.id, userId, role: MemberRoles.OWNER },
      });
      return { ...organization, role: MemberRoles.OWNER };
    });
  }

  /**
   * A user's organizations, with their role in each. This is how a client learns
   * which values are legal in the organization header.
   */
  async listForUser(userId: string): Promise<Organization[]> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: {
        role: true,
        organization: { select: { id: true, name: true, slug: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => ({ ...membership.organization, role: membership.role }));
  }

  /** Read by the organization guard, which refuses a header naming an inactive tenant. */
  async existsActive(organizationId: string): Promise<boolean> {
    const found = await this.prisma.organization.findFirst({
      where: { id: organizationId, status: OrganizationStatuses.ACTIVE },
      select: { id: true },
    });
    return found !== null;
  }
}
