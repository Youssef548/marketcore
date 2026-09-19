import { describe, expect, it } from 'vitest';
import { LoginRequestSchema, RegisterRequestSchema } from '../src/auth';

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
