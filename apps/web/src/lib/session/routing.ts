import type { RoutingDecision } from './interfaces/routing.interface';

/**
 * Where a visitor goes, as a decision with no Next in it.
 *
 * Kept apart from `middleware.ts` so it can be tested directly. The middleware
 * adapter only turns a decision into a `NextResponse`, and that part is small
 * enough to be obviously right.
 *
 * Every URL the console serves is named here once, so a page, the rail and the gate
 * cannot disagree about where it lives.
 */

/** The operator console (D92). `/admin` is the overview; everything else hangs below it. */
export const ADMIN_PATH = '/admin';
export const ADMIN_PRODUCTS_PATH = `${ADMIN_PATH}/products`;
export const LOGIN_PATH = '/login';
export const REGISTER_PATH = '/register';

/**
 * Where a signed-in visitor lands when nothing more specific was asked for (D101).
 *
 * The storefront, not the console: a buyer who signed in to look at products has no
 * organization and no use for a console whose every control says "choose an organization
 * first". The console is still one address away, and `/admin` is still where an
 * organization is created — this only decides the default destination.
 */
export const STOREFRONT_PATH = '/browse';

/**
 * The console's old URLs, and where they live now.
 *
 * `/dashboard` and `/products` were the console's address for two phases, so a
 * bookmark, a search result and a link someone was sent still hold them. They move
 * the visitor rather than answering 404 for a URL that was correct until yesterday.
 * Only the two routes that existed are listed: a deeper path was never a page, and
 * inventing a destination for it would be guessing.
 */
const MOVED_PATHS: Readonly<Record<string, string>> = {
  '/dashboard': ADMIN_PATH,
  '/products': ADMIN_PRODUCTS_PATH,
};

/** Where a moved URL now lives, or null when the path never moved. */
export function movedTo(pathname: string): string | null {
  return MOVED_PATHS[pathname] ?? null;
}

/** Storefront routes (PRD §7.4). Signed-in only (SRS §5), but no organization needed. */
export const STOREFRONT_PREFIXES = ['/browse', '/p', '/cart', '/checkout', '/orders', '/account'] as const;

const PROTECTED_PREFIXES = [ADMIN_PATH, ...STOREFRONT_PREFIXES];

export function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
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
 * `next` is carried through so that a followed link into the console resumes there
 * after signing in rather than dumping the visitor on the default page.
 */
export function decideRoute(pathname: string, signedIn: boolean): RoutingDecision {
  // Before the gate, because a move is about the address and not about the session:
  // `/dashboard` while signed out must still become `/admin`, and ask for credentials
  // *then*, so the `next` the visitor comes back to is an address that lives.
  const moved = movedTo(pathname);
  if (moved !== null) {
    return { kind: 'moved', to: moved };
  }

  if (!signedIn && isProtected(pathname)) {
    return { kind: 'redirect', to: `${LOGIN_PATH}?next=${encodeURIComponent(pathname)}` };
  }

  // A signed-in visitor has no use for the credential pages; the API would refuse
  // the login they submitted anyway.
  if (signedIn && isCredentialPage(pathname)) {
    return { kind: 'redirect', to: STOREFRONT_PATH };
  }

  return { kind: 'next' };
}
