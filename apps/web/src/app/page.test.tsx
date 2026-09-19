import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ redirect: vi.fn(), has: vi.fn() }));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/headers', () => ({ cookies: async () => ({ has: mocks.has }) }));

import HomePage from './page';

/**
 * The front door is a redirect and nothing else, which is worth pinning: it is the
 * one route a reviewer opens by hand, and it is the only place the refresh cookie is
 * consulted before `/api/session` has had a chance to validate or rotate it.
 */
describe('the front door', () => {
  beforeEach(() => {
    mocks.redirect.mockClear();
    mocks.has.mockClear();
  });

  it('sends a visitor holding a refresh cookie to the dashboard', async () => {
    mocks.has.mockReturnValue(true);

    await HomePage();

    expect(mocks.redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('sends everyone else to sign in', async () => {
    mocks.has.mockReturnValue(false);

    await HomePage();

    expect(mocks.redirect).toHaveBeenCalledWith('/login');
  });
});
