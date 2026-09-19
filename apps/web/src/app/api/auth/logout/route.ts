import { createResources } from '@/lib/auth/resources';
import { noContent } from '@/lib/http/responses';
import { currentRefreshToken, endSession } from '@/lib/session/server';

/**
 * Sign out, at the API and locally.
 *
 * The API is told first, because revoking the session is the part that makes a
 * stolen refresh token stop working; clearing the cookie is only how this browser
 * forgets it.
 *
 * **The local cookies are cleared whether or not the API can be reached**, and this
 * always answers 204. That is a deliberate trade: a sign-out button that reports an
 * error and leaves the user signed in is worse than one that signs them out and
 * leaves a token live at the API. The token is still bounded — by the session
 * expiry, and by the rotation that a later use would trigger. The alternative, a
 * trustworthy error, would mean refusing to clear the cookie, which is the failure
 * a user would actually notice. The API already answers 204 for a token it does not
 * recognise, so the common replay of a sign-out is not an error either.
 */
export async function POST(): Promise<Response> {
  const refreshToken = await currentRefreshToken();

  if (refreshToken !== undefined) {
    try {
      await createResources().logout(refreshToken);
    } catch {
      // Swallowed on purpose; see the note above. Nothing here can act on it, and
      // surfacing it would contradict the decision to sign the user out anyway.
    }
  }

  await endSession();
  return noContent();
}
