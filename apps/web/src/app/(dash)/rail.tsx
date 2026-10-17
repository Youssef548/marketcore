'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ADMIN_PATH } from '@/lib/session/routing';
import { NAV_SECTIONS } from './navigation';
import type { RailProps } from './interfaces/rail.interface';

/**
 * Where the session can go, grouped as the Stitch rail groups it (001, 048).
 *
 * The pages, their order and their sections are one registry (`./navigation`), which
 * the top bar's breadcrumb reads too — so the rail cannot mark a page the crumb does
 * not know about. Every entry is a route that exists: no section is listed ahead of
 * its page, and the design's counts, search box and notification badge are absent
 * because the features behind them are.
 *
 * The rail carries navigation and nothing else: the tenant lives in the top bar,
 * where it is visible beside the page it scopes rather than screaming its own box
 * into a column that is otherwise about movement.
 */
export function Rail({ appName }: RailProps) {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Primary"
      className="flex flex-col gap-4 border-b border-rail-edge bg-rail px-3.5 py-4 lg:border-b-0 lg:border-r"
    >
      <Link
        className="flex items-center gap-2.5 px-1.5 text-sm font-semibold text-ink-on-rail"
        href={ADMIN_PATH}
      >
        {/* The mark is the direction's, and it is decoration: the name beside it is
         * what a screen reader reads. */}
        <span aria-hidden className="relative h-7 w-7 shrink-0 rounded-[9px] bg-rail-active">
          <span className="absolute inset-[7px] block border-b-2 border-l-2 border-ink-on-action" />
        </span>
        {appName}
      </Link>

      <nav className="flex flex-col gap-0.5">
        {NAV_SECTIONS.map(({ group, entries }) => (
          <div key={group}>
            {/* The design's `.navhead`: uppercase, wide tracking, muted — at the 12px
             * floor rather than the 11px 048 draws it at. */}
            <span className="block px-2.5 pb-1 pt-3.5 text-xs font-semibold uppercase tracking-[0.13em] text-ink-on-rail-muted">
              {group}
            </span>

            {entries.map(({ href, label }) => {
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
          </div>
        ))}
      </nav>
    </aside>
  );
}
