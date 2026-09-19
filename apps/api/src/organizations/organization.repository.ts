import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/runtime';
import { MemberRoles, OrganizationStatuses, type Organization } from '@app/contracts';
import {
  OrganizationWriteOutcomes,
  type OrganizationWriteResult,
} from './organization-write.interface';

/**
 * Prisma's code for a unique constraint violation.
 *
 * Detected structurally rather than by importing Prisma's error class: the
 * generated client is a devDependency of this app (the integration tests import
 * it directly), so a runtime import here would be an extraneous dependency. The
 * code itself is the stable part of the contract.
 */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_CONSTRAINT_VIOLATION
  );
}

@Injectable()
export class OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The organization and its first owner commit together. An organization with no
   * owner is a tenant nobody can administer, and no later request could repair it.
   *
   * A taken slug is an outcome, not a failure: the caller can pick another one,
   * and the database is the only authority on whether it is taken — a check
   * followed by an insert would still race.
   */
  async createWithOwner(
    name: string,
    slug: string,
    userId: string,
  ): Promise<OrganizationWriteResult> {
    try {
      const organization = await this.prisma.$transaction(async (tx) => {
        const created = await tx.organization.create({
          data: { name, slug },
          select: { id: true, name: true, slug: true, status: true },
        });
        await tx.organizationMember.create({
          data: { organizationId: created.id, userId, role: MemberRoles.OWNER },
        });
        return created;
      });

      return {
        outcome: OrganizationWriteOutcomes.CREATED,
        organization: { ...organization, role: MemberRoles.OWNER },
      };
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        return { outcome: OrganizationWriteOutcomes.SLUG_TAKEN, organization: null };
      }
      throw error;
    }
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
