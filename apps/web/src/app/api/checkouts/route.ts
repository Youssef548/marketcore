import { CheckoutSchema, CreateCheckoutRequestSchema } from '@app/contracts';
import { parseBody, readJson } from '@/lib/http/body';
import { asBuyer } from '@/lib/http/buyer-route';
import { respondTo } from '@/lib/http/responses';

export function POST(request: Request): Promise<Response> {
  return asBuyer(async (api, requestId) => {
    const body = parseBody(CreateCheckoutRequestSchema, await readJson(request), requestId);
    if (!body.ok) return respondTo(body.failure);
    // A 409 keeps its typed details through `failure` (envelope.ts copies them).
    return Response.json(CheckoutSchema.parse(await api.placeCheckout(body.value)), { status: 201 });
  });
}
