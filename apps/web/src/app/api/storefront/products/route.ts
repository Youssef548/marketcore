import { PublicProductPageSchema } from '@app/contracts';
import { asBuyer } from '@/lib/http/buyer-route';

export function GET(request: Request): Promise<Response> {
  const cursor = new URL(request.url).searchParams.get('cursor') ?? undefined;
  return asBuyer(async (api) => Response.json(PublicProductPageSchema.parse(await api.storefrontProducts(cursor))));
}
