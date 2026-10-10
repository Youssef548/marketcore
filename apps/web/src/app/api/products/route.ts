import { z } from 'zod';
import { ApiError } from '@app/api-client';
import { CreateProductRequestSchema, ErrorCodes, ProductSchema } from '@app/contracts';
import { createResources } from '@/lib/auth/resources';
import { parseBody, readJson } from '@/lib/http/body';
import { failure, noSession, respondTo } from '@/lib/http/responses';
import { newRequestId } from '@/lib/http/request-id';
import { currentAccessToken, loadCurrentSession } from '@/lib/session/server';

/**
 * The caller's products.
 *
 * The first route in this app that reads tenant data, and therefore the first that has
 * to carry `x-organization-id` — the header the API's guard resolves into a
 * `TenantContext`. The browser never sees either token and never names the
 * organization to the API; it asks this handler, which knows the session and adds the
 * header. A cross-tenant read is then impossible from the page by construction rather
 * than by care.
 *
 * The session is loaded *before* the token is read, because loading is what retries a
 * stale token and stores the replacement.
 */
export async function GET(): Promise<Response> {
  const requestId = newRequestId();

  try {
    const session = await loadCurrentSession();
    if (session === null) return noSession(requestId);

    const { activeOrganizationId } = session;
    if (activeOrganizationId === null) {
      // A real state rather than an error: the caller belongs to several
      // organizations and has not said which. Naming none to the API would be refused
      // with 400, and guessing would be invisible — so it is stated here, in words the
      // page can show.
      return failure(
        new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'No organization selected'),
        requestId,
      );
    }

    const accessToken = await currentAccessToken();
    const products = await createResources(accessToken).products(activeOrganizationId);

    // Re-parsed with the contract on the way out as well as on the way in, so this
    // handler's response is the same shape the page will validate.
    return Response.json(z.array(ProductSchema).parse(products));
  } catch (error) {
    return failure(error, requestId);
  }
}

/**
 * Create a product in the organization the session acts in.
 *
 * The write side of the same rule: the tenant is taken from the session and added as
 * `x-organization-id` here, never named by the browser, so a page cannot create into
 * an organization it does not belong to. The body is parsed with the contract the API
 * validates it with, so a malformed price is refused at this boundary with the same
 * envelope the API would have produced.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();

  const body = parseBody(CreateProductRequestSchema, await readJson(request), requestId);
  if (!body.ok) return respondTo(body.failure);

  try {
    const session = await loadCurrentSession();
    if (session === null) return noSession(requestId);

    const { activeOrganizationId } = session;
    if (activeOrganizationId === null) {
      return failure(
        new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'No organization selected'),
        requestId,
      );
    }

    const accessToken = await currentAccessToken();
    const product = await createResources(accessToken).createProduct(
      activeOrganizationId,
      body.value,
    );

    return Response.json(ProductSchema.parse(product), { status: 201 });
  } catch (error) {
    return failure(error, requestId);
  }
}
