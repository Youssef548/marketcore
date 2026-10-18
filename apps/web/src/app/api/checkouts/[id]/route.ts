import { CheckoutSchema } from '@app/contracts';
import { asBuyer } from '@/lib/http/buyer-route';
import type { IdRouteParams, RouteContext } from '@/lib/http/interfaces/route.interface';

export async function GET(_request: Request, { params }: RouteContext<IdRouteParams>): Promise<Response> {
  const { id } = await params;
  return asBuyer(async (api) => Response.json(CheckoutSchema.parse(await api.checkout(id))));
}
