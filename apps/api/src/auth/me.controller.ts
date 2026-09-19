import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import type { UserSummary } from '@app/contracts';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { TenantFree } from '../security/decorators/tenant-free.decorator';
import type { AuthenticatedUser } from '../security/request-context.interface';
import { UserSummaryDto } from './auth.dto';
import { AuthService } from './auth.service';

/**
 * Who the caller is.
 *
 * Deliberately **not** a method on `AuthController`. That class carries a
 * class-level `@Public()`, and the guard resolves that metadata from the handler
 * *and* the class (`reflector.getAllAndOverride([handler, class])`). There is no
 * marker that opts a single method back into requiring a token, so a `me` route
 * added there would have been reachable with no credentials at all — and
 * `grep '@Public'`, which is supposed to be the complete list of unauthenticated
 * routes, would have gone on reading as though it were not.
 *
 * `@TenantFree` because naming yourself cannot require naming an organization,
 * exactly like organization creation and listing. The access token guard still
 * runs, so this route is authenticated; it is only the tenant header that is not
 * required.
 */
@Controller('auth')
export class MeController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @TenantFree()
  @ApiOkResponse({ type: UserSummaryDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserSummary> {
    return this.authService.getUser(user.id);
  }
}
