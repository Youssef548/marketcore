import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PasswordPolicyViolations,
  checkPasswordPolicy,
} from '../src/password';

/**
 * The policy is a pair of boundaries, and a boundary is exactly the thing an
 * example test cannot cover: it is easy to write `'short'` and a 12-character
 * password and never notice an off-by-one at either edge.
 */
describe('checkPasswordPolicy (property)', () => {
  it('classifies any length against the two boundaries, and nothing else', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: PASSWORD_MAX_LENGTH + 50 }), (length) => {
        const violation = checkPasswordPolicy('a'.repeat(length));

        const expected =
          length < PASSWORD_MIN_LENGTH
            ? PasswordPolicyViolations.TOO_SHORT
            : length > PASSWORD_MAX_LENGTH
              ? PasswordPolicyViolations.TOO_LONG
              : null;

        expect(violation).toBe(expected);
      }),
    );
  });

  it('accepts exactly the lengths between the boundaries, inclusive', () => {
    // The inclusive edges are stated directly rather than hoped for, because
    // off-by-one at min and max is the whole risk of a length policy.
    expect(checkPasswordPolicy('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe(
      PasswordPolicyViolations.TOO_SHORT,
    );
    expect(checkPasswordPolicy('a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
    expect(checkPasswordPolicy('a'.repeat(PASSWORD_MAX_LENGTH))).toBeNull();
    expect(checkPasswordPolicy('a'.repeat(PASSWORD_MAX_LENGTH + 1))).toBe(
      PasswordPolicyViolations.TOO_LONG,
    );
  });

  it('decides on length alone, whatever characters the password contains', () => {
    fc.assert(
      fc.property(fc.string({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH }), (password) => {
        expect(checkPasswordPolicy(password)).toBeNull();
      }),
    );
  });

  it('rejects every string below the minimum, not just the obvious ones', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: PASSWORD_MIN_LENGTH - 1 }), (tooShort) => {
        expect(checkPasswordPolicy(tooShort)).toBe(PasswordPolicyViolations.TOO_SHORT);
      }),
    );
  });
});
