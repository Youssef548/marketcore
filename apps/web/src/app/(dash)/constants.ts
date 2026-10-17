/**
 * The rail's sections, as a closed set.
 *
 * A const object rather than a string union, so a caller names the section it means
 * and a rename happens once. Beside the code that reads it, the same shape as
 * `components/constants.ts` and `packages/ui/src/constants.ts`.
 */
export const NavGroups = { DASHBOARD: 'Dashboard', CATALOG: 'Catalog' } as const;
export type NavGroup = (typeof NavGroups)[keyof typeof NavGroups];
