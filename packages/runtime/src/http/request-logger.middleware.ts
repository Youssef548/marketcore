import { FORWARDED_FOR_HEADER, FORWARDED_PROTO_HEADER } from '@app/contracts';
import { getRequestId } from './request-id.middleware';
import type { HttpMiddleware, RequestLogFields, RequestLogSink } from './request.interface';

/** Express gives a repeated header as an array; the first value is the one that counts. */
function firstValue(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

/**
 * One structured line per completed request, carrying the request id. This is
 * what makes "structured logs contain a request ID" true rather than aspirational:
 * the error filter only logs 5xx, so without this most requests would produce no
 * line at all and an id would have nothing to attach to.
 *
 * The record is emitted on `close`, so `next()` is called before any work
 * happens and logging never sits in the request's critical path. `close` and not
 * `finish`: node fires `close` both after a sent response and when the client
 * disconnects first, while `finish` never comes for the second. Those are the slow
 * and hung requests a client gave up on, so they are logged too, marked `aborted`.
 *
 * `host` and the forwarded values are recorded because they are otherwise
 * unobservable from inside the process: behind a proxy the socket says only
 * "a connection arrived", so a log line is the only place the public hostname and
 * scheme can be confirmed to have survived the hop. They are logged as *forwarded*,
 * not as verified — a client can send those headers itself.
 */
export function requestLoggerMiddleware(log: RequestLogSink): HttpMiddleware {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();

    res.on('close', () => {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const fields: RequestLogFields = {
        requestId: getRequestId(req),
        method: req.method,
        path: req.originalUrl ?? req.url,
        status: res.statusCode,
        aborted: !res.writableFinished,
        durationMs: Math.round(elapsedMs * 1000) / 1000,
        host: firstValue(req.headers.host),
        forwardedProto: firstValue(req.headers[FORWARDED_PROTO_HEADER]),
        forwardedFor: firstValue(req.headers[FORWARDED_FOR_HEADER]),
      };
      log(fields);
    });

    next();
  };
}
