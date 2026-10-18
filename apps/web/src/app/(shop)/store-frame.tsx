'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Alert } from '@app/ui';
import { LOGIN_PATH } from '@/lib/session/routing';
import { useSession } from '@/lib/session/client';
import type { StoreFrameProps } from './interfaces/store-frame.interface';

const NAV = [
  { href: '/browse', label: 'Browse' },
  { href: '/cart', label: 'Cart' },
  { href: '/account/orders', label: 'My orders' },
] as const;

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
    if (state.status === 'anonymous') router.replace(`${LOGIN_PATH}?next=${encodeURIComponent(pathname)}`);
  }, [state.status, router, pathname]);

  if (state.status === 'loading') {
    return (
      <main role="status" aria-live="polite" className="p-10 text-sm text-ink-muted">
        Loading…
      </main>
    );
  }
  if (state.status === 'anonymous') return null;
  if (state.status === 'failed') {
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
          <span className="ml-auto text-sm text-ink-muted">{state.session.user.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
