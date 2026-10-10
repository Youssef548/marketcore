import { CreateOrganizationRequestSchema } from '@app/contracts';
import { createResources } from '@/lib/auth/resources';
import { parseBody, readJson } from '@/lib/http/body';
import { failure, noSession, respondTo } from '@/lib/http/responses';
import { newRequestId } from '@/lib/http/request-id';
import { currentAccessToken, loadCurrentSession } from '@/lib/session/server';

/**
 * Create an organization, with the caller as its owner.
 *
 * The first thing in this app that can be asked for by someone with **no tenant**: every other
 * route it proxies is tenant-scoped, and this one exists precisely because there is no
 * organization to scope it to yet. So it loads the session for the token and nothing else —
 * `activeOrganizationId` is deliberately not required, and requiring it would make the first
 * organization uncreatable.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();

  const body = parseBody(CreateOrganizationRequestSchema, await readJson(request), requestId);
  if (!body.ok) return respondTo(body.failure);

  try {
    const session = await loadCurrentSession();
    if (session === null) return noSession(requestId);

    const accessToken = await currentAccessToken();
    const organization = await createResources(accessToken).createOrganization(body.value);

    // 201, not 200: something was created, and the page that called this wants the
    // organization back so it can show what it just made.
    return Response.json(organization, { status: 201 });
  } catch (error) {
    // A duplicate slug arrives as the API's 409 with the API's code, unwrapped — the caller
    // branches on `code`, and translating it here would be a second classification to keep
    // in agreement.
    return failure(error, requestId);
  }
}
