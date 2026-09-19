/**
 * Where a visitor goes, as a decision with no Next in it.
 *
 * Kept apart from `middleware.ts` so it can be tested directly. The middleware
 * adapter only turns a decision into a `NextResponse`, and that part is small
 * enough to be obviously right.
 */

export const DASHBOARD_PATH = '/dashboard';
export const LOGIN_PATH = '/login';
export const REGISTER_PATH = '/register';

export type RoutingDecision = { kind: 'next' } | { kind: 'redirect'; to: string };

export function isProtected(pathname: string): boolean {
  return pathname === DASHBOARD_PATH || pathname.startsWith(`${DASHBOARD_PATH}/`);
}

export function isCredentialPage(pathname: string): boolean {
  return pathname === LOGIN_PATH || pathname === REGISTER_PATH;
}

/**
 * The gate.
 *
 * Presence of the refresh cookie is the whole check, and it is deliberately the
 * cheapest one available: middleware runs before every matched request, and asking
 * the API whether the session is *still* valid here would put a network call in
 * front of the entire protected area. A cookie that is present but no longer valid
 * is caught by `/api/session`, which can also rotate it — so this decides routing,
 * not authorization.
 *
 * `next` is carried through so that a followed link into the dashboard resumes
 * there after signing in rather than dumping the visitor on the default page.
 */
export function decideRoute(pathname: string, signedIn: boolean): RoutingDecision {
  if (!signedIn && isProtected(pathname)) {
    return { kind: 'redirect', to: `${LOGIN_PATH}?next=${encodeURIComponent(pathname)}` };
  }

  // A signed-in visitor has no use for the credential pages; the API would refuse
  // the login they submitted anyway.
  if (signedIn && isCredentialPage(pathname)) {
    return { kind: 'redirect', to: DASHBOARD_PATH };
  }

  return { kind: 'next' };
}
