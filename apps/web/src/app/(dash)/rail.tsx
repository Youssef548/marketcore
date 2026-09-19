'use client';

import Link from 'next/link';
import { useReadySession } from '@/lib/session/client';
import { OrganizationSwitcher } from './organization-switcher';

/**
 * The app's chrome: which tenant the session acts in, and where it can go.
 *
 * The tenant and its picker live here and nowhere else. It is `apps/web`'s
 * component rather than `@app/ui`'s because it knows about organizations, sessions
 * and routing, and the design system knows about none of them (D47).
 *
 * It receives a session rather than a state to narrow: the shell has already
 * answered whether there is one, so the tenant's name and its absence are the only
 * two cases left to render.
 */
export function Rail({ appName }: { appName: string }) {
  const { activeOrganization } = useReadySession();

  return (
    <aside className="flex flex-col gap-1 border-r border-rail-edge bg-rail px-3 py-4">
      <Link className="px-2 pb-4 text-sm font-semibold text-ink-on-rail" href="/dashboard">
        {appName}
      </Link>

      <div className="mb-3 space-y-2 rounded-brand bg-rail-hover px-2 py-2">
        <p className="text-sm font-medium text-ink-on-rail">
          {activeOrganization === null ? 'No organization' : activeOrganization.name}
        </p>
        <p className="text-xs text-ink-on-rail-muted">
          {activeOrganization === null ? 'Choose one to continue' : activeOrganization.role}
        </p>
        <OrganizationSwitcher />
      </div>

      <nav>
        <Link
          className="block rounded-brand px-2 py-1.5 text-sm text-ink-on-rail-muted hover:bg-rail-hover hover:text-ink-on-rail"
          href="/dashboard"
          aria-current="page"
        >
          Overview
        </Link>
      </nav>
    </aside>
  );
}
