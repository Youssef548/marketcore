'use client';

import Link from 'next/link';
import { HeadingLevels, PageHeading } from '@app/ui';
import { ADMIN_PRODUCTS_PATH } from '@/lib/session/routing';
import { useReadySession } from '@/lib/session/client';

/**
 * The landing page behind the session: what it is, and where to go next.
 *
 * It proves the session rather than doing anything with it — the signed-in user, the
 * organizations the API says they belong to, and which one the session is acting in —
 * and points at the first page that reads tenant data. It states the tenant the way
 * the top bar does and names no internal identifier, so it reads as an overview
 * rather than a debug dump.
 *
 * It owns its own `h1`, as the design's page head does. The shell names where the page
 * sits, in its breadcrumb; the page names itself, once.
 */
export default function DashboardPage() {
  const { user, organizations, activeOrganization } = useReadySession();

  return (
    <div className="space-y-8">
      {/* A `div` rather than a `header`: the shell's top bar is this page's banner, and a
       * second one would leave "the banner" meaning two things. */}
      <div>
        <PageHeading level={HeadingLevels.H1}>Overview</PageHeading>
        <p className="mt-1 text-sm text-ink-muted">
          Signed in as <span className="font-medium">{user.email}</span>.
        </p>
      </div>

      <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-3 text-sm">
        <dt className="text-ink-faint">Organizations</dt>
        <dd>
          {organizations.length === 0
            ? 'None yet'
            : `${organizations.length} — ${organizations.map(({ name }) => name).join(', ')}`}
        </dd>

        <dt className="text-ink-faint">Acting in</dt>
        <dd>
          {activeOrganization === null ? (
            <span className="text-ink-muted">
              Nothing selected{organizations.length > 1 ? ' — choose one above' : ''}
            </span>
          ) : (
            <>
              <span className="font-medium">{activeOrganization.name}</span>{' '}
              <span className="text-ink-faint">({activeOrganization.role})</span>
            </>
          )}
        </dd>
      </dl>

      <p className="text-sm">
        <Link className="font-medium text-action underline" href={ADMIN_PRODUCTS_PATH}>
          Go to the catalog
        </Link>{' '}
        <span className="text-ink-muted">
          — the first page that reads this organization&apos;s data.
        </span>
      </p>

      <p className="border-t border-rule pt-4 text-xs text-ink-muted">
        Your session is kept in secure cookies that scripts on this page cannot read.
      </p>
    </div>
  );
}
