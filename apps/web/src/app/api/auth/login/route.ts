import { LoginRequestSchema } from '@app/contracts';
import { createResources } from '@/lib/auth/resources';
import { parseBody, readJson } from '@/lib/http/body';
import { failure, noContent, respondTo } from '@/lib/http/responses';
import { newRequestId } from '@/lib/http/request-id';
import { startSession } from '@/lib/session/server';

/**
 * Sign in, and hold the result in cookies the browser cannot read.
 *
 * The tokens stop here on purpose. Returning them would put a 30-day credential
 * back within reach of JavaScript, which is the entire reason this route exists
 * instead of the form calling the API directly.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();

  const body = parseBody(LoginRequestSchema, await readJson(request), requestId);
  if (!body.ok) return respondTo(body.failure);

  try {
    const tokens = await createResources().login(body.value);
    await startSession(tokens);

    // 204: there is nothing to send. An empty body also means a later edit cannot
    // leak a token here by accidentally returning the pair.
    return noContent();
  } catch (error) {
    return failure(error, requestId);
  }
}
