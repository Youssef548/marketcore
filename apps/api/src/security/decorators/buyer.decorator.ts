import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { BuyerContext } from '@app/domain';
import type { AuthenticatedRequest } from '../../common/interfaces/request-context.interface';

/** Reads what BuyerGuard resolved. Never reads a buyer id from the request. */
export const Buyer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): BuyerContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.buyer === undefined) {
      throw new Error('Buyer used on a route that is not @TenantFree(), so BuyerGuard built nothing');
    }
    return request.buyer;
  },
);
