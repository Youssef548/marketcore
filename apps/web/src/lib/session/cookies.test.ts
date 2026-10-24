import { afterEach, describe, expect, it, vi } from 'vitest';
import { REFRESH_TOKEN_TTL_MS } from '@app/contracts';
import {
  SESSION_COOKIES,
  accessCookieAttributes,
  cookiesAreSecure,
  organizationCookieAttributes,
  refreshCookieAttributes,
} from './cookies';

describe('session cookie attributes', () => {
  it('keeps every token out of reach of JavaScript', () => {
    // The reason the tokens are not in the body of a response. An XSS that can read
    // a 30-day refresh token has a 30-day credential.
    expect(accessCookieAttributes(false).httpOnly).toBe(true);
    expect(refreshCookieAttributes(false).httpOnly).toBe(true);
    expect(organizationCookieAttributes(false).httpOnly).toBe(true);
  });

  it('is SameSite=Lax, so a followed link does not arrive signed out', () => {
    // Strict would be the stronger CSRF posture and would break the ordinary case of
    // arriving from another site. Lax still withholds the cookie from the cross-site
    // subrequests a CSRF depends on.
    expect(accessCookieAttributes(false).sameSite).toBe('lax');
    expect(refreshCookieAttributes(false).sameSite).toBe('lax');
  });

  it('gives the access cookie no expiry of its own', () => {
    // The token's fifteen minutes are the API's policy and its 401 is what enforces
    // them. A mirrored maxAge would be a second home for that policy, and the cookie
    // would start deciding something it cannot know.
    expect(accessCookieAttributes(false)).not.toHaveProperty('maxAge');
    expect(accessCookieAttributes(true)).not.toHaveProperty('maxAge');
  });

  it("gives the refresh cookie the API's own lifetime, converted to seconds", () => {
    // Next takes maxAge in seconds and the shared constant is in milliseconds —
    // passing milliseconds through would set a cookie expiring in the year 800,000.
    expect(refreshCookieAttributes(false).maxAge).toBe(2_592_000);
    expect(refreshCookieAttributes(false).maxAge).toBe(REFRESH_TOKEN_TTL_MS / 1000);
  });

  it('ties the active organization to the same lifetime as the session', () => {
    expect(organizationCookieAttributes(false).maxAge).toBe(REFRESH_TOKEN_TTL_MS / 1000);
  });

  it('names the cookies once', () => {
    expect(Object.values(SESSION_COOKIES)).toEqual(['mc_at', 'mc_rt', 'mc_org']);
  });
});

describe('cookiesAreSecure', () => {
  afterEach(() => {
    delete process.env.SESSION_COOKIE_SECURE;
    vi.unstubAllEnvs();
  });

  it('is off when the environment says nothing, so local http works', () => {
    expect(cookiesAreSecure()).toBe(false);
  });

  it('is on by default in production', () => {
    // A deployment that forgets SESSION_COOKIE_SECURE must still get Secure cookies,
    // not tokens in the clear. The default is the thing a missing flag used to break.
    vi.stubEnv('NODE_ENV', 'production');
    expect(cookiesAreSecure()).toBe(true);
  });

  it('follows the explicit variable rather than the build environment', () => {
    // Read from its own variable on purpose. The behavioural stack runs the
    // production build over real TLS and a developer runs the same build over plain
    // http, so a set variable must decide — the default only fills a gap.
    process.env.SESSION_COOKIE_SECURE = 'true';
    expect(cookiesAreSecure()).toBe(true);
    expect(refreshCookieAttributes(cookiesAreSecure()).secure).toBe(true);

    process.env.SESSION_COOKIE_SECURE = 'false';
    expect(cookiesAreSecure()).toBe(false);

    // Explicit off still wins over a production build, for a local `next start`.
    vi.stubEnv('NODE_ENV', 'production');
    expect(cookiesAreSecure()).toBe(false);
  });
});
