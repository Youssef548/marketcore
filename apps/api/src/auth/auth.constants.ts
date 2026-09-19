/**
 * Implementation-level values the auth module owns.
 *
 * Not in `@app/contracts`: nothing outside this module branches on them, and the
 * conventions put implementation values beside the code that owns them rather
 * than in the wire-format package.
 */

/** Lifetime of an access token. Short because an access token cannot be revoked. */
export const ACCESS_TOKEN_TTL = '15m';

/** Lifetime of a refresh token, in milliseconds. */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 32 bytes of randomness. Entropy is what makes a fast hash sufficient here. */
export const REFRESH_TOKEN_BYTES = 32;

/**
 * One message per policy violation, keyed by the domain's violation enum. A
 * mapping rather than a chain of conditionals, so adding a violation is one line
 * and the compiler reports the omission until it is added.
 */
export const PasswordPolicyMessages = {
  TOO_SHORT: 'Password is shorter than the minimum length',
  TOO_LONG: 'Password is longer than the maximum length',
} as const;
