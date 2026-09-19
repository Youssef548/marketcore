import { cookies } from 'next/headers';
import type { TokenPair } from '@app/contracts';
import { createResources } from '../auth/resources';
import {
  SESSION_COOKIES,
  accessCookieAttributes,
  cookiesAreSecure,
  organizationCookieAttributes,
  refreshCookieAttributes,
} from './cookies';
import { createRefreshCoordinator } from './refresh';
import { loadSession, type SessionApi, type SessionStore, type SessionView } from './session';

type CookieJar = Awaited<ReturnType<typeof cookies>>;

/**
 * One coordinator for the process.
 *
 * Its whole value is shared state — the single-flight map and the record of the
 * last rotation — so a per-request instance would not be merely wasteful, it would
 * remove the protection entirely. Module scope is what lets two concurrent requests
 * in this process see each other's rotation.
 */
const rotations = createRefreshCoordinator((presented) => createResources().refresh(presented));

function sessionStore(jar: CookieJar): SessionStore {
  const secure = cookiesAreSecure();

  return {
    readAccessToken: () => jar.get(SESSION_COOKIES.ACCESS)?.value,
    readRefreshToken: () => jar.get(SESSION_COOKIES.REFRESH)?.value,
    readOrganizationId: () => jar.get(SESSION_COOKIES.ORGANIZATION)?.value,
    saveTokens: (pair) => {
      jar.set(SESSION_COOKIES.ACCESS, pair.accessToken, accessCookieAttributes(secure));
      jar.set(SESSION_COOKIES.REFRESH, pair.refreshToken, refreshCookieAttributes(secure));
    },
    clear: () => {
      for (const name of Object.values(SESSION_COOKIES)) jar.delete(name);
    },
  };
}

/**
 * The session for the current request, or null.
 *
 * Only callable where a cookie can be written — a Route Handler or a Server Action.
 * Next refuses a cookie write during a page render, and that constraint is the
 * reason the session is read through a route handler rather than in a Server
 * Component: a render that rotated the refresh token could not store the new one, so
 * the next request would present the superseded token and be refused as a replay —
 * the API revoking the session, caused entirely by where the refresh happened.
 */
export async function loadCurrentSession(): Promise<SessionView | null> {
  const jar = await cookies();

  const api: SessionApi = {
    me: (accessToken) => createResources(accessToken).me(),
    organizations: (accessToken) => createResources(accessToken).organizations(),
  };

  return loadSession({
    store: sessionStore(jar),
    api,
    refresh: (presented) => rotations.refresh(presented),
  });
}

/** Opens a session from a fresh token pair. */
export async function startSession(pair: TokenPair): Promise<void> {
  const jar = await cookies();
  const secure = cookiesAreSecure();

  jar.set(SESSION_COOKIES.ACCESS, pair.accessToken, accessCookieAttributes(secure));
  jar.set(SESSION_COOKIES.REFRESH, pair.refreshToken, refreshCookieAttributes(secure));
}

/**
 * The refresh token this request is holding, for the one caller that needs to hand
 * it back to the API — signing out, where the whole point is for the API to stop
 * honouring it.
 */
export async function currentRefreshToken(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIES.REFRESH)?.value;
}

/**
 * Forgets the session locally.
 *
 * Revoking it at the API is the caller's separate step, and deliberately not folded
 * in here: a local cookie that failed to clear is a bug, but a session the API still
 * honours is a security outcome, and the two deserve to fail apart.
 */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  for (const name of Object.values(SESSION_COOKIES)) jar.delete(name);
}

/**
 * Remembers which organization the session acts in.
 *
 * Storing only. The caller checks the id against the organizations the user really
 * belongs to first, because this function cannot tell a membership from an
 * arbitrary string.
 */
export async function rememberOrganization(organizationId: string): Promise<void> {
  const jar = await cookies();
  jar.set(
    SESSION_COOKIES.ORGANIZATION,
    organizationId,
    organizationCookieAttributes(cookiesAreSecure()),
  );
}
