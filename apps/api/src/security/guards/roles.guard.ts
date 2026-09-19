import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { canManageMembership } from '@app/domain';
import { SecurityMessages, SecurityMetadata } from '../security.constants';
import type { AuthenticatedRequest } from '../request-context.interface';

/**
 * Reads the membership the OrganizationGuard already loaded, so it costs no query.
 * Runs last, which is why the tenant is guaranteed to exist by the time it does.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const ownerOnly =
      this.reflector.getAllAndOverride<boolean>(SecurityMetadata.OWNER_ONLY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    if (!ownerOnly) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.tenant === undefined || !canManageMembership(request.tenant.role)) {
      throw new ForbiddenException(SecurityMessages.OWNER_ONLY);
    }
    return true;
  }
}
