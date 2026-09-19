import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenService } from '../../auth/tokens/token.service';
import { SecurityMessages, SecurityMetadata } from '../security.constants';
import type { AuthenticatedRequest } from '../request-context.interface';

const BEARER_PREFIX = 'Bearer ';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException(SecurityMessages.MISSING_TOKEN);
    }

    try {
      const payload = await this.tokenService.verifyAccessToken(
        header.slice(BEARER_PREFIX.length),
      );
      request.user = { id: payload.sub };
      return true;
    } catch {
      // One message for expired, malformed and wrongly-signed alike: the caller's
      // remedy is the same for all three, and distinguishing them tells an
      // attacker which part of a forged token was wrong.
      throw new UnauthorizedException(SecurityMessages.MISSING_TOKEN);
    }
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(SecurityMetadata.PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }
}
