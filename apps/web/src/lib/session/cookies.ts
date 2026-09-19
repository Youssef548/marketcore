import { REFRESH_TOKEN_TTL_MS } from '@app/contracts';

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

export type SessionCookieName = (typeof SESSION_COOKIES)[keyof typeof SESSION_COOKIES];

/**
 * Everything a session cookie has in common.
 *
 * `httpOnly` is the point of the whole arrangement: neither token is readable by
 * JavaScript, so an XSS cannot exfiltrate a 30-day credential. `Lax` rather than
 * `Strict` because the app has to be reachable by a top-level navigation from
 * elsewhere — Strict would make a followed link arrive signed out — and it still
 * withholds the cookie from the cross-site subrequests that CSRF depends on.
 */
export interface SessionCookieAttributes {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  maxAge?: number;
}

/**
 * Whether cookies are marked `Secure`.
 *
 * An explicit variable rather than `NODE_ENV`, because the behavioural stack runs
 * the production build over real TLS while a developer runs the same build over
 * plain http on localhost. Keyed off `NODE_ENV` the `Secure` branch would be
 * unreachable in the one place able to assert it — and a `Secure` cookie on plain
 * http is silently dropped by the browser, which fails as "signed out at random"
 * rather than as an error.
 */
export function cookiesAreSecure(): boolean {
  return process.env.SESSION_COOKIE_SECURE === 'true';
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
