'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@app/ui';
import { useSession, ReadySessionProvider } from '@/lib/session/client';
import { Rail } from './rail';
import { TopBar } from './top-bar';

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
export function DashboardChrome({ appName, children }: { appName: string; children: ReactNode }) {
  const router = useRouter();
  const { state, reload } = useSession();

  useEffect(() => {
    // Only a refusal sends someone to sign in. A failure to reach the server is not
    // evidence of being signed out, and treating it as such turns a blip into a
    // logout — the state below is rendered instead.
    if (state.status === 'anonymous') router.replace('/login');
  }, [state.status, router]);

  if (state.status === 'loading') {
    return <main className="p-10 text-sm text-ink-muted">Loading your session…</main>;
  }

  if (state.status === 'anonymous') {
    // The redirect is in flight.
    return null;
  }

  if (state.status === 'failed') {
    return (
      <main className="mx-auto max-w-2xl p-10">
        <Alert>{state.message}</Alert>
      </main>
    );
  }

  return (
    <ReadySessionProvider session={state.session} reload={reload}>
      <div className="grid min-h-screen grid-cols-[13rem_minmax(0,1fr)]">
        <Rail appName={appName} />

        <div className="flex min-w-0 flex-col bg-canvas">
          <TopBar />
          <main className="mx-auto w-full max-w-3xl px-6 py-8">{children}</main>
        </div>
      </div>
    </ReadySessionProvider>
  );
}
