import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SessionView } from './session';
import { ReadySessionProvider, useReadySession } from './client';

const SESSION: SessionView = {
  user: { id: 'u1', email: 'owner@marketcore.test' },
  organizations: [
    { id: 'org-1', name: 'Nile Traders', slug: 'nile-traders', status: 'ACTIVE', role: 'OWNER' },
    { id: 'org-2', name: 'Cairo Loom', slug: 'cairo-loom', status: 'ACTIVE', role: 'MEMBER' },
  ],
  activeOrganizationId: 'org-1',
};

function Probe() {
  const { user, organizations, activeOrganization } = useReadySession();

  return (
    <ul>
      <li>{user.email}</li>
      <li>{organizations.length}</li>
      <li>{activeOrganization?.name ?? 'No organization'}</li>
    </ul>
  );
}

function renderInside(session: SessionView) {
  return render(
    <ReadySessionProvider session={session} reload={async () => {}}>
      <Probe />
    </ReadySessionProvider>,
  );
}

beforeEach(() => {
  // The refusal below is asserted, so React's own report of it is noise.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the ready session', () => {
  it('hands a signed-in subtree the session, not a union to narrow', () => {
    // The interface is the resolved thing. A consumer inside the shell never has a
    // `loading` or `failed` arm to consider, because the shell already considered it.
    renderInside(SESSION);

    expect(screen.getByText('owner@marketcore.test')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('resolves the active organization once, from the id the session carries', () => {
    renderInside(SESSION);

    expect(screen.getByText('Nile Traders')).toBeTruthy();
  });

  it('answers null for an id that no longer names a membership', () => {
    // Membership can be revoked. The rule lives here so it is stated once rather than
    // re-derived by every module that needs to name the tenant.
    renderInside({ ...SESSION, activeOrganizationId: 'org-gone' });

    expect(screen.getByText('No organization')).toBeTruthy();
  });

  it('answers null rather than guessing when two memberships and nothing is chosen', () => {
    renderInside({ ...SESSION, activeOrganizationId: null });

    expect(screen.getByText('No organization')).toBeTruthy();
  });

  it('refuses to serve a signed-in module outside a signed-in subtree', () => {
    // The invariant is the shell's, and it is enforced at the seam rather than
    // restated as a guard in each consumer that would be silently skipped.
    expect(() => render(<Probe />)).toThrow(/signed-in shell/);
  });
});
