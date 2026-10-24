import { REFRESH_TOKEN_TTL_MS } from '@app/contracts';
import type { SessionCookieAttributes } from './interfaces/cookies.interface';

/**
 * The three cookies a session is made of.
 *
 * Named here rather than in `@app/contracts`: nothing outside this app reads them,
 * because the browser never talks to the API and the API never sees them. They are
 * this app's private protocol with its own browser.
 */
export const SESSION_COOKIES = {
  ACCESS: 'mc_at',
  REFRESH: 'mc_rt',
  ORGANIZATION: 'mc_org',
} as const;

/**
 * Whether cookies are marked `Secure`.
 *
 * Secure by default in production, and overridable in either direction. The
 * explicit variable wins when it is set — the behavioural stack sets it `true`, and a
 * developer can set it `false` to run a production build over plain http on localhost
 * without the browser silently dropping the cookie and failing as "signed out at
 * random". When the variable is absent, production opts in rather than out: a
 * deployment that forgets the flag still ships `Secure` cookies instead of sending
 * the tokens in the clear.
 */
export function cookiesAreSecure(): boolean {
  const configured = process.env.SESSION_COOKIE_SECURE;
  if (configured !== undefined) return configured === 'true';

  return process.env.NODE_ENV === 'production';
}

/**
 * `maxAge` is in seconds here and milliseconds in the shared constant, so the
 * conversion happens once rather than at each call site.
 */
const REFRESH_TOKEN_TTL_SECONDS = REFRESH_TOKEN_TTL_MS / 1000;

function attributes(secure: boolean, maxAge?: number): SessionCookieAttributes {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}

/**
 * The access token is a **session cookie**, with no expiry of its own.
 *
 * Its fifteen-minute life is the API's policy and the API's 401 is what enforces
 * it. Giving the cookie a matching `maxAge` would put that policy in a second
 * place, and the two could only drift — so the cookie deliberately outlives the
 * token inside it and a stale token is discovered the one way that cannot disagree
 * with the API.
 */
export function accessCookieAttributes(secure: boolean): SessionCookieAttributes {
  return attributes(secure);
}

/**
 * The refresh token does carry an expiry, because a session cookie would be
 * discarded when the browser closes — signing a user out while their 30-day session
 * is still valid. The lifetime is the API's, imported so the two cannot disagree.
 */
export function refreshCookieAttributes(secure: boolean): SessionCookieAttributes {
  return attributes(secure, REFRESH_TOKEN_TTL_SECONDS);
}

/** The chosen organization is not a credential, but it lives as long as the session does. */
export function organizationCookieAttributes(secure: boolean): SessionCookieAttributes {
  return attributes(secure, REFRESH_TOKEN_TTL_SECONDS);
}
