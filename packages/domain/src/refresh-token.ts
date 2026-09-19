import {
  RefreshTokenVerdicts,
  type RefreshTokenState,
  type RefreshTokenVerdict,
} from './refresh-token.interface';

/**
 * The outcome vocabulary ships with its rule, so a caller imports the decision and
 * the verdicts it can return from one module (conventions Rule 3 keeps the types in
 * their own file; this is the re-export that makes the pair usable together).
 */
export * from './refresh-token.interface';

/**
 * The refresh decision, as a table rather than a chain of conditionals in a
 * service (conventions Rule 5).
 *
 * The order is deliberate. Replay is checked before any expiry: a replayed token
 * is the one outcome that requires the session to be revoked, and reporting only
 * "rejected" for a long-dead replay would discard the actionable signal. Session
 * expiry precedes token expiry because it is the outer bound — once it passes, no
 * token in the session is usable however fresh it is.
 */
export function decideRefreshTokenUse(state: RefreshTokenState, now: Date): RefreshTokenVerdict {
  if (!state.exists) return RefreshTokenVerdicts.REJECTED;
  if (state.sessionRevokedAt !== null) return RefreshTokenVerdicts.REJECTED;
  if (state.usedAt !== null) return RefreshTokenVerdicts.REPLAYED;
  if (state.sessionExpiresAt.getTime() <= now.getTime()) return RefreshTokenVerdicts.REJECTED;
  if (state.expiresAt.getTime() <= now.getTime()) return RefreshTokenVerdicts.REJECTED;
  return RefreshTokenVerdicts.USABLE;
}
