export const RefreshTokenVerdicts = {
  USABLE: 'USABLE',
  REJECTED: 'REJECTED',
  REPLAYED: 'REPLAYED',
} as const;
export type RefreshTokenVerdict = (typeof RefreshTokenVerdicts)[keyof typeof RefreshTokenVerdicts];

/** Everything the decision needs about a presented token, read in one query. */
export interface RefreshTokenState {
  exists: boolean;
  expiresAt: Date;
  usedAt: Date | null;
  sessionRevokedAt: Date | null;
}
