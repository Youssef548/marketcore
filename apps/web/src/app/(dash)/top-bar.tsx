'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@app/ui';
import { signOut, useReadySession } from '@/lib/session/client';
import { pageTitle } from './page-title';
import { ThemeToggle } from './theme-toggle';

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
        <span className="flex items-center gap-2.5 rounded-brand border border-rule bg-panel py-1.5 pl-1.5 pr-3">
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-full bg-sunken text-[11px] font-semibold text-ink-muted"
          >
            {user.email.slice(0, 2).toUpperCase()}
          </span>
          <span className="text-xs font-medium text-ink">{user.email}</span>
        </span>
        <ThemeToggle />
        <Button
          variant="secondary"
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
