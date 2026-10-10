'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { CurrencyCodes, ProductSchema, type CurrencyCode, type Product } from '@app/contracts';
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <p className="text-sm text-ink-muted">
          {activeOrganization === null
            ? 'Choose an organization above to see its catalog.'
            : `The catalog of ${activeOrganization.name}.`}
        </p>

        {organizationId !== null && (
          <Button size="sm" variant={adding ? 'secondary' : 'primary'} onClick={() => setAdding((open) => !open)}>
            {adding ? 'Cancel' : 'Add product'}
          </Button>
        )}
      </header>

      {adding && organizationId !== null && <AddProductForm onCreated={load} />}

      {organizationId === null ? (
        <p className="rounded-brand border border-rule bg-panel px-4 py-3 text-sm text-ink-muted">
          No organization is selected. Choose one above and its catalog appears here.
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
            Add the first product to {activeOrganization?.name ?? 'this organization'}&apos;s catalog.
          </p>
          {!adding && (
            <Button size="sm" className="mt-4" onClick={() => setAdding(true)}>
              Add product
            </Button>
          )}
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
      className="space-y-4 rounded-brand border border-rule bg-panel p-4"
      onSubmit={submit}
      noValidate
    >
      {error !== null && <Alert>{error}</Alert>}

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
