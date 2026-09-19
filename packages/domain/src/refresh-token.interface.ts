export const RefreshTokenVerdicts = {
  USABLE: 'USABLE',
  REJECTED: 'REJECTED',
  REPLAYED: 'REPLAYED',
} as const;
export type RefreshTokenVerdict = (typeof RefreshTokenVerdicts)[keyof typeof RefreshTokenVerdicts];

/**
 * Everything the decision needs about a presented token, read in one query.
 *
 * `sessionExpiresAt` is here because the session is a hard cap: rotation renews the
 * token, not the session, so a client that refreshes forever still has to
 * authenticate again once the session's own expiry passes. Without this the column
 * was written and never read, which made it bookkeeping rather than a limit.
 */
export interface RefreshTokenState {
  exists: boolean;
  expiresAt: Date;
  usedAt: Date | null;
  sessionRevokedAt: Date | null;
  sessionExpiresAt: Date;
}
