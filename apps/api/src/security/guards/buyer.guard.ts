import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { buildBuyerContext } from '@app/domain';
import { SecurityMetadata } from '../security.constants';
import type { AuthenticatedRequest } from '../../common/interfaces/request-context.interface';

/**
 * Resolves who the buyer is, the way OrganizationGuard resolves which tenant:
 * once, in a guard, from something the caller cannot forge — the access token's
 * subject (D75). A controller never reads a buyer id from the request.
 */
@Injectable()
export class BuyerGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(SecurityMetadata.PUBLIC, targets) ?? false;
    const isTenantFree =
      this.reflector.getAllAndOverride<boolean>(SecurityMetadata.TENANT_FREE, targets) ?? false;

    if (isPublic || !isTenantFree) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user !== undefined) request.buyer = buildBuyerContext(request.user.id);
    return true;
  }
}
