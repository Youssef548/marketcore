import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

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

/** A signed-in user who belongs to nothing: the first-run state. */
const NO_ORGANIZATIONS = { user: SESSION.user, organizations: [], activeOrganizationId: null };

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
    expect(screen.getByText('Nile Traders')).toBeTruthy();
    // One membership is nothing to switch, so there is no control pretending otherwise.
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText('Loading your session…')).toBeNull();
  });

  it('puts the tenant and the user in the top bar, and neither in the rail', async () => {
    fetchMock.mockResolvedValue(response(200, SESSION));

    renderShell();
    await screen.findByText('owner@marketcore.test');

    // One fact, one place. The tenant gates every tenant-scoped request, so it lives
    // on the strip that is always visible beside the page it scopes; the rail is
    // navigation and names neither the tenant nor the user.
    const rail = screen.getByRole('complementary');
    const topBar = screen.getByRole('banner');

    expect(topBar.textContent).toContain('Nile Traders');
    expect(topBar.textContent).toContain('owner@marketcore.test');
    expect(rail.textContent).not.toContain('Nile Traders');
    expect(rail.textContent).not.toContain('owner@marketcore.test');

    expect(screen.getByRole('heading', { name: 'Overview' })).toBeTruthy();
  });

  it('offers a switcher only once there is more than one organization to choose from', async () => {
    fetchMock.mockResolvedValue(
      response(200, {
        ...SESSION,
        organizations: [
          ...SESSION.organizations,
          { id: 'org-2', name: 'Cairo Loom', slug: 'cairo-loom', status: 'ACTIVE', role: 'MEMBER' },
        ],
      }),
    );

    renderShell();

    expect(await screen.findByRole('combobox')).toBeTruthy();
  });

  it('asks a user who belongs to nothing to create an organization, instead of showing a shell that does nothing', async () => {
    fetchMock.mockResolvedValue(response(200, NO_ORGANIZATIONS));

    renderShell();

    expect(await screen.findByRole('heading', { name: /not in an organization yet/i })).toBeTruthy();
    // And specifically *not* the shell: a rail with nothing to pick, and pages whose every
    // control answers "choose an organization first", is the dead end this replaces.
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create organization' })).toBeTruthy();
  });

  it('says who is signed in on the first-run screen, so "wrong account?" can be answered', async () => {
    // The first-run screen offers a way out for the wrong account, which is only useful
    // if it says which account this is. The bar names it, and names it to a screen reader.
    fetchMock.mockResolvedValue(response(200, NO_ORGANIZATIONS));

    renderShell();

    await screen.findByRole('heading', { name: /not in an organization yet/i });
    expect(screen.getByRole('banner').textContent).toContain('Signed in as owner@marketcore.test');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    // The product is named by the app's name, not a literal the deployment cannot change.
    expect(screen.getByRole('banner').textContent).toContain('marketcore');
  });

  it('creates the first organization and admits the session to the shell', async () => {
    // The first read belongs to nothing; every read after it has the organization that
    // creating produced. That difference is the whole mechanism.
    fetchMock.mockResolvedValue(response(200, SESSION));
    fetchMock.mockResolvedValueOnce(response(200, NO_ORGANIZATIONS));

    renderShell();
    await screen.findByRole('heading', { name: /not in an organization yet/i });

    fireEvent.change(screen.getByLabelText('Organization name'), {
      target: { value: 'Nile Traders' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/organizations',
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    // The reload is what admits them — not a navigation, because a moment ago there was no
    // page they were entitled to be on.
    expect(await screen.findByRole('complementary')).toBeTruthy();
    // The tenant lives in the top bar; the rail is navigation and names it nowhere. Read from
    // the landmark rather than by text, because the switcher's own `<option>` names it too.
    expect(screen.getByRole('banner').textContent).toContain('Nile Traders');
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
