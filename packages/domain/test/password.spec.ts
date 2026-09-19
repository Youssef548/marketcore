import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN_LENGTH, PasswordPolicyViolations, checkPasswordPolicy } from '../src/password';

describe('checkPasswordPolicy', () => {
  it('accepts a password at the minimum length', () => {
    expect(checkPasswordPolicy('a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });

  it('reports the specific violation rather than a boolean', () => {
    // A boolean would force every caller to invent its own message.
    expect(checkPasswordPolicy('short')).toBe(PasswordPolicyViolations.TOO_SHORT);
    expect(checkPasswordPolicy('a'.repeat(500))).toBe(PasswordPolicyViolations.TOO_LONG);
  });
});
