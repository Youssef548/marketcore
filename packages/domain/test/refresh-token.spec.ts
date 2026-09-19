import { describe, expect, it } from 'vitest';
import { RefreshTokenVerdicts, decideRefreshTokenUse } from '../src/refresh-token';

const now = new Date('2026-09-19T12:00:00.000Z');
const future = new Date('2026-10-19T12:00:00.000Z');
const past = new Date('2026-09-18T12:00:00.000Z');

const state = (overrides: Partial<Parameters<typeof decideRefreshTokenUse>[0]> = {}) => ({
  exists: true,
  expiresAt: future,
  usedAt: null,
  sessionRevokedAt: null,
  ...overrides,
});

describe('decideRefreshTokenUse', () => {
  it('accepts a live, unused token in a live session', () => {
    expect(decideRefreshTokenUse(state(), now)).toBe(RefreshTokenVerdicts.USABLE);
  });

  it('rejects a token that does not exist', () => {
    expect(decideRefreshTokenUse(state({ exists: false }), now)).toBe(RefreshTokenVerdicts.REJECTED);
  });

  it('rejects a token in a revoked session', () => {
    expect(decideRefreshTokenUse(state({ sessionRevokedAt: past }), now)).toBe(
      RefreshTokenVerdicts.REJECTED,
    );
  });

  it('rejects an expired token', () => {
    expect(decideRefreshTokenUse(state({ expiresAt: past }), now)).toBe(RefreshTokenVerdicts.REJECTED);
  });

  it('reports a replay when an already-used token is presented', () => {
    expect(decideRefreshTokenUse(state({ usedAt: past }), now)).toBe(RefreshTokenVerdicts.REPLAYED);
  });

  it('prefers the replay verdict over expiry, because a replay is the actionable signal', () => {
    // An attacker replaying a long-dead token is still an event worth revoking
    // for; reporting only "rejected" would discard that.
    expect(decideRefreshTokenUse(state({ usedAt: past, expiresAt: past }), now)).toBe(
      RefreshTokenVerdicts.REPLAYED,
    );
  });
});
