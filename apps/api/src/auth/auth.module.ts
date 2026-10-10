import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { createLogger, validateEnv } from '@app/runtime';
import { AUTH_LOGGER, AUTH_THROTTLE_LIMIT, AUTH_THROTTLE_TTL_MS, PASSWORD_HASHER } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { MeController } from './me.controller';
import { Argon2PasswordHasher } from './password/argon2-password-hasher';
import { SessionsRepository } from './sessions.repository';
import { TokenService } from './tokens/token.service';

@Module({
  // `@nestjs/jwt` is pinned to the v11 line deliberately: v12 is published as
  // ESM-only (`"type": "module"`, no CommonJS export), and this app is CommonJS,
  // so `require('@nestjs/jwt')` fails under ts-jest and would fail at boot.
  imports: [
    JwtModule.register({ secret: validateEnv().JWT_SECRET }),
    // Throttles this module's own routes rather than the whole app: the auth
    // endpoints are the ones worth brute-forcing. The window and cap are constants
    // tuned above what an ordinary client does, so only a script is refused.
    ThrottlerModule.forRoot([{ ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT }]),
  ],
  // MeController is separate rather than another handler on AuthController: that
  // class is @Public(), which the guard applies to every handler on it. See the
  // comment on MeController.
  controllers: [AuthController, MeController],
  // Repositories before services: the service depends on the repository.
  providers: [
    AuthRepository,
    SessionsRepository,
    Argon2PasswordHasher,
    { provide: PASSWORD_HASHER, useExisting: Argon2PasswordHasher },
    // The logger the service emits its security events through. A factory rather
    // than a class so the context ('auth') is fixed here and the service depends on
    // the `LoggerService` interface, not on `@nestjs/common`'s concrete Logger.
    { provide: AUTH_LOGGER, useFactory: () => createLogger('auth') },
    TokenService,
    AuthService,
  ],
  // TokenService is exported because the global AccessTokenGuard needs it
  // (Task 11).
  exports: [TokenService],
})
export class AuthModule {}
