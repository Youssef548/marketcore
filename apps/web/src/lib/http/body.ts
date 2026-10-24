import type { z } from 'zod';
import { ErrorCodes } from '@app/contracts';
import { JSON_MEDIA_TYPE, REQUEST_HEADERS, SAME_ORIGIN_FETCH_SITES } from './http.constants';
import type { BodyResult } from './interfaces/http.interface';

/**
 * A request body, read without throwing.
 *
 * An unparseable body is `undefined` rather than an exception, because it is a
 * malformed request rather than a broken server: it should end as the same
 * VALIDATION_ERROR envelope an ill-formed field does, not as a 500.
 *
 * It is also where a cross-site write is refused. `request.json()` parses whatever it
 * is given regardless of `Content-Type`, and two of the routes reading a body here are
 * unauthenticated — register and login — so SameSite on the session cookies protects
 * neither. A form can post `text/plain` without a preflight and make the body parse as
 * JSON, which is how a victim gets signed into an attacker's account. Requiring the
 * media type and checking where the request came from closes that at the one place
 * every mutation passes through.
 */
export async function readJson(request: Request): Promise<unknown> {
  if (!isJsonBody(request) || !isSameOrigin(request)) return undefined;

  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** Whether the body declares itself JSON, ignoring parameters such as `;charset=utf-8`. */
function isJsonBody(request: Request): boolean {
  const value = request.headers.get(REQUEST_HEADERS.CONTENT_TYPE);
  if (value === null) return false;

  return (value.split(';')[0] ?? '').trim().toLowerCase() === JSON_MEDIA_TYPE;
}

/**
 * Whether the browser aimed this request at this origin.
 *
 * `Origin` is the authoritative signal and is sent by browsers on every non-GET
 * request. It is absent for a non-browser caller (a test, `curl`), which is why an
 * absent header is allowed here: the media-type check above is the control that does
 * not depend on the caller, and this one adds depth for browsers that send the header.
 */
function isSameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get(REQUEST_HEADERS.SEC_FETCH_SITE);
  if (fetchSite !== null && !SAME_ORIGIN_FETCH_SITES.has(fetchSite)) return false;

  const origin = request.headers.get(REQUEST_HEADERS.ORIGIN);
  if (origin === null) return true;

  return origin === new URL(request.url).origin;
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
