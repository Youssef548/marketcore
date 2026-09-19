import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { validateEnv } from '@app/runtime';
import { PASSWORD_HASHER } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { Argon2PasswordHasher } from './password/argon2-password-hasher';
import { SessionsRepository } from './sessions.repository';
import { TokenService } from './tokens/token.service';

@Module({
  // `@nestjs/jwt` is pinned to the v11 line deliberately: v12 is published as
  // ESM-only (`"type": "module"`, no CommonJS export), and this app is CommonJS,
  // so `require('@nestjs/jwt')` fails under ts-jest and would fail at boot.
  imports: [JwtModule.register({ secret: validateEnv().JWT_SECRET })],
  controllers: [AuthController],
  // Repositories before services: the service depends on the repository.
  providers: [
    AuthRepository,
    SessionsRepository,
    Argon2PasswordHasher,
    { provide: PASSWORD_HASHER, useExisting: Argon2PasswordHasher },
    TokenService,
    AuthService,
  ],
  // TokenService is exported because the global AccessTokenGuard needs it
  // (Task 11).
  exports: [TokenService],
})
export class AuthModule {}
