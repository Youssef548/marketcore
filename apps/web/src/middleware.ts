import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIES } from '@/lib/session/cookies';
import { decideRoute } from '@/lib/session/routing';

/**
 * 308 rather than 307: the console's old URLs moved for good (D92), so a bookmark
 * and a crawler replace what they hold instead of asking again for ever.
 */
const PERMANENT_REDIRECT_STATUS = 308;

/**
 * Cheap route gating, and nothing more.
 *
 * The decision itself is in `@/lib/session/routing` so it can be tested without a
 * Next runtime. This file is the adapter: read the cookie, ask, translate.
 */
export function middleware(request: NextRequest): NextResponse {
  const signedIn = request.cookies.has(SESSION_COOKIES.REFRESH);
  const decision = decideRoute(request.nextUrl.pathname, signedIn);

  if (decision.kind === 'moved') {
    return NextResponse.redirect(new URL(decision.to, request.url), PERMANENT_REDIRECT_STATUS);
  }

  if (decision.kind === 'redirect') {
    return NextResponse.redirect(new URL(decision.to, request.url));
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Only the routes that need a decision. `/dashboard` and `/products` are here only
   * to be redirected to where the console lives now; `/admin` is its real address and
   * the protected prefix. Everything else — the API routes, static files — runs
   * without the hop. `/api/session` is deliberately absent even though it is
   * authenticated: it does its own checking, because it is also the thing that rotates
   * the tokens, and a redirect from middleware would replace its 401 with an HTML
   * response the fetch could not read.
   */
  matcher: ['/admin/:path*', '/dashboard', '/products', '/login', '/register'],
};
