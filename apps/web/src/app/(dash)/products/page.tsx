'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import {
  CurrencyCodes,
  ProductSchema,
  ProductStatuses,
  type CurrencyCode,
  type Product,
} from '@app/contracts';
import { Alert, Button, Field } from '@app/ui';
import { createProduct, useReadySession } from '@/lib/session/client';

const ProductsSchema = z.array(ProductSchema);

type State =
  | { status: 'loading' }
  | { status: 'ready'; products: Product[] }
  | { status: 'failed'; message: string };

/** The locale a currency is read in, so EGP renders `E£` rather than standing in as a code. */
const LOCALES: Record<CurrencyCode, string> = {
  EGP: 'en-EG',
  USD: 'en-US',
  EUR: 'en-IE',
};

const money = (amountMinor: number, currency: string): string =>
  new Intl.NumberFormat(LOCALES[currency as CurrencyCode] ?? 'en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(amountMinor / 100);

/** The prices in the seed and the API are major units with two decimals, held as minor. */
const toMinor = (price: string): number | null => {
  const amount = Number(price);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
};

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
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (organizationId === null) {
      setState({ status: 'ready', products: [] });
      return;
    }

    setState({ status: 'loading' });

    try {
      const response = await fetch('/api/products');
      if (!response.ok) {
        // Re-read with the same envelope the API uses, so the page shows what the
        // server said rather than a status number.
        const body: unknown = await response.json().catch(() => null);
        const envelope = z.object({ error: z.object({ message: z.string() }) }).safeParse(body);
        throw new Error(
          envelope.success ? envelope.data.error.message : 'Could not load products',
        );
      }

      setState({ status: 'ready', products: ProductsSchema.parse(await response.json()) });
    } catch (error: unknown) {
      setState({
        status: 'failed',
        message: error instanceof Error ? error.message : 'Could not load products',
      });
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const products = state.status === 'ready' ? state.products : [];
  const published = products.filter(({ status }) => status === ProductStatuses.PUBLISHED).length;

  // The Stitch products screen (048): a page head with the count and the primary action,
  // count cards, then one card holding the table. Only what the API returns is drawn —
  // name, status and price — so the design's stock, sales, trend and edit columns, its
  // search and its filter are absent rather than painted with numbers nobody measured.
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          {/* The top bar's `h1` names the page; this is the page's own head, as the
           * design draws it, one level below. */}
          <h2 className="text-2xl font-bold tracking-tight text-ink">Products</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {activeOrganization === null
              ? 'Choose an organization above to see its catalog.'
              : state.status === 'ready'
                ? `${products.length} ${products.length === 1 ? 'product' : 'products'} · ${activeOrganization.name}`
                : `The catalog of ${activeOrganization.name}.`}
          </p>
        </div>

        {organizationId !== null && (
          <Button
            variant={adding ? 'secondary' : 'primary'}
            onClick={() => setAdding((open) => !open)}
          >
            {!adding && <PlusIcon />}
            {adding ? 'Cancel' : 'Add product'}
          </Button>
        )}
      </header>

      {adding && organizationId !== null && <AddProductForm onCreated={load} />}

      {organizationId === null ? (
        <p className="rounded-xl border border-rule bg-panel px-5 py-4 text-sm text-ink-muted">
          No organization is selected. Choose one above and its catalog appears here.
        </p>
      ) : state.status === 'failed' ? (
        <Alert className="border-l-4">{state.message}</Alert>
      ) : state.status === 'loading' ? (
        <div role="status" className="space-y-3 rounded-xl border border-rule bg-panel p-5" aria-busy>
          <span className="sr-only">Loading products…</span>
          <div className="h-3 w-1/3 rounded bg-sunken" />
          <div className="h-3 w-2/3 rounded bg-sunken" />
          <div className="h-3 w-1/2 rounded bg-sunken" />
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-rule bg-panel px-6 py-12 text-center">
          <p className="text-base font-semibold text-ink">No products yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Add the first product to {activeOrganization?.name ?? 'this organization'}&apos;s catalog.
          </p>
          {!adding && (
            <Button className="mt-5" onClick={() => setAdding(true)}>
              <PlusIcon />
              Add product
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Counts of the rows below, and nothing the API does not return: the design's
           * stock and inventory-value cards need data this page does not fetch. */}
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Count label="Products" value={products.length} />
            <Count label="Published" value={published} />
            <Count label="Draft" value={products.length - published} />
          </dl>

          <section aria-labelledby="all-products" className="overflow-hidden rounded-xl border border-rule bg-panel">
            <header className="border-b border-rule px-5 py-4 sm:px-6">
              <h3 id="all-products" className="text-base font-bold tracking-tight text-ink">
                All products
              </h3>
            </header>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  Products{activeOrganization === null ? '' : ` in ${activeOrganization.name}`}
                </caption>
                <thead>
                  <tr className="bg-sunken text-left">
                    <th scope="col" className={HEADER_CELL}>
                      Product
                    </th>
                    <th scope="col" className={HEADER_CELL}>
                      Status
                    </th>
                    <th scope="col" className={`${HEADER_CELL} text-right`}>
                      Price
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const live = product.status === ProductStatuses.PUBLISHED;

                    return (
                      <tr key={product.id} className="border-t border-rule bg-panel hover:bg-canvas">
                        <td className="px-5 py-3.5 font-semibold text-ink sm:px-6">
                          {/* The leading dot carries the state, so a row is findable by
                           * scanning the margin; the pill beside it says it in words. */}
                          <span className="flex items-center gap-3">
                            <span
                              aria-hidden
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                live ? 'bg-positive ring-2 ring-positive-wash' : 'bg-ink-faint opacity-60'
                              }`}
                            />
                            {product.name}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 sm:px-6">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                              live
                                ? 'border-transparent bg-positive-wash text-positive'
                                : 'border-rule bg-sunken text-ink-muted'
                            }`}
                          >
                            <span
                              aria-hidden
                              className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-positive' : 'bg-ink-muted'}`}
                            />
                            {product.status.toLowerCase()}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-ink tabular-nums sm:px-6">
                          {money(product.priceMinor, product.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/** A table header cell: 12px, the type floor, rather than the 11px it used to be. */
const HEADER_CELL =
  'whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-wider text-ink-faint sm:px-6';

/** One count card. A `dt`/`dd` pair, so the number is read with what it counts. */
function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-rule bg-panel px-5 py-4">
      <dt className="text-sm font-medium text-ink-muted">{label}</dt>
      <dd className="mt-2 text-3xl font-bold tracking-tight text-ink tabular-nums">{value}</dd>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

/**
 * Add a product to the organization the session acts in.
 *
 * One form, the three fields the contract requires. It posts to the app's own route
 * handler, which supplies the tenant; the browser never names it. A refusal is shown
 * as the server worded it rather than restated here.
 */
function AddProductForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(CurrencyCodes.EGP);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const priceMinor = toMinor(price);
    if (name.trim() === '' || priceMinor === null) {
      setError('Enter a name and a price greater than zero');
      return;
    }

    setPending(true);
    try {
      await createProduct({ name: name.trim(), priceMinor, currency });
      setName('');
      setPrice('');
      await onCreated();
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'Could not create the product');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      aria-labelledby="new-product"
      className="space-y-4 rounded-xl border border-rule bg-panel p-5 sm:p-6"
      onSubmit={submit}
      noValidate
    >
      <h3 id="new-product" className="text-base font-bold tracking-tight text-ink">
        New product
      </h3>

      {error !== null && <Alert className="border-l-4">{error}</Alert>}

      <Field
        label="Name"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Price"
          name="price"
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
        />

        <label className="block space-y-2">
          <span className="block text-sm font-medium text-ink">Currency</span>
          <select
            className="h-10 w-full rounded-brand border border-control-edge bg-panel px-3 text-sm text-ink"
            value={currency}
            onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
          >
            {Object.values(CurrencyCodes).map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Button type="submit" busy={pending}>
        {pending ? 'Adding…' : 'Add product'}
      </Button>
    </form>
  );
}
