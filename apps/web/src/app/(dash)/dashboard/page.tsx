'use client';

import { useReadySession } from '@/lib/session/client';

/**
 * What the session is, made visible.
 *
 * This page exists to prove the session rather than to do anything with it: the
 * signed-in user, the organizations the API says they belong to, and which one the
 * session is acting in. The first page that reads tenant data — products — arrives
 * with the proxy that carries `x-organization-id`, and until then this is the honest
 * end of the journey rather than a placeholder pretending to be one.
 */
export default function DashboardPage() {
  const { user, organizations, activeOrganization } = useReadySession();

  return (
    <div className="space-y-8">
      {/* The top bar already titles the page; a second `h1` with the same words is a
       * duplicated outline a screen reader has to wade through. */}
      <header>
        <p className="text-sm text-ink-muted">
          Signed in as <span className="font-medium">{user.email}</span>.
        </p>
      </header>

      <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-3 text-sm">
        <dt className="text-ink-faint">User id</dt>
        <dd className="font-mono break-all">{user.id}</dd>

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
              Nothing selected{organizations.length > 1 ? ' — choose one in the rail' : ''}
            </span>
          ) : (
            <>
              <span className="font-medium">{activeOrganization.name}</span>{' '}
              <span className="text-ink-faint">({activeOrganization.role})</span>
            </>
          )}
        </dd>
      </dl>

      <p className="border-t border-rule pt-4 text-xs text-ink-muted">
        Your session is kept in secure cookies that scripts on this page cannot read.
      </p>
    </div>
  );
}
