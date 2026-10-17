import type { NavGroup } from '../constants';

/** One page in the rail, and the crumb it produces. */
export interface NavEntry {
  href: string;
  label: string;
}

/** One heading in the rail, and the pages that belong to it. */
export interface NavSection {
  group: NavGroup;
  entries: readonly NavEntry[];
}

/** Where a page sits, as the top bar's breadcrumb reads it: `Catalog / Products`. */
export interface PageBreadcrumb {
  group: NavGroup;
  label: string;
}
