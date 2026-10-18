import { CheckoutSchema } from '@app/contracts';
import { asBuyer } from '@/lib/http/buyer-route';
import type { IdRouteParams, RouteContext } from '@/lib/http/interfaces/route.interface';

/**
 * Paying a checkout (SRS-FR-PAY-001…-004).
 *
 * A forwarder like every other BFF route, and deliberately thin: the API decides whether a
 * charge declines, cannot be confirmed or lands on a cancelled checkout, and the browser
 * branches on the same `details.reason` codes it already reads for a cart conflict. Nothing
 * is translated here, so there is no second place for those codes to drift.
 */
export async function POST(_request: Request, { params }: RouteContext<IdRouteParams>): Promise<Response> {
  const { id } = await params;
  return asBuyer(async (api) => Response.json(CheckoutSchema.parse(await api.payCheckout(id))));
}
