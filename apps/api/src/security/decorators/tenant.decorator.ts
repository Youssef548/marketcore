import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { TenantContext } from '@app/domain';
import type { AuthenticatedRequest } from '../request-context.interface';

/**
 * Reads what the OrganizationGuard resolved. Never reads the raw header: a
 * controller that parsed the header itself would be a second place tenancy is
 * established, and the two could disagree.
 */
export const Tenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.tenant === undefined) {
      throw new Error('Tenant used on a route the OrganizationGuard did not run for');
    }
    return request.tenant;
  },
);
