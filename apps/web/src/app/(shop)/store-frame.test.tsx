import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), pathname: vi.fn(() => '/browse') }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => mocks.pathname(),
}));

import { SessionProvider } from '@/lib/session/client';
import { StoreFrame } from './store-frame';

const BUYER = { user: { id: 'u1', email: 'buyer@marketcore.test' }, organizations: [], activeOrganizationId: null };
const SELLER = {
  user: { id: 'u2', email: 'seller@marketcore.test' },
  organizations: [
    { id: 'org-1', name: 'Nile Traders', slug: 'nile-traders', status: 'ACTIVE', role: 'OWNER' },
  ],
  activeOrganizationId: 'org-1',
};

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.replace.mockReset();
});

const renderFrame = (sessionStatus: number, body: unknown) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: sessionStatus })));
  render(
    <SessionProvider>
      <StoreFrame appName="marketcore">
        <p>page body</p>
      </StoreFrame>
    </SessionProvider>,
  );
};

describe('StoreFrame', () => {
  it('serves a buyer with no organization — no onboarding gate (D53)', async () => {
    renderFrame(200, BUYER);

    expect(await screen.findByText('page body')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cart' }).getAttribute('href')).toBe('/cart');
    expect(screen.getByRole('link', { name: 'My orders' }).getAttribute('href')).toBe('/account/orders');
    expect(screen.queryByText(/create an organization/i)).toBeNull();
    // And the way to the screen that does create one, which is what the front door used
    // to be (D101). Without it this buyer is stranded on a storefront with no shop.
    expect(screen.getByRole('link', { name: 'Start selling' }).getAttribute('href')).toBe('/admin');
  });

  it('names the same link for what a seller will find there (D101)', async () => {
    renderFrame(200, SELLER);

    expect(await screen.findByText('page body')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Seller console' }).getAttribute('href')).toBe('/admin');
  });

  it('sends an anonymous visitor to sign in and back to this page', async () => {
    renderFrame(401, { error: { code: 'UNAUTHORIZED', message: 'No session', requestId: 'r' } });

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?next=%2Fbrowse'));
  });
});
