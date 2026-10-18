import { afterEach, describe, expect, it, vi } from 'vitest';
import { storefront, StorefrontError } from './client';

afterEach(() => vi.unstubAllGlobals());

const respond = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe('storefront client', () => {
  it('keeps the typed 409 details the cart and review step branch on (SRS §8)', async () => {
    const details = { lines: [{ productId: 'p1', reason: 'SOLD_OUT', available: 0, currentUnitPriceMinor: 100 }] };
    respond(409, { error: { code: 'CONFLICT', message: 'Some lines…', requestId: 'r', details } });

    const error = await storefront.placeCheckout({ lines: [{ productId: 'p1', quantity: 1, unitPriceMinor: 100 }] }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(StorefrontError);
    expect(error).toMatchObject({ status: 409, code: 'CONFLICT', details });
  });

  it('refuses a response that does not match the contract rather than rendering it', async () => {
    respond(200, { sellers: [], id: 'leak' });
    await expect(storefront.cart()).rejects.toThrow();
  });
});
