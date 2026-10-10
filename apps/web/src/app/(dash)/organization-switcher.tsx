'use client';

import { useState } from 'react';
import { Alert } from '@app/ui';
import { selectOrganization, useReadySession } from '@/lib/session/client';

/**
 * Which organization the session is acting in.
 *
 * Not decoration and not a preference: every tenant-scoped API call carries this as
 * `x-organization-id`, so it is the difference between reading your own products and
 * being refused. It is held in a cookie rather than in component state because the
 * next data page is fetched by the server, which can only read a cookie.
 *
 * It sits in the top bar rather than the rail, because choosing the tenant gates
 * every request and belongs on the strip that is always visible beside the page it
 * applies to — and because that surface is the page's own panel, not the dark rail it
 * used to render a light control on top of.
 *
 * It shows a real control only when there is a choice. With one membership it states
 * the organization and offers nothing: a one-option select is a control pretending to
 * decide something. With several and none chosen it asks, rather than silently
 * selecting the first — the API would refuse a request naming nothing, and a guess
 * would hide that from the person who has to choose.
 */
export function OrganizationSwitcher() {
  const { organizations, activeOrganization, reload } = useReadySession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function choose(organizationId: string) {
    setPending(true);
    setError(null);

    try {
      await selectOrganization(organizationId);
      await reload();
    } catch {
      setError('Could not change organization');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-ink-faint">Acting in</span>

      {organizations.length < 2 ? (
        <span className="text-xs font-medium text-ink">
          {activeOrganization === null ? 'No organization' : activeOrganization.name}
        </span>
      ) : (
        <label className="flex items-center gap-2">
          <span className="sr-only">Active organization</span>
          <select
            className="rounded-brand border border-control-edge bg-panel px-2 py-1.5 text-xs text-ink"
            disabled={pending}
            value={activeOrganization?.id ?? ''}
            onChange={(event) => void choose(event.target.value)}
          >
            {activeOrganization === null && (
              <option value="" disabled>
                Choose an organization
              </option>
            )}
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <Alert>{error}</Alert>
    </div>
  );
}
