import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ login: vi.fn(), startSession: vi.fn() }));

/**
 * The two boundaries this route owns are mocked: the API call and the cookie jar.
 * What is under test is what the route does with a request before either is reached.
 */
vi.mock('@/lib/auth/resources', () => ({
  createResources: () => ({ login: mocks.login }),
}));

vi.mock('@/lib/session/server', () => ({
  startSession: mocks.startSession,
}));

const { POST } = await import('./route');

const URL_UNDER_TEST = 'http://localhost/api/auth/login';

function request(body: string, headers: Record<string, string>): Request {
  return new Request(URL_UNDER_TEST, { method: 'POST', headers, body });
}

beforeEach(() => {
  mocks.login.mockReset().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
  mocks.startSession.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/auth/login (BFF)', () => {
  it('signs in on a same-origin JSON request', async () => {
    const response = await POST(
      request(JSON.stringify({ email: 'buyer@example.test', password: 'hunter2hunter2' }), {
        'content-type': 'application/json',
        origin: 'http://localhost',
      }),
    );

    expect(response.status).toBe(204);
    expect(mocks.startSession).toHaveBeenCalledWith({ accessToken: 'at', refreshToken: 'rt' });
  });

  it('refuses a cross-site text/plain form before any sign-in happens', async () => {
    // The attack: a page the victim visits posts this form to the real login route.
    // The body is JSON-shaped, no preflight is required for text/plain, and the
    // response would otherwise set the attacker's cookies in the victim's browser —
    // signing them into an account the attacker controls.
    const response = await POST(
      request('{"email":"attacker@evil.test","password":"hunter2hunter2","x":"="}\r\n', {
        'content-type': 'text/plain',
        origin: 'https://evil.test',
        'sec-fetch-site': 'cross-site',
      }),
    );

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    // Nothing crossed the second hop, and no session was created.
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it('refuses a JSON body posted from another origin', async () => {
    const response = await POST(
      request(JSON.stringify({ email: 'buyer@example.test', password: 'hunter2hunter2' }), {
        'content-type': 'application/json',
        origin: 'https://evil.test',
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.startSession).not.toHaveBeenCalled();
  });
});
