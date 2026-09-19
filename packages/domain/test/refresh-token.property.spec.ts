import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { RefreshTokenVerdicts } from '../src/refresh-token';
import type { RefreshTokenState } from '../src/refresh-token.interface';
import { decideRefreshTokenUse } from '../src/refresh-token';

/**
 * These properties encode the *precedence* the module documents, which is the part
 * a reader cannot verify by looking at one example: replay is decided before any
 * expiry (so a stolen long-dead token still reports REPLAYED and still triggers
 * revocation), and the session bound is decided before the token bound (because
 * rotation renews the token, never the session).
 */
const aDate = fc.date({ min: new Date('2020-01-01'), max: new Date('2035-01-01') });

const aState = fc
  .record({
    expiresAt: aDate,
    sessionExpiresAt: aDate,
    usedAt: fc.option(aDate, { nil: null }),
    sessionRevokedAt: fc.option(aDate, { nil: null }),
  })
  .map((state) => state as RefreshTokenState);

describe('decideRefreshTokenUse (property)', () => {
  it('reports REJECTED whenever the session has been revoked, whatever else is true', () => {
    fc.assert(
      fc.property(aState, aDate, (state, now) => {
        fc.pre(state.sessionRevokedAt !== null);

        expect(decideRefreshTokenUse(state, now)).toBe(RefreshTokenVerdicts.REJECTED);
      }),
    );
  });

  it('reports REPLAYED before any expiry, so a replay is never hidden behind "expired"', () => {
    fc.assert(
      fc.property(aState, aDate, (state, now) => {
        fc.pre(state.sessionRevokedAt === null);
        fc.pre(state.usedAt !== null);
        fc.pre(state.expiresAt.getTime() <= now.getTime());

        expect(decideRefreshTokenUse(state, now)).toBe(RefreshTokenVerdicts.REPLAYED);
      }),
    );
  });

  it('reports REJECTED once the session bound passes, even with a fresh token', () => {
    fc.assert(
      fc.property(aState, aDate, (state, now) => {
        fc.pre(state.sessionRevokedAt === null);
        fc.pre(state.usedAt === null);
        fc.pre(state.sessionExpiresAt.getTime() <= now.getTime());

        expect(decideRefreshTokenUse(state, now)).toBe(RefreshTokenVerdicts.REJECTED);
      }),
    );
  });

  it('returns USABLE only when the token is unused, unrevoked and inside both bounds', () => {
    fc.assert(
      fc.property(aState, aDate, (state, now) => {
        const usable = decideRefreshTokenUse(state, now) === RefreshTokenVerdicts.USABLE;

        expect(usable).toBe(
          state.sessionRevokedAt === null &&
            state.usedAt === null &&
            state.sessionExpiresAt.getTime() > now.getTime() &&
            state.expiresAt.getTime() > now.getTime(),
        );
      }),
    );
  });

  it('never returns REPLAYED for a token that was never used', () => {
    fc.assert(
      fc.property(aState, aDate, (state, now) => {
        fc.pre(state.usedAt === null);

        expect(decideRefreshTokenUse(state, now)).not.toBe(RefreshTokenVerdicts.REPLAYED);
      }),
    );
  });

  it('treats an expiry exactly equal to now as expired, on both bounds', () => {
    // The equality case is the one a random date generator will never produce, and
    // mutation testing found both `<` comparisons could become `<=` unnoticed.
    const now = new Date('2030-01-01T00:00:00.000Z');
    const later = new Date('2031-01-01T00:00:00.000Z');
    const base = { usedAt: null, sessionRevokedAt: null };

    // At the session bound.
    expect(decideRefreshTokenUse({ ...base, expiresAt: later, sessionExpiresAt: now }, now)).toBe(
      RefreshTokenVerdicts.REJECTED,
    );
    // At the token bound, with the session still alive.
    expect(decideRefreshTokenUse({ ...base, expiresAt: now, sessionExpiresAt: later }, now)).toBe(
      RefreshTokenVerdicts.REJECTED,
    );
    // One millisecond inside the bound is usable, which is what makes the two above
    // about equality rather than about the comparison being off by more than it is.
    const justAlive = new Date(now.getTime() + 1);
    expect(
      decideRefreshTokenUse({ ...base, expiresAt: justAlive, sessionExpiresAt: justAlive }, now),
    ).toBe(RefreshTokenVerdicts.USABLE);
  });

  it('answers one of the three verdicts for every state and time', () => {
    fc.assert(
      fc.property(aState, aDate, (state, now) => {
        expect(Object.values(RefreshTokenVerdicts)).toContain(decideRefreshTokenUse(state, now));
      }),
    );
  });
});
