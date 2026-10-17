/** Newest first; the id breaks ties so a cursor is deterministic (D89). Shared by every cursor page. */
export const NEWEST_FIRST = [{ createdAt: 'desc' }, { id: 'desc' }] as const;
