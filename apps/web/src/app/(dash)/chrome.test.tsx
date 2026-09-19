import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), pathname: vi.fn() }));

vi.mock('next/navigation', async (importOriginal) => ({
  // Spread the real module: `next/link` imports from here too, so replacing the
  // whole module with one export breaks rendering for a reason unrelated to the test.
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => mocks.pathname(),
}));

import { SessionProvider } from '@/lib/session/client';
import { DashboardChrome } from './chrome';

const SESSION = {
  user: { id: 'u1', email: 'owner@marketcore.test' },
  organizations: [
    {
      id: 'org-1',
      name: 'Nile Traders',
      slug: 'nile-traders',
      status: 'ACTIVE',
      role: 'OWNER',
    },
  ],
  activeOrganizationId: 'org-1',
};

const fetchMock = vi.fn();

beforeEach(() => {
  mocks.replace.mockClear();
  mocks.pathname.mockReset();
  mocks.pathname.mockReturnValue('/dashboard');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderShell() {
  return render(
    <SessionProvider>
      <DashboardChrome appName="marketcore">
        <p>the page</p>
      </DashboardChrome>
    </SessionProvider>,
  );
}

const response = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

describe('the signed-in shell', () => {
  it('names the user and their organization once the session has loaded', async () => {
    fetchMock.mockResolvedValue(response(200, SESSION));

    renderShell();

    expect(await screen.findByText('owner@marketcore.test')).toBeTruthy();
    expect(screen.getByText('the page')).toBeTruthy();
    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.queryByText('Loading your session…')).toBeNull();
  });

  it('puts the tenant in the rail and the user in the top bar, and neither in both', async () => {
    fetchMock.mockResolvedValue(response(200, SESSION));

    renderShell();
    await screen.findByText('owner@marketcore.test');

    // The exploration mockups showed both facts twice — the organization in the
    // rail and again in the top bar, the user in both — and the duplication was a
    // mistake. One fact, one place. Asserted on the two landmarks rather than on a
    // raw occurrence count, because the organization's own `<option>` is part of
    // the rail's control and is meant to name it.
    const rail = screen.getByRole('complementary');
    const topBar = screen.getByRole('banner');

    expect(rail.textContent).toContain('Nile Traders');
    expect(topBar.textContent).not.toContain('Nile Traders');

    expect(topBar.textContent).toContain('owner@marketcore.test');
    expect(rail.textContent).not.toContain('owner@marketcore.test');

    expect(screen.getByRole('heading', { name: 'Your session' })).toBeTruthy();
  });

  it('sends an anonymous visitor to sign in', async () => {
    fetchMock.mockResolvedValue(
      response(401, { error: { code: 'UNAUTHORIZED', message: 'No session', requestId: 'req_1' } }),
    );

    renderShell();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'));
  });

  it('does not sign anyone out over a server it cannot reach', async () => {
    // A refusal and a failure are different, and conflating them turns a blip into a
    // logout — the user would have to sign in again because a request timed out.
    fetchMock.mockRejectedValue(new Error('network down'));

    renderShell();

    expect(await screen.findByText('Could not reach the server')).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('refuses a session it cannot read rather than rendering a half-empty page', async () => {
    fetchMock.mockResolvedValue(response(200, { user: { id: 'u1' } }));

    renderShell();

    expect(
      await screen.findByText('The server sent a session this version cannot read'),
    ).toBeTruthy();
  });
});
