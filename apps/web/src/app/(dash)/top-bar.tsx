'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Alert, Button } from '@app/ui';
import { signOut, useReadySession } from '@/lib/session/client';
import { OrganizationSwitcher } from './organization-switcher';
import { pageTitle } from './page-title';
import { ThemeToggle } from './theme-toggle';

/** The first two characters of the local part — `a@x.com` reads "A", not "A@". */
function initials(email: string): string {
  const local = email.split('@')[0]?.replace(/[^a-z0-9]/gi, '') ?? '';
  return (local.slice(0, 2) || email.slice(0, 2)).toUpperCase();
}

/**
 * The page title, the tenant the session acts in, and who is signed in.
 *
 * The tenant lives here rather than in the rail: it gates every tenant-scoped
 * request, so it belongs on the strip that is always visible, next to the page it
 * applies to. The rail keeps only where the session can go.
 */
export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useReadySession();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = pageTitle(pathname);

  async function end() {
    setSigningOut(true);
    setError(null);

    try {
      await signOut();
      router.replace('/login');
    } catch {
      setError('Could not sign out');
      setSigningOut(false);
    }
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-rule bg-panel px-6 py-3">
      {/* No title is the honest answer for a path the shell was never told about; an
       * empty heading is not — so the heading is absent rather than blank. */}
      {title !== null && <h1 className="text-base font-semibold text-ink">{title}</h1>}

      <div className="flex flex-wrap items-center gap-3">
        <OrganizationSwitcher />

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
        <Button variant="secondary" size="sm" busy={signingOut} onClick={() => void end()}>
          Sign out
        </Button>
      </div>

      {error !== null && <Alert className="w-full">{error}</Alert>}
    </header>
  );
}
