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
 * A Symbol, not the interface, because a TypeScript interface does not exist at
 * runtime: `provide: PasswordHasher` hands the container `undefined` and boot
 * fails with "metatype is not a constructor" — an error that names neither the
 * token nor the class it came from. A Symbol rather than a string so the token is
 * unique by identity and cannot be matched by an unrelated provider that happens
 * to spell the same name. `@Inject(PASSWORD_HASHER)` at the consumer is the other
 * half of the pair; both ends must use this constant.
 */
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

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

/**
 * The security events this module emits, one per outcome an operator would search
 * for. A log event name is a contract rather than a literal — it is grepped across
 * a fleet, so it has exactly one definition here instead of at each call site.
 *
 * These are implementation values, not wire values: no client branches on them, so
 * they belong beside the code that owns them rather than in `@app/contracts`.
 */
export const AuthLogEvents = {
  /** A login was refused. Emitted for an unknown email and a wrong password alike. */
  LOGIN_FAILED: 'auth.login.failed',
  /** A refresh token was replayed and the whole session was revoked as a result. */
  REFRESH_REUSE_DETECTED: 'auth.refresh.reuse_detected',
} as const;

/**
 * The DI token for the auth module's logger.
 *
 * A Symbol for the same reason as `PASSWORD_HASHER`: the `LoggerService` interface
 * is erased at runtime, so `@Inject` needs a value to match on, and a Symbol keeps
 * the token unique. Resolved by a factory in `AuthModule`, and overridden in tests
 * so the emitted security events can be asserted instead of read off a stream.
 */
export const AUTH_LOGGER = Symbol('AUTH_LOGGER');

/**
 * The issuer and audience every access token carries and is verified against.
 *
 * They scope a token to this API: two services that happen to share a signing
 * secret would otherwise accept each other's tokens. Fixed values rather than
 * environment configuration because there is exactly one issuer and one audience,
 * and neither changes per deployment.
 */
export const JWT_ISSUER = 'marketcore';
export const JWT_AUDIENCE = 'marketcore-api';

/**
 * The window the auth rate limit is counted over, per client.
 *
 * One minute is the granularity a human notices: long enough that a normal sign-in
 * is never touched, short enough that a script cannot get far.
 */
export const AUTH_THROTTLE_TTL_MS = 60_000;

/**
 * Requests a single client may make to one auth endpoint within the window.
 *
 * Deliberately above the ~10 an e2e suite makes, so the limit bounds a brute-force
 * run without interfering with ordinary use — a lockout after repeated failures is a
 * different mechanism (and still deferred). The bound is on requests, not attempts
 * that succeed, which is the point: a wrong password costs the same as a right one.
 */
export const AUTH_THROTTLE_LIMIT = 20;
