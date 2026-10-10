/**
 * The title the top bar shows for a path.
 *
 * Derived from the pathname rather than pushed up by each page: the shell and the
 * page would otherwise both state where you are, and two statements of one fact
 * drift. One entry per page that exists, rather than a second mechanism.
 */
const TITLES: Record<string, string> = {
  '/dashboard': 'Overview',
  '/products': 'Products',
};

export function pageTitle(pathname: string): string | null {
  return TITLES[pathname] ?? null;
}
