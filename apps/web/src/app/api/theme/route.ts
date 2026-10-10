import { cookies } from 'next/headers';
import { newRequestId } from '@/lib/http/request-id';
import { parseBody, readJson } from '@/lib/http/body';
import { failure, noContent, respondTo } from '@/lib/http/responses';
import { cookiesAreSecure } from '@/lib/session/cookies';
import { SetThemeRequestSchema, THEME_COOKIE, themeCookieAttributes } from '@/lib/theme/theme';

/**
 * Choose the theme.
 *
 * Not a session concern and not a credential, so it needs no session: a visitor can
 * pick a theme before signing in, and the sign-in page arrives in it. What it does
 * share with the session is the reason it is a cookie — the server reads it, so the
 * page is painted correctly on the first byte rather than corrected afterwards.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();

  const body = parseBody(SetThemeRequestSchema, await readJson(request), requestId);
  if (!body.ok) return respondTo(body.failure);

  try {
    const store = await cookies();
    store.set(THEME_COOKIE, body.value.theme, themeCookieAttributes(cookiesAreSecure()));
    return noContent();
  } catch (error) {
    return failure(error, requestId);
  }
}
