import type { z } from 'zod';

/**
 * Asserts that a response body satisfies the contract the client validates with.
 *
 * An e2e assertion written as a literal is a copy of the contract that goes stale
 * silently: `toMatchObject` still passes when a field is renamed, dropped or
 * quietly retyped. Parsing the body with the same schema `@app/contracts` exports
 * — and that `packages/api-client` re-parses responses with — makes the server's
 * own wire format the thing under test.
 *
 * Use it *alongside* the literal assertions, not instead of them: the literal
 * proves the specific value, this proves the shape.
 */
export function expectContract<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      `response does not satisfy its contract:\n${JSON.stringify(parsed.error.issues, null, 2)}\nbody: ${JSON.stringify(body)}`,
    );
  }
  return parsed.data;
}
