import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ORGANIZATION_ID_HEADER } from '@app/contracts';
import { buildTenantContext } from '@app/domain';
import { OrganizationRepository } from '../../organizations/organization.repository';
import { MembershipRepository } from '../../organizations/membership.repository';
import { SecurityMessages, SecurityMetadata } from '../security.constants';
import type { AuthenticatedRequest } from '../request-context.interface';

@Injectable()
export class OrganizationGuard implements CanActivate {
  constructor(
    private readonly membershipRepository: MembershipRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.skipped(context)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers[ORGANIZATION_ID_HEADER];
    const organizationId = Array.isArray(header) ? header[0] : header;

    if (organizationId === undefined || organizationId.length === 0) {
      throw new BadRequestException(SecurityMessages.MISSING_TENANT);
    }

    const userId = request.user?.id;
    const membership =
      userId === undefined
        ? null
        : await this.membershipRepository.findByOrgAndUser(organizationId, userId);

    // Not a member and organization-does-not-exist answer identically. The header
    // is an explicit claim, so refusing it discloses nothing the caller did not
    // already assert — and a different answer for "no such organization" would
    // turn this into a tenant-enumeration oracle.
    if (membership === null) throw new ForbiddenException(SecurityMessages.NOT_A_MEMBER);

    if (!(await this.organizationRepository.existsActive(organizationId))) {
      throw new ForbiddenException(SecurityMessages.ORGANIZATION_INACTIVE);
    }

    request.tenant = buildTenantContext(membership.organizationId, membership.role);
    return true;
  }

  private skipped(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(SecurityMetadata.PUBLIC, targets) ?? false;
    const isTenantFree =
      this.reflector.getAllAndOverride<boolean>(SecurityMetadata.TENANT_FREE, targets) ?? false;

    return isPublic || isTenantFree;
  }
}
