import { RegisterRequestSchema } from '@app/contracts';
import { createResources } from '@/lib/auth/resources';
import { parseBody, readJson } from '@/lib/http/body';
import { failure, respondTo } from '@/lib/http/responses';
import { newRequestId } from '@/lib/http/request-id';

/**
 * Create a user. Deliberately no session.
 *
 * The API separates user creation from signing in — "registration is user creation;
 * a session is a separate concern" — and this route does not paper over that by
 * chaining a login. The form sends the user to the login page instead, which is
 * also the honest thing to show a reader of this code: those are two steps and the
 * API says so.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();

  const body = parseBody(RegisterRequestSchema, await readJson(request), requestId);
  if (!body.ok) return respondTo(body.failure);

  try {
    const user = await createResources().register(body.value);
    return Response.json(user, { status: 201 });
  } catch (error) {
    return failure(error, requestId);
  }
}
