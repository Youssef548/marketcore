import type { z } from 'zod';
import { ErrorCodes } from '@app/contracts';
import type { FailureResponse } from './envelope';

/**
 * A request body, read without throwing.
 *
 * An unparseable body is `undefined` rather than an exception, because it is a
 * malformed request rather than a broken server: it should end as the same
 * VALIDATION_ERROR envelope an ill-formed field does, not as a 500.
 */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export type BodyResult<T> = { ok: true; value: T } | { ok: false; failure: FailureResponse };

/**
 * A body parsed against the contract the API validates it with.
 *
 * The browser is a boundary, so its input is checked here rather than left to the
 * API: a malformed body never crosses the second hop, and the refusal carries the
 * same envelope shape and the same `VALIDATION_ERROR` code the API would have
 * produced, so a client cannot tell which side refused it — and does not have to.
 */
export function parseBody<T>(schema: z.ZodType<T>, value: unknown, requestId: string): BodyResult<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };

  return {
    ok: false,
    failure: {
      status: 400,
      body: {
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Request body failed validation',
          requestId,
          details: parsed.error.issues,
        },
      },
    },
  };
}
