import type { z } from 'zod';
import { ErrorCodes } from '@app/contracts';
import type { BodyResult } from './interfaces/http.interface';

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

/**
 * A request header parsed against the contract the API validates it with.
 *
 * The same rule, the same `VALIDATION_ERROR` envelope and the same `issues` as a body —
 * only the subject differs — so a browser cannot tell which hop refused it and does not
 * have to. It sits beside `parseBody` because the two exist for the same reason: this
 * layer is a boundary, and a boundary refuses before forwarding.
 */
export function parseHeader<T>(schema: z.ZodType<T>, value: string | null, requestId: string): BodyResult<T> {
  const parsed = schema.safeParse(value ?? undefined);
  if (parsed.success) return { ok: true, value: parsed.data };

  return {
    ok: false,
    failure: {
      status: 400,
      body: {
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Request header failed validation',
          requestId,
          details: parsed.error.issues,
        },
      },
    },
  };
}
