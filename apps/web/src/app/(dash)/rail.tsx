'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Where the session can go.
 *
 * Every entry is a route that exists — no section is listed ahead of its page, the
 * same line this repository draws for tokens and models. The active item is derived
 * from the pathname rather than passed down, so the rail cannot claim a page the
 * router is not on.
 *
 * It carries navigation and nothing else: the tenant lives in the top bar, where it
 * is visible beside the page it scopes rather than screaming its own box into a
 * column that is otherwise about movement.
 */
const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/products', label: 'Products' },
] as const;

export function Rail({ appName }: { appName: string }) {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Primary"
      className="flex flex-col gap-4 border-b border-rail-edge bg-rail px-3.5 py-4 lg:border-b-0 lg:border-r"
    >
      <Link
        className="flex items-center gap-2.5 px-1.5 text-sm font-semibold text-ink-on-rail"
        href="/dashboard"
      >
        {/* The mark is the direction's, and it is decoration: the name beside it is
         * what a screen reader reads. */}
        <span aria-hidden className="relative h-7 w-7 shrink-0 rounded-[9px] bg-rail-active">
          <span className="absolute inset-[7px] block border-b-2 border-l-2 border-ink-on-action" />
        </span>
        {appName}
      </Link>

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
