import { PasswordPolicyViolations, type PasswordPolicyViolation } from './password.interface';

/** The policy's vocabulary ships with its rule, so callers import from one module. */
export * from './password.interface';

/** A minimum, not a character-class rule: length beats composition for guessing resistance. */
export const PASSWORD_MIN_LENGTH = 12;

/** Bounded so a hostile request cannot hand argon2 an unbounded input. */
export const PASSWORD_MAX_LENGTH = 200;

/** Returns the violation, or null when the password satisfies the policy. */
export function checkPasswordPolicy(password: string): PasswordPolicyViolation | null {
  if (password.length < PASSWORD_MIN_LENGTH) return PasswordPolicyViolations.TOO_SHORT;
  if (password.length > PASSWORD_MAX_LENGTH) return PasswordPolicyViolations.TOO_LONG;
  return null;
}
