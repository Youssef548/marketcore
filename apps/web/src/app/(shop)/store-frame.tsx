'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Alert } from '@app/ui';
import { ADMIN_PATH, LOGIN_PATH } from '@/lib/session/routing';
import { SessionStatuses } from '@/lib/session/constants';
import { useSession } from '@/lib/session/client';
import type { StoreFrameProps } from './interfaces/store-frame.interface';

const NAV = [
  { href: '/browse', label: 'Browse' },
  { href: '/cart', label: 'Cart' },
  { href: '/account/orders', label: 'My orders' },
] as const;

/**
 * The way to `/admin`, named for what the visitor will find there (D101).
 *
 * A signed-in visitor now lands on the storefront rather than the console, so this link
 * is the only path to `/admin` the interface offers — and without it a seller, and a user
 * who belongs to nothing at all, would be stranded: the console is where an organization
 * is created, and for a user who has none that screen is called *Start selling*.
 */
const consoleLabel = (organizationCount: number): string =>
  organizationCount === 0 ? 'Start selling' : 'Seller console';

/**
 * The storefront's chrome (Stitch 057's top bar). Unlike DashboardChrome it
 * admits a user with no organization — a buyer is exactly that (D53). Only links
 * whose feature exists render (PRD §7.4): no search, wishlist or account menu.
 * T-002 restyles this component; nothing below it depends on its markup.
 */
export function StoreFrame({ appName, children }: StoreFrameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { state } = useSession();

  useEffect(() => {
    if (state.status === SessionStatuses.ANONYMOUS)
      router.replace(`${LOGIN_PATH}?next=${encodeURIComponent(pathname)}`);
  }, [state.status, router, pathname]);

  if (state.status === SessionStatuses.LOADING) {
    return (
      <main role="status" aria-live="polite" className="p-10 text-sm text-ink-muted">
        Loading…
      </main>
    );
  }
  if (state.status === SessionStatuses.ANONYMOUS) return null;
  if (state.status === SessionStatuses.FAILED) {
    return (
      <main className="mx-auto max-w-2xl p-10">
        <Alert>{state.message}</Alert>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-rule bg-panel">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/browse" className="text-sm font-semibold">
            {appName}
          </Link>
          <nav aria-label="Shop" className="flex gap-4 text-sm">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? 'page' : undefined}
                className={pathname === href ? 'font-semibold' : 'text-ink-muted hover:text-ink'}
              >
                {label}
              </Link>
            ))}
          </nav>
          <Link href={ADMIN_PATH} className="ml-auto text-sm text-ink-muted hover:text-ink">
            {consoleLabel(state.session.organizations.length)}
          </Link>
          <span className="text-sm text-ink-muted">{state.session.user.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
