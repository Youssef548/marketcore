import { ADMIN_PATH, ADMIN_PRODUCTS_PATH } from '@/lib/session/routing';

/**
 * The title the top bar shows for a path.
 *
 * Derived from the pathname rather than pushed up by each page: the shell and the
 * page would otherwise both state where you are, and two statements of one fact
 * drift. One entry per page that exists, rather than a second mechanism. The key is
 * the page's URL — which is named once, in `@/lib/session/routing`, so moving a route
 * moves its title with it.
 */
const TITLES: Record<string, string> = {
  [ADMIN_PATH]: 'Overview',
  [ADMIN_PRODUCTS_PATH]: 'Products',
};

export function pageTitle(pathname: string): string | null {
  return TITLES[pathname] ?? null;
}
