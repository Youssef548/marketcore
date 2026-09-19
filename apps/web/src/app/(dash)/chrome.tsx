'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Button } from '@app/ui';
import { signOut, useSession } from '@/lib/session/client';
import { OrganizationSwitcher } from './organization-switcher';

/**
 * The shell every signed-in page sits in.
 *
 * It renders nothing until the session is known, rather than a shell that fills in
 * afterwards: a header that first claims there is no user and then corrects itself
 * is worse than a moment of nothing.
 */
export function DashboardChrome({ appName, children }: { appName: string; children: ReactNode }) {
  const router = useRouter();
  const { state } = useSession();

  useEffect(() => {
    // Only a refusal sends someone to sign in. A failure to reach the server is not
    // evidence of being signed out, and treating it as such turns a blip into a
    // logout — the state below is rendered instead.
    if (state.status === 'anonymous') router.replace('/login');
  }, [state.status, router]);

  if (state.status === 'loading') {
    return <main className="p-10 text-sm text-gray-500">Loading your session…</main>;
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
    <div className="min-h-screen">
      <header className="border-b border-gray-200">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link className="text-sm font-semibold" href="/dashboard">
            {appName}
          </Link>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{state.session.user.email}</span>
            <OrganizationSwitcher />
            <Button
              variant="ghost"
              onClick={() => {
                void signOut().then(() => router.replace('/login'));
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
    </div>
  );
}
