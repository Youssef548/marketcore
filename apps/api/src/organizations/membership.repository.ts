import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/runtime';
import { MemberRoles, type MemberRole, type OrganizationMember } from '@app/contracts';
import type { MembershipRecord } from './membership.interface';

@Injectable()
export class MembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** What the organization guard resolves a request's tenant from. */
  async findByOrgAndUser(organizationId: string, userId: string): Promise<MembershipRecord | null> {
    return this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { organizationId: true, userId: true, role: true },
    });
  }

  /**
   * Counted rather than stored: "an organization always has an owner" is a rule
   * over sibling rows, so no CHECK can express it and no column can hold it.
   */
  async countOwners(organizationId: string): Promise<number> {
    return this.prisma.organizationMember.count({
      where: { organizationId, role: MemberRoles.OWNER },
    });
  }

  async findUserByEmail(email: string): Promise<{ id: string } | null> {
    return this.prisma.user.findUnique({ where: { email }, select: { id: true } });
  }

  async add(organizationId: string, userId: string, role: MemberRole): Promise<void> {
    await this.prisma.organizationMember.create({ data: { organizationId, userId, role } });
  }

  async remove(organizationId: string, userId: string): Promise<void> {
    await this.prisma.organizationMember.delete({
      where: { organizationId_userId: { organizationId, userId } },
    });
  }

  async listByOrg(organizationId: string): Promise<OrganizationMember[]> {
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      select: { userId: true, role: true, user: { select: { email: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((member) => ({
      userId: member.userId,
      email: member.user.email,
      role: member.role,
    }));
  }
}
