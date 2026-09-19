import { failure, noSession } from '@/lib/http/responses';
import { newRequestId } from '@/lib/http/request-id';
import { loadCurrentSession } from '@/lib/session/server';

/**
 * The session, for the browser.
 *
 * A route handler rather than a Server Component on purpose, and the reason is a
 * Next constraint rather than a preference: a render cannot write a cookie, so a
 * Server Component that rotated the refresh token could not store the replacement —
 * and the next request would present the superseded token and be refused as a
 * replay, which the API answers by revoking the session. Reading the session
 * anywhere cookies can be written is what makes rotation possible at all.
 */
export async function GET(): Promise<Response> {
  const requestId = newRequestId();

  try {
    const session = await loadCurrentSession();
    if (session === null) return noSession(requestId);

    return Response.json(session);
  } catch (error) {
    return failure(error, requestId);
  }
}
