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
 * When a visitor belongs to several organizations and has not chosen, the control
 * shows a placeholder rather than silently selecting the first — the API would
 * refuse a request that named nothing, and guessing would hide that from the person
 * who has to choose.
 *
 * It sits on the rail rather than a light surface, so its own plane and ink are
 * stated: a form control inherits nothing and would otherwise take the platform's
 * white, which is how an input becomes a slab on a dark rail.
 */
export function OrganizationSwitcher() {
  const { organizations, activeOrganization, reload } = useReadySession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (organizations.length === 0) {
    return <p className="text-xs text-ink-on-rail-muted">No organizations</p>;
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
    <div className="space-y-2">
      <label className="block">
        <span className="sr-only">Active organization</span>
        <select
          className="w-full rounded-brand border border-rail-active bg-rail px-2 py-1 text-xs text-ink-on-rail"
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
      <Alert>{error}</Alert>
    </div>
  );
}
