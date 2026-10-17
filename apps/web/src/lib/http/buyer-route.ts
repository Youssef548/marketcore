import { createResources } from '@/lib/auth/resources';
import { currentAccessToken, loadCurrentSession } from '@/lib/session/server';
import { newRequestId } from './request-id';
import { failure, noSession } from './responses';

type Resources = ReturnType<typeof createResources>;

/**
 * Every buyer BFF route has this shape: prove the session, then act as the buyer.
 *
 * `loadCurrentSession` runs first because loading is what rotates a stale access
 * token and stores the replacement; reading the jar before it would hand the API a
 * token it has already stopped honouring. A refusal is the shared 401 envelope, and
 * anything thrown on the way out goes through `failure`, so this app never invents
 * a second error contract.
 */
export async function asBuyer(
  run: (api: Resources, requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = newRequestId();

  try {
    const session = await loadCurrentSession();
    if (session === null) return noSession(requestId);

    return await run(createResources(await currentAccessToken()), requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}
