import { CartSchema } from '@app/contracts';
import { asBuyer } from '@/lib/http/buyer-route';

export function GET(): Promise<Response> {
  return asBuyer(async (api) => Response.json(CartSchema.parse(await api.cart())));
}
