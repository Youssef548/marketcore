import { z } from 'zod';

/**
 * Returns the typed value from a parse result or throws the ZodError, for tests
 * and clients that want a value rather than a `{ success }` union to branch on.
 *
 * Deliberately tiny: parse errors are a contract violation, and the caller that
 * reaches for this helper has decided that is a programming error worth throwing.
 */
export function unwrap<T>(result: z.ZodSafeParseResult<T>): T {
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}
