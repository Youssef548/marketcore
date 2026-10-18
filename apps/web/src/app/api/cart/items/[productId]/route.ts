import { CartSchema, SetCartLineRequestSchema } from '@app/contracts';
import { parseBody, readJson } from '@/lib/http/body';
import { asBuyer } from '@/lib/http/buyer-route';
import type { ProductIdRouteParams, RouteContext } from '@/lib/http/interfaces/route.interface';
import { respondTo } from '@/lib/http/responses';

type Context = RouteContext<ProductIdRouteParams>;

export async function PUT(request: Request, { params }: Context): Promise<Response> {
  const { productId } = await params;
  return asBuyer(async (api, requestId) => {
    // Refused here with the API's own envelope, so an 11th unit never leaves the BFF.
    const body = parseBody(SetCartLineRequestSchema, await readJson(request), requestId);
    if (!body.ok) return respondTo(body.failure);
    return Response.json(CartSchema.parse(await api.setCartLine(productId, body.value)));
  });
}

export async function DELETE(_request: Request, { params }: Context): Promise<Response> {
  const { productId } = await params;
  return asBuyer(async (api) => Response.json(CartSchema.parse(await api.removeCartLine(productId))));
}
