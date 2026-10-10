'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useReadySession } from '@/lib/session/client';
import { OrganizationSwitcher } from './organization-switcher';

/**
 * Where the session can go.
 *
 * Every entry is a route that exists — no section is listed ahead of its page, the
 * same line this repository draws for tokens and models. The active item is derived
 * from the pathname rather than passed down, so the rail cannot claim a page the
 * router is not on.
 */
const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/products', label: 'Products' },
] as const;

/**
 * The app's chrome: which tenant the session acts in, and where it can go.
 *
 * The tenant and its picker live here and nowhere else. It is `apps/web`'s
 * component rather than `@app/ui`'s because it knows about organizations, sessions
 * and routing, and the design system knows about none of them (D47).
 *
 * It receives a session rather than a state to narrow: the shell has already
 * answered whether there is one, so the tenant's name and its absence are the only
 * two cases left to render.
 */
export function Rail({ appName }: { appName: string }) {
  const { activeOrganization } = useReadySession();
  const pathname = usePathname();

  return (
    <aside className="flex flex-col gap-1 border-b border-rail-edge bg-rail px-3.5 py-4 lg:border-b-0 lg:border-r">
      <Link
        className="flex items-center gap-2.5 px-1.5 pb-4 text-sm font-semibold text-ink-on-rail"
        href="/dashboard"
      >
        {/* The mark is the direction's, and it is decoration: the name beside it is
         * what a screen reader reads. */}
        <span aria-hidden className="relative h-7 w-7 shrink-0 rounded-[9px] bg-rail-active">
          <span className="absolute inset-[7px] block border-b-2 border-l-2 border-ink-on-action" />
        </span>
        {appName}
      </Link>

      <div className="mb-3 space-y-2 rounded-brand bg-rail-hover px-2.5 py-2.5">
        <p className="truncate text-sm font-medium text-ink-on-rail">
          {activeOrganization === null ? 'No organization' : activeOrganization.name}
        </p>
        <p className="text-xs text-ink-on-rail-muted">
          {activeOrganization === null ? 'Choose one to continue' : activeOrganization.role}
        </p>
        <OrganizationSwitcher />
      </div>

      <nav className="space-y-1">
        {NAV.map(({ href, label }) => {
          const active = pathname === href;

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`block rounded-brand px-2.5 py-2 text-sm ${
                active
                  ? 'bg-rail-active font-semibold text-ink-on-action'
                  : 'text-ink-on-rail-muted hover:bg-rail-hover hover:text-ink-on-rail'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
