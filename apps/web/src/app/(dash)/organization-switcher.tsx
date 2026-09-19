'use client';

import { useState } from 'react';
import { Alert } from '@app/ui';
import { selectOrganization, useSession } from '@/lib/session/client';

/**
 * Which organization the session is acting in.
 *
 * Not decoration and not a preference: every tenant-scoped API call carries this as
 * `x-organization-id`, so it is the difference between reading your own products and
 * being refused. It is held in a cookie rather than in component state because the
 * next data page is fetched by the server, which can only read a cookie.
 *
 * When a visitor belongs to several organizations and has not chosen, the control
 * shows a placeholder rather than silently selecting the first — the API would
 * refuse a request that named nothing, and guessing would hide that from the person
 * who has to choose.
 */
export function OrganizationSwitcher() {
  const { state, reload } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (state.status !== 'ready') return null;

  const { organizations, activeOrganizationId } = state.session;
  if (organizations.length === 0) {
    return <span className="text-xs text-gray-500">No organizations</span>;
  }

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
      <label className="text-xs text-gray-500">
        <span className="sr-only">Active organization</span>
        <select
          className="rounded-brand border border-gray-300 bg-transparent px-2 py-1 text-sm"
          disabled={pending}
          value={activeOrganizationId ?? ''}
          onChange={(event) => void choose(event.target.value)}
        >
          {activeOrganizationId === null && (
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
      <Alert>{error}</Alert>
    </div>
  );
}
