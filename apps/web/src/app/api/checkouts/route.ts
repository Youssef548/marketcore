import {
  CheckoutSchema,
  CreateCheckoutRequestSchema,
  IDEMPOTENCY_KEY_HEADER,
  IdempotencyKeySchema,
} from '@app/contracts';
import { parseBody, parseHeader, readJson } from '@/lib/http/body';
import { asBuyer } from '@/lib/http/buyer-route';
import { respondTo } from '@/lib/http/responses';

/**
 * One placement attempt, forwarded with the key the browser minted.
 *
 * The key is checked here as well as at the API, for the same reason the body is: this is
 * a boundary, and the refusal a client sees should be the same envelope with the same code
 * whichever side produced it. The header's absence is *not* filled in here — a key minted
 * on this side would turn a client that forgot one into a client that silently gets no
 * retry safety, which is precisely the bug the header exists to prevent.
 */
export function POST(request: Request): Promise<Response> {
  return asBuyer(async (api, requestId) => {
    const key = parseHeader(IdempotencyKeySchema, request.headers.get(IDEMPOTENCY_KEY_HEADER), requestId);
    if (!key.ok) return respondTo(key.failure);

    const body = parseBody(CreateCheckoutRequestSchema, await readJson(request), requestId);
    if (!body.ok) return respondTo(body.failure);

    // A 409 keeps its typed details through `failure` (envelope.ts copies them).
    return Response.json(CheckoutSchema.parse(await api.placeCheckout(body.value, key.value)), { status: 201 });
  });
}
