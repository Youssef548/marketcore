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
