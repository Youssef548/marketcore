/**
 * A cursor page from `size + 1` rows: the extra row only proves there is more.
 * The cursor is the last returned row's id (D89); callers order by
 * (createdAt desc, id desc) so the id breaks ties deterministically.
 */
export function toPage<Row extends { id: string }, Item>(
  rows: readonly Row[],
  size: number,
  map: (row: Row) => Item,
): { items: Item[]; nextCursor: string | null } {
  const hasMore = rows.length > size;
  const pageRows = hasMore ? rows.slice(0, size) : rows;
  const last = pageRows[pageRows.length - 1];
  return { items: pageRows.map(map), nextCursor: hasMore && last !== undefined ? last.id : null };
}
