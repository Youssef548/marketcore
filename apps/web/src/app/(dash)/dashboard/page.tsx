'use client';

import { useSession } from '@/lib/session/client';

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
  const { state } = useSession();

  // Loading and refusals are the chrome's business; it renders the shell around us.
  if (state.status !== 'ready') return null;

  const { user, organizations, activeOrganizationId } = state.session;
  const active = organizations.find(({ id }) => id === activeOrganizationId) ?? null;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your session</h1>
        <p className="text-sm text-gray-600">
          Signed in as <span className="font-medium">{user.email}</span>.
        </p>
      </header>

      <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-3 text-sm">
        <dt className="text-gray-500">User id</dt>
        <dd className="font-mono break-all">{user.id}</dd>

        <dt className="text-gray-500">Organizations</dt>
        <dd>
          {organizations.length === 0
            ? 'None yet'
            : `${organizations.length} — ${organizations.map(({ name }) => name).join(', ')}`}
        </dd>

        <dt className="text-gray-500">Acting in</dt>
        <dd>
          {active === null ? (
            <span className="text-gray-600">
              Nothing selected{organizations.length > 1 ? ' — choose one above' : ''}
            </span>
          ) : (
            <>
              <span className="font-medium">{active.name}</span>{' '}
              <span className="text-gray-500">({active.role})</span>
            </>
          )}
        </dd>
      </dl>

      <p className="border-t border-gray-200 pt-4 text-xs text-gray-500">
        The access and refresh tokens are held in <code className="font-mono">httpOnly</code>{' '}
        cookies. Nothing on this page — and no script that found its way onto it — can read them.
      </p>
    </div>
  );
}
