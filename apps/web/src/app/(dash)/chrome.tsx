'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@app/ui';
import { useSession, ReadySessionProvider } from '@/lib/session/client';
import { SessionStatuses } from '@/lib/session/constants';
import { LOGIN_PATH } from '@/lib/session/routing';
import { Rail } from './rail';
import { TopBar } from './top-bar';
import { Onboarding } from './onboarding';
import type { DashboardChromeProps } from './interfaces/chrome.interface';

/**
 * The shell every signed-in page sits in.
 *
 * It renders nothing until the session is known, rather than a shell that fills in
 * afterwards: a header that first claims there is no user and then corrects itself
 * is worse than a moment of nothing.
 *
 * This is also the one module that narrows the session's four states. Everything
 * below it is rendered inside `ReadySessionProvider` and receives a session, so the
 * rail, the top bar, the switcher and every page state the question "is there a
 * session" neither by guarding nor in prose.
 */
export function DashboardChrome({ appName, children }: DashboardChromeProps) {
  const router = useRouter();
  const { state, reload } = useSession();

  useEffect(() => {
    // Only a refusal sends someone to sign in. A failure to reach the server is not
    // evidence of being signed out, and treating it as such turns a blip into a
    // logout — the state below is rendered instead.
    if (state.status === SessionStatuses.ANONYMOUS) router.replace(LOGIN_PATH);
  }, [state.status, router]);

  if (state.status === SessionStatuses.LOADING) {
    return (
      <main role="status" aria-live="polite" className="p-10 text-sm text-ink-muted">
        Loading your session…
      </main>
    );
  }

  if (state.status === SessionStatuses.ANONYMOUS) {
    // The redirect is in flight.
    return null;
  }

  if (state.status === SessionStatuses.FAILED) {
    return (
      <main className="mx-auto max-w-2xl p-10">
        <Alert>{state.message}</Alert>
      </main>
    );
  }

  // The fifth outcome of `ready`: a session with no organization.
  //
  // Rendered *instead of* the shell, not inside it. Every tenant-scoped control in the shell is
  // inert without a tenant — a rail with nothing to pick, pages that answer "choose an
  // organization first" — and admitting someone to that is the dead end this replaces. Creating
  // the organization reloads the session, and the shell appears in place.
  if (state.session.organizations.length === 0) {
    return (
      <Onboarding appName={appName} email={state.session.user.email} onCreated={reload} />
    );
  }

  return (
    <ReadySessionProvider session={state.session} reload={reload}>
      {/* One column below `lg`, so the rail is a full-width block above the content
       * rather than a fixed 252px column that squeezed a 390px viewport to 138px. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-brand focus:border focus:border-control-edge focus:bg-panel focus:px-3 focus:py-2 focus:text-sm focus:text-ink"
      >
        Skip to content
      </a>
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[15.75rem_minmax(0,1fr)]">
        <Rail appName={appName} />

        <div className="flex min-w-0 flex-col bg-canvas">
          <TopBar />
          <main id="main-content" className="mx-auto w-full max-w-5xl px-6 py-8">
            {children}
          </main>
        </div>
      </div>
    </ReadySessionProvider>
  );
}
