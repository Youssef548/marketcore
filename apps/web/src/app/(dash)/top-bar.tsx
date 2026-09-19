'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@app/ui';
import { signOut, useReadySession } from '@/lib/session/client';
import { pageTitle } from './page-title';

/**
 * The page title and who is signed in.
 *
 * Both live here and nowhere else. The exploration mockups showed the user in the
 * rail and again in the top bar, which is two places to keep in agreement about one
 * fact.
 */
export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useReadySession();

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-rule bg-panel px-6 py-3">
      <h1 className="text-base font-semibold text-ink">{pageTitle(pathname)}</h1>

      <div className="flex items-center gap-3">
        <span className="text-xs text-ink-muted">{user.email}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void signOut().then(() => router.replace('/login'));
          }}
        >
          Sign out
        </Button>
      </div>
    </header>
  );
}
