import type { RefreshTokenState } from '@app/domain';

/**
 * A refresh token as loaded for the rotation decision: the token's own state plus
 * the session it belongs to, because the decision table needs both.
 *
 * `exists` is false when no row matched the hash — the service rejects before it
 * reads any identifier, so the empty id and session id are never used.
 */
export interface RefreshTokenRecord extends RefreshTokenState {
  id: string;
  sessionId: string;
}
