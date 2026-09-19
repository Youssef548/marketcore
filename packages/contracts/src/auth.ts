import { z } from 'zod';

/**
 * How long the API issues a refresh token for — and therefore the longest lifetime
 * a client may hold one for.
 *
 * This is the one auth value that is not implementation-private to the API. The
 * API decides when a refresh token stops working, and the web app sets a cookie
 * lifetime that has to match it: shorter and a user is logged out while their
 * session is still valid, longer and the cookie outlives the only credential in it.
 * Two copies of that number would not fail a test when one of them changed, which
 * is the whole reason it is defined where both processes can import it. The API
 * re-exports it from `auth.constants.ts` so its own import sites do not move.
 */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
