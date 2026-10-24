import type { IncomingHttpHeaders } from 'node:http';

/**
 * Node gives a repeated header as an array; the first value is the one that counts.
 *
 * The one place that rule lives, so the request log, the tenant guard and the
 * idempotency key cannot disagree about which of two repeated values they read.
 */
export function firstHeaderValue(header: IncomingHttpHeaders[string]): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}
