import { afterEach, describe, expect, it, vi } from 'vitest';
import { storefront, StorefrontError } from './client';

afterEach(() => vi.unstubAllGlobals());

const respond = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));

const lines = [{ productId: 'p1', quantity: 1, unitPriceMinor: 100 }];

/** A checkout the contract accepts, so the key test can assert past the parse. */
const checkout = {
  id: 'c1',
  status: 'PENDING_PAYMENT',
  totalMinor: 100,
  currency: 'EGP',
  placedAt: '2026-10-18T10:00:00.000Z',
  orders: [
    {
      id: 'o1',
      status: 'PENDING_PAYMENT',
      totalMinor: 100,
      currency: 'EGP',
      seller: { name: 'Nile', slug: 'nile' },
      items: [{ productId: 'p1', name: 'Shirt', quantity: 1, unitPriceMinor: 100 }],
    },
  ],
};

describe('storefront client', () => {
  it('keeps the typed 409 details the cart and review step branch on (SRS §8)', async () => {
    const details = { lines: [{ productId: 'p1', reason: 'SOLD_OUT', available: 0, currentUnitPriceMinor: 100 }] };
    respond(409, { error: { code: 'CONFLICT', message: 'Some lines…', requestId: 'r', details } });

    const error = await storefront.placeCheckout({ lines }, 'key-1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(StorefrontError);
    expect(error).toMatchObject({ status: 409, code: 'CONFLICT', details });
  });

  it('refuses a response that does not match the contract rather than rendering it', async () => {
    respond(200, { sellers: [], id: 'leak' });
    await expect(storefront.cart()).rejects.toThrow();
  });

  it('sends the attempt key as Idempotency-Key, beside the unchanged body (SRS-FR-CHK-008)', async () => {
    respond(201, checkout);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    const placed = await storefront.placeCheckout({ lines }, 'attempt-1');

    expect(placed.id).toBe('c1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/checkouts');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'content-type': 'application/json', 'Idempotency-Key': 'attempt-1' });
    expect(JSON.parse(String(init.body))).toEqual({ lines });
  });
});
