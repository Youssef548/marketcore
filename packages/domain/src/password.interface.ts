export const PasswordPolicyViolations = {
  TOO_SHORT: 'TOO_SHORT',
  TOO_LONG: 'TOO_LONG',
} as const;
export type PasswordPolicyViolation =
  (typeof PasswordPolicyViolations)[keyof typeof PasswordPolicyViolations];
