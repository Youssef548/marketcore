import type { RefreshTokenState } from '@app/domain';

/**
 * A refresh token as loaded for the rotation decision: the token's own state, the
 * session it belongs to, and the identifiers the rotation needs.
 *
 * A lookup miss is `null`, not a record with empty ids — so there is no sentinel for
 * a caller to read an identifier from by mistake.
 */
export interface RefreshTokenRecord extends RefreshTokenState {
  id: string;
  sessionId: string;
}
