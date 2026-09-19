import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import type { TokenPair, UserSummary } from '@app/contracts';
import { Public } from '../security/decorators/public.decorator';
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
 * Public: these routes are how a caller obtains a token, so they cannot require
 * one. The marker is explicit because every route is otherwise guarded — the
 * `grep '@Public'` list is the complete set of routes reachable without a token.
 */
@Public()
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
