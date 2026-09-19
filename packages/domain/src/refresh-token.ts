import {
  RefreshTokenVerdicts,
  type RefreshTokenState,
  type RefreshTokenVerdict,
} from './refresh-token.interface';

/** The verdict vocabulary ships with its decision, so callers import from one module. */
export * from './refresh-token.interface';

/**
 * The refresh decision, as a table rather than a chain of conditionals in a
 * service (conventions Rule 5).
 *
 * Replay is checked before expiry on purpose: a replayed token is the one
 * outcome that requires the session to be revoked, and reporting only
 * "rejected" for a long-dead replay would discard the actionable signal.
 */
export function decideRefreshTokenUse(state: RefreshTokenState, now: Date): RefreshTokenVerdict {
  if (!state.exists) return RefreshTokenVerdicts.REJECTED;
  if (state.sessionRevokedAt !== null) return RefreshTokenVerdicts.REJECTED;
  if (state.usedAt !== null) return RefreshTokenVerdicts.REPLAYED;
  if (state.expiresAt.getTime() <= now.getTime()) return RefreshTokenVerdicts.REJECTED;
  return RefreshTokenVerdicts.USABLE;
}
