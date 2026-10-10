'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { ProductSchema, type Product } from '@app/contracts';
import { Alert } from '@app/ui';
import { useReadySession } from '@/lib/session/client';

const ProductsSchema = z.array(ProductSchema);

type State =
  | { status: 'loading' }
  | { status: 'ready'; products: Product[] }
  | { status: 'failed'; message: string };

const money = (amountMinor: number, currency: string): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amountMinor / 100);

/**
 * The first page that reads tenant data.
 *
 * Everything before it proved the session; this proves the tenant. The organization
 * travels as `x-organization-id` from the route handler, never from here — the browser
 * names no tenant, and a page cannot ask for one it does not belong to because it never
 * has the chance to.
 *
 * It fetches through `/api/products` rather than the API, because the tokens are
 * `httpOnly` cookies the page cannot read, which is the whole design.
 */
export default function ProductsPage() {
  const { activeOrganization } = useReadySession();
  const organizationId = activeOrganization?.id ?? null;
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (organizationId === null) {
      setState({ status: 'ready', products: [] });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    void fetch('/api/products')
      .then(async (response) => {
        if (!response.ok) {
          // Re-read with the same envelope the API uses, so the page shows what the
          // server said rather than a status number.
          const body: unknown = await response.json().catch(() => null);
          const envelope = z
            .object({ error: z.object({ message: z.string() }) })
            .safeParse(body);
          throw new Error(envelope.success ? envelope.data.error.message : 'Could not load products');
        }
        return ProductsSchema.parse(await response.json());
      })
      .then((products) => {
        if (!cancelled) setState({ status: 'ready', products });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'failed',
            message: error instanceof Error ? error.message : 'Could not load products',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-ink-muted">
          {activeOrganization === null
            ? 'Choose an organization in the rail to see its catalog.'
            : `The catalog of ${activeOrganization.name}.`}
        </p>
      </header>

      {organizationId === null ? (
        <p className="rounded-brand border border-rule bg-panel px-4 py-3 text-sm text-ink-muted">
          No organization is selected. A tenant-scoped request names one in the
          <code className="mx-1 font-mono text-xs">x-organization-id</code>
          header, and this page will not guess.
        </p>
      ) : state.status === 'failed' ? (
        <Alert>{state.message}</Alert>
      ) : state.status === 'loading' ? (
        <div role="status" className="space-y-2 rounded-brand border border-rule bg-panel p-4" aria-busy>
          <span className="sr-only">Loading products…</span>
          <div className="h-3 w-1/3 rounded bg-sunken" />
          <div className="h-3 w-2/3 rounded bg-sunken" />
          <div className="h-3 w-1/2 rounded bg-sunken" />
        </div>
      ) : state.products.length === 0 ? (
        <div className="rounded-brand border border-rule bg-panel px-6 py-10 text-center">
          <p className="text-sm font-medium text-ink">No products yet</p>
          <p className="mt-1 text-xs text-ink-muted">
            Products created through the API and published to this organization appear
            here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-brand border border-rule">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Products{activeOrganization === null ? '' : ` in ${activeOrganization.name}`}
            </caption>
            <thead>
              <tr className="bg-sunken text-left">
                <th scope="col" className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Product
                </th>
                <th scope="col" className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Price
                </th>
              </tr>
            </thead>
            <tbody>
              {state.products.map((product) => (
                <tr key={product.id} className="border-t border-rule bg-panel">
                  <td className="px-4 py-3 font-medium text-ink">
                    {/* The direction's status thread: the leading edge carries the
                     * state, so a row is findable by scanning the margin. */}
                    <span
                      aria-hidden
                      className={`mr-3 inline-block h-4 w-[3px] rounded-sm align-middle ${
                        product.status === 'PUBLISHED' ? 'bg-positive' : 'bg-rule-strong'
                      }`}
                    />
                    {product.name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        product.status === 'PUBLISHED'
                          ? 'bg-positive-wash text-positive'
                          : 'bg-sunken text-ink-muted'
                      }`}
                    >
                      {product.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-ink">
                    {money(product.priceMinor, product.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
