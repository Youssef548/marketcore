import { ApiError } from '@app/api-client';
import { ErrorCodes } from '@app/contracts';
import { parseBody, readJson } from '@/lib/http/body';
import { failure, noContent, noSession, respondTo } from '@/lib/http/responses';
import { newRequestId } from '@/lib/http/request-id';
import { loadCurrentSession, rememberOrganization } from '@/lib/session/server';
import { SelectOrganizationRequestSchema } from '@/lib/session/session';

/**
 * Choose which organization the session acts in.
 *
 * The choice is checked against the organizations the caller is actually a member
 * of before it is stored. The API would refuse a request carrying someone else's
 * organization id anyway, so this is not the access control — it is what stops the
 * UI from claiming to act inside an organization the user is not in, and from
 * carrying that claim forward from request to request.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();

  const body = parseBody(SelectOrganizationRequestSchema, await readJson(request), requestId);
  if (!body.ok) return respondTo(body.failure);

  try {
    const session = await loadCurrentSession();
    if (session === null) return noSession(requestId);

    const { organizationId } = body.value;
    if (!session.organizations.some((organization) => organization.id === organizationId)) {
      return failure(
        new ApiError(403, ErrorCodes.FORBIDDEN, 'Not a member of that organization'),
        requestId,
      );
    }

    await rememberOrganization(organizationId);
    return noContent();
  } catch (error) {
    return failure(error, requestId);
  }
}
