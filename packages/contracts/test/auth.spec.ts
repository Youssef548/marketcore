import { describe, expect, it } from 'vitest';
import { LoginRequestSchema, REFRESH_TOKEN_TTL_MS, RegisterRequestSchema } from '../src/auth';

describe('refresh token lifetime', () => {
  it('is pinned by value, because a client sets a cookie lifetime from it', () => {
    // The same argument as constants.spec.ts: every other test imports this value,
    // so both sides of an assertion would move together and a change would keep the
    // suite green. Here the second side is a browser cookie, which does not move.
    expect(REFRESH_TOKEN_TTL_MS).toBe(2_592_000_000);
    expect(REFRESH_TOKEN_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('auth request schemas', () => {
  it('accepts an email and a non-empty password', () => {
    expect(RegisterRequestSchema.safeParse({ email: 'a@b.test', password: 'x' }).success).toBe(true);
    expect(LoginRequestSchema.safeParse({ email: 'a@b.test', password: 'x' }).success).toBe(true);
  });

  it('rejects a password that is empty, leaving the policy to the domain', () => {
    // Length is a business rule and lives in @app/domain; the contract only
    // insists the field was supplied at all.
    expect(RegisterRequestSchema.safeParse({ email: 'a@b.test', password: '' }).success).toBe(false);
  });

  it('rejects a malformed email', () => {
    expect(RegisterRequestSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
  });
});
