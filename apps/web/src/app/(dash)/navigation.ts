import { ADMIN_PATH, ADMIN_PRODUCTS_PATH } from '@/lib/session/routing';
import { NavGroups } from './constants';
import type { NavSection, PageBreadcrumb } from './interfaces/navigation.interface';

/**
 * Every console page, once.
 *
 * The rail groups these under their heading and the top bar reads its breadcrumb out
 * of the same entry, because "which section is this page in" is one fact: two lists
 * would let the rail say Catalog while the crumb said something else. Every entry is
 * a route that exists — no section is written ahead of its page, the same line the
 * tokens and the models are held to. The hrefs are the console's own URLs, named in
 * `@/lib/session/routing` rather than typed here.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    group: NavGroups.DASHBOARD,
    entries: [{ href: ADMIN_PATH, label: 'Overview' }],
  },
  {
    group: NavGroups.CATALOG,
    entries: [{ href: ADMIN_PRODUCTS_PATH, label: 'Products' }],
  },
];

/** Which section each page belongs to, derived from the sections themselves. */
const PAGE_GROUPS = new Map<string, PageBreadcrumb>(
  NAV_SECTIONS.flatMap(({ group, entries }) =>
    entries.map(({ href, label }): [string, PageBreadcrumb] => [href, { group, label }]),
  ),
);

/**
 * What the top bar's breadcrumb says for a path, or null for a path this shell was
 * never told about. Null is the honest answer: a crumb invented from a path segment
 * would be the shell claiming to know a page that does not exist.
 */
export function breadcrumbFor(pathname: string): PageBreadcrumb | null {
  return PAGE_GROUPS.get(pathname) ?? null;
}
