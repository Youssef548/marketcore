import { z } from 'zod';

/**
 * A cursor page request. The cursor is the id of the last item already seen
 * (D89); it is opaque to clients, who only ever echo `nextCursor` back.
 * Not strict: a query string routinely carries keys a page does not own.
 */
export const PageQuerySchema = z.object({ cursor: z.string().min(1).optional() });
export type PageQuery = z.infer<typeof PageQuerySchema>;

/** A page of `item`. Strict, so a page cannot grow a field nobody contracted. */
export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() }).strict();
}
