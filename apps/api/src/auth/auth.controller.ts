import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import type { TokenPair, UserSummary } from '@app/contracts';
import { AuthService } from './auth.service';
import {
  LoginRequestDto,
  LogoutRequestDto,
  RefreshRequestDto,
  RegisterRequestDto,
  TokenPairDto,
  UserSummaryDto,
} from './auth.dto';

/**
 * Registration and login are how a caller obtains a token, so they cannot
 * require one. The `@Public()` marker arrives with the security module
 * (Task 11) — until then these routes are simply reachable without a token,
 * because no global guard exists yet.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiCreatedResponse({ type: UserSummaryDto })
  register(@Body() body: RegisterRequestDto): Promise<UserSummary> {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokenPairDto })
  login(@Body() body: LoginRequestDto): Promise<TokenPair> {
    return this.authService.login(body);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokenPairDto })
  refresh(@Body() body: RefreshRequestDto): Promise<TokenPair> {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  logout(@Body() body: LogoutRequestDto): Promise<void> {
    return this.authService.logout(body.refreshToken);
  }
}
