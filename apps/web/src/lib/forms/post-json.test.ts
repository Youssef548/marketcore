import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postJson, SERVER_UNREACHABLE_MESSAGE } from './post-json';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Enough of a Response for the helper: a status and a JSON body. */
const response = (status: number, body: unknown = null) => ({ status, json: async () => body });

describe('postJson', () => {
  it('posts the body as JSON to the path', async () => {
    fetchMock.mockResolvedValue(response(204));

    await postJson('/api/auth/login', { email: 'a@b.test' }, 204);

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.test' }),
    });
  });

  it('succeeds only on the status the form expects', async () => {
    fetchMock.mockResolvedValue(response(201));

    expect(await postJson('/api/auth/register', {}, 201)).toEqual({ ok: true });
    expect(await postJson('/api/auth/login', {}, 204)).toEqual({
      ok: false,
      message: 'Unexpected response (201)',
    });
  });

  it("reads a refusal's message from the error envelope", async () => {
    fetchMock.mockResolvedValue(
      response(401, { error: { code: 'UNAUTHORIZED', message: 'Wrong email or password', requestId: 'r1' } }),
    );

    expect(await postJson('/api/auth/login', {}, 204)).toEqual({
      ok: false,
      message: 'Wrong email or password',
    });
  });

  it('tells a network failure apart from a refusal', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await postJson('/api/auth/login', {}, 204)).toEqual({
      ok: false,
      message: SERVER_UNREACHABLE_MESSAGE,
    });
  });
});
