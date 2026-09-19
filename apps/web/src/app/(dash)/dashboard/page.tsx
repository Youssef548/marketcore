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
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Your session</h1>
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

      <p className="border-t border-rule pt-4 text-xs text-ink-faint">
        The access and refresh tokens are held in <code className="font-mono">httpOnly</code>{' '}
        cookies. Nothing on this page — and no script that found its way onto it — can read them.
      </p>
    </div>
  );
}
