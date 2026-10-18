import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDEMPOTENCY_KEY_HEADER } from '@app/contracts';

const mocks = vi.hoisted(() => ({ placeCheckout: vi.fn() }));

/**
 * The session boundary is mocked away: this suite is about what the route does with a
 * request that already belongs to a signed-in buyer, and the 401 path belongs to
 * `asBuyer`, which has its own test.
 */
vi.mock('@/lib/http/buyer-route', () => ({
  asBuyer: (run: (api: unknown, requestId: string) => Promise<Response>) =>
    run({ placeCheckout: mocks.placeCheckout }, 'req_test'),
}));

const { POST } = await import('./route');

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

const request = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/checkouts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ lines: [{ productId: 'p1', quantity: 1, unitPriceMinor: 100 }] }),
  });

beforeEach(() => {
  mocks.placeCheckout.mockReset().mockResolvedValue(checkout);
});

describe('POST /api/checkouts (BFF)', () => {
  it('refuses a request with no Idempotency-Key, in the API’s own envelope (D94)', async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.requestId).toBe('req_test');
    // The refusal is this side's: nothing crossed the second hop without a key.
    expect(mocks.placeCheckout).not.toHaveBeenCalled();
  });

  it('refuses a malformed key the API would refuse', async () => {
    const response = await POST(request({ [IDEMPOTENCY_KEY_HEADER]: 'has space' }));

    expect(response.status).toBe(400);
    expect(mocks.placeCheckout).not.toHaveBeenCalled();
  });

  it('forwards the browser’s key with the body and answers 201', async () => {
    const response = await POST(request({ [IDEMPOTENCY_KEY_HEADER]: 'attempt-1' }));

    expect(response.status).toBe(201);
    expect(mocks.placeCheckout).toHaveBeenCalledWith(
      { lines: [{ productId: 'p1', quantity: 1, unitPriceMinor: 100 }] },
      'attempt-1',
    );
  });
});
