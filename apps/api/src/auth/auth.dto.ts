import { createZodDto } from 'nestjs-zod';
import {
  LoginRequestSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
  TokenPairSchema,
  UserSummarySchema,
  LogoutRequestSchema,
} from '@app/contracts';

// DTOs exist to give Swagger named components. The schemas themselves live in
// @app/contracts, which is the source of truth — and per the health module's
// finding, a schema used as a DTO source carries no `.meta({ id })`.
export class RegisterRequestDto extends createZodDto(RegisterRequestSchema) {}
export class LoginRequestDto extends createZodDto(LoginRequestSchema) {}
export class RefreshRequestDto extends createZodDto(RefreshRequestSchema) {}
export class LogoutRequestDto extends createZodDto(LogoutRequestSchema) {}
export class UserSummaryDto extends createZodDto(UserSummarySchema) {}
export class TokenPairDto extends createZodDto(TokenPairSchema) {}
