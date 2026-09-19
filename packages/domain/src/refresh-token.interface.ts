export const RefreshTokenVerdicts = {
  USABLE: 'USABLE',
  REJECTED: 'REJECTED',
  REPLAYED: 'REPLAYED',
} as const;
export type RefreshTokenVerdict = (typeof RefreshTokenVerdicts)[keyof typeof RefreshTokenVerdicts];

/**
 * A refresh token that was found, with everything the decision needs about it and
 * its session.
 *
 * **There is deliberately no `exists` flag and no absent shape here.** A token that
 * does not exist is not a token state — it is the absence of one, and the caller
 * already knows because its lookup returned nothing. Modelling it as a record forced
 * an empty id and an epoch date into existence purely to satisfy the type, and made
 * `exists: true` carrying no dates representable. "No row matched the hash" is now a
 * null check at the call site, which is where that fact already lives.
 *
 * `sessionExpiresAt` is here because the session is a hard cap: rotation renews the
 * token, not the session, so a client that refreshes forever still has to
 * authenticate again once the session's own expiry passes.
 */
export interface RefreshTokenState {
  expiresAt: Date;
  usedAt: Date | null;
  sessionRevokedAt: Date | null;
  sessionExpiresAt: Date;
}
