import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Env } from '@app/runtime';
import { ORIGIN_SEPARATOR } from '../constants';

/**
 * Origins are credited rather than wildcarded, so the browser will attach the
 * session's credentials. A `*` origin cannot be combined with credentials at all,
 * which is why the allowlist exists instead of a permissive default.
 */
const CORS_CREDENTIALS = true;

/**
 * `WEB_URL` is a comma-separated list, so a local setup can allow the web app on
 * more than one port. Entries are trimmed and blanks dropped: an empty origin
 * matches nothing, and leaving one in the list only makes the allowlist harder to
 * read back.
 */
export function parseAllowedOrigins(webUrl: string): string[] {
  return webUrl
    .split(ORIGIN_SEPARATOR)
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * The CORS configuration, derived from the validated environment.
 *
 * This is a function rather than an inline object at the `enableCors` call site so
 * that the parsing is unit-testable and so `configureApp` holds wiring only.
 */
export function corsOptions(env: Env): CorsOptions {
  return { origin: parseAllowedOrigins(env.WEB_URL), credentials: CORS_CREDENTIALS };
}
