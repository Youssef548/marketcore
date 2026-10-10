import { PASSWORD_MIN_LENGTH } from '@app/contracts';
import { PasswordPolicyViolations, type PasswordPolicyViolation } from './password.interface';

/** The policy's vocabulary ships with its rule, so callers import from one module. */
export * from './password.interface';

/**
 * The minimum lives in `@app/contracts`, not here: the registration form has to state
 * it and must not hold a second copy that could drift. The domain keeps the rule that
 * uses it — a minimum rather than a character-class rule, because length beats
 * composition for guessing resistance.
 */
export { PASSWORD_MIN_LENGTH };

/** Bounded so a hostile request cannot hand argon2 an unbounded input. */
export const PASSWORD_MAX_LENGTH = 200;

/** Returns the violation, or null when the password satisfies the policy. */
export function checkPasswordPolicy(password: string): PasswordPolicyViolation | null {
  if (password.length < PASSWORD_MIN_LENGTH) return PasswordPolicyViolations.TOO_SHORT;
  if (password.length > PASSWORD_MAX_LENGTH) return PasswordPolicyViolations.TOO_LONG;
  return null;
}
