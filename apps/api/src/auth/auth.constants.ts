/**
 * Implementation-level values the auth module owns.
 *
 * Almost none of them are in `@app/contracts`: nothing outside this module branches
 * on them, and the conventions put implementation values beside the code that owns
 * them rather than in the wire-format package.
 *
 * The refresh token's lifetime is the exception, and it is re-exported rather than
 * redefined below — the web app sets a cookie lifetime from it, so a second copy
 * here would be a second home for one policy. Its definition and the reasoning for
 * its location are in `@app/contracts`; re-exporting keeps this module the single
 * import site for everything the auth service reads, so no call site moved.
 */

/** Lifetime of an access token. Short because an access token cannot be revoked. */
export const ACCESS_TOKEN_TTL = '15m';

export { REFRESH_TOKEN_TTL_MS } from '@app/contracts';

/** 32 bytes of randomness. Entropy is what makes a fast hash sufficient here. */
export const REFRESH_TOKEN_BYTES = 32;

/**
 * The DI token for the `PasswordHasher` port.
 *
 * A string, not the interface, because a TypeScript interface does not exist at
 * runtime: `provide: PasswordHasher` hands the container `undefined` and boot
 * fails with "metatype is not a constructor" — an error that names neither the
 * token nor the class it came from. `@Inject(PASSWORD_HASHER)` at the consumer
 * is the other half of the pair; both ends must use this constant.
 */
export const PASSWORD_HASHER = 'PASSWORD_HASHER';

/**
 * Human-facing messages, one per failure.
 *
 * Clients branch on the envelope's `code`, never on these — they exist so a message
 * has one definition rather than being written inline wherever it happens to be
 * raised, which is how two endpoints end up describing the same failure two ways.
 */
export const AuthMessages = {
  EMAIL_TAKEN: 'Email is already registered',
  INVALID_CREDENTIALS: 'Invalid credentials',
  REFRESH_UNUSABLE: 'Refresh token is not usable',
  REFRESH_REUSED: 'Refresh token was already used',
  SESSION_GONE: 'Session no longer exists',
  USER_GONE: 'User no longer exists',
} as const;

/**
 * One message per policy violation, keyed by the domain's violation enum. A
 * mapping rather than a chain of conditionals, so adding a violation is one line
 * and the compiler reports the omission until it is added.
 */
export const PasswordPolicyMessages = {
  TOO_SHORT: 'Password is shorter than the minimum length',
  TOO_LONG: 'Password is longer than the maximum length',
} as const;
