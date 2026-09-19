import { z } from 'zod';

export const RegisterRequestSchema = z.object({
  email: z.email(),
  // Deliberately only "present". Length is a business rule in @app/domain, so the
  // policy has one home and the contract does not carry a second copy of it.
  password: z.string().min(1),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RefreshRequestSchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const LogoutRequestSchema = z.object({ refreshToken: z.string().min(1) });
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

export const UserSummarySchema = z.object({ id: z.string(), email: z.string() });
export type UserSummary = z.infer<typeof UserSummarySchema>;
