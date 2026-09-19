import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/runtime';
import { MemberRoles, type MemberRole, type OrganizationMember } from '@app/contracts';
import type { MembershipRecord } from './membership.interface';
import { MemberRemovalOutcomes, type MemberRemovalOutcome } from './membership.interface';

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

  async findUserByEmail(email: string): Promise<{ id: string } | null> {
    return this.prisma.user.findUnique({ where: { email }, select: { id: true } });
  }

  async add(organizationId: string, userId: string, role: MemberRole): Promise<void> {
    await this.prisma.organizationMember.create({ data: { organizationId, userId, role } });
  }

  /**
   * Removes a member, refusing when that would leave the organization with no
   * owner. A count and a delete, in one transaction, holding the organization row.
   *
   * **The lock is the point, not decoration.** At READ COMMITTED a plain
   * transaction is not enough: two concurrent removals of two different owners
   * both read a count of 2 and both delete, leaving the organization with none —
   * the exact invariant this rule exists to hold. `FOR UPDATE` on the parent row
   * serializes the count against the delete, so the second caller re-reads the
   * count after the first has committed.
   *
   * The count is taken only when the target is an owner: a plain member cannot be
   * the last owner, so paying for that query would buy an answer that cannot
   * change the decision.
   */
  async removeKeepingAnOwner(
    organizationId: string,
    userId: string,
  ): Promise<MemberRemovalOutcome> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`;

      const target = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { role: true },
      });
      if (target === null) return MemberRemovalOutcomes.NOT_A_MEMBER;

      if (target.role === MemberRoles.OWNER) {
        const owners = await tx.organizationMember.count({
          where: { organizationId, role: MemberRoles.OWNER },
        });
        if (owners <= 1) return MemberRemovalOutcomes.LAST_OWNER;
      }

      await tx.organizationMember.delete({
        where: { organizationId_userId: { organizationId, userId } },
      });
      return MemberRemovalOutcomes.REMOVED;
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
