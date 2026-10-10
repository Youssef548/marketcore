'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@app/ui';
import { signOut, useReadySession } from '@/lib/session/client';
import { pageTitle } from './page-title';
import { ThemeToggle } from './theme-toggle';

/** The first two characters of the local part — `a@x.com` reads "A", not "A@". */
function initials(email: string): string {
  const local = email.split('@')[0]?.replace(/[^a-z0-9]/gi, '') ?? '';
  return (local.slice(0, 2) || email.slice(0, 2)).toUpperCase();
}

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
  const [signingOut, setSigningOut] = useState(false);

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-rule bg-panel px-6 py-3">
      <h1 className="text-base font-semibold text-ink">{pageTitle(pathname)}</h1>

      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2.5 rounded-brand border border-rule bg-panel py-1.5 pl-1.5 pr-3">
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-full bg-sunken text-[11px] font-semibold text-ink-muted"
          >
            {initials(user.email)}
          </span>
          <span className="max-w-[14rem] truncate text-xs font-medium text-ink">{user.email}</span>
        </span>
        <ThemeToggle />
        <Button
          variant="secondary"
          size="sm"
          busy={signingOut}
          onClick={() => {
            setSigningOut(true);
            void signOut()
              .then(() => router.replace('/login'))
              .finally(() => setSigningOut(false));
          }}
        >
          Sign out
        </Button>
      </div>
    </header>
  );
}
