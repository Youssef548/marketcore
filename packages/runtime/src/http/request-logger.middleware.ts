import { getRequestId } from './request-id.middleware';
import type { HttpMiddleware, RequestLogFields, RequestLogSink } from './request.interface';

/**
 * One structured line per completed request, carrying the request id. This is
 * what makes "structured logs contain a request ID" true rather than aspirational:
 * the error filter only logs 5xx, so without this most requests would produce no
 * line at all and an id would have nothing to attach to.
 *
 * The record is emitted on `finish`, so `next()` is called before any work
 * happens and logging never sits in the request's critical path.
 */
export function requestLoggerMiddleware(log: RequestLogSink): HttpMiddleware {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const fields: RequestLogFields = {
        requestId: getRequestId(req),
        method: req.method,
        path: req.originalUrl ?? req.url,
        status: res.statusCode,
        durationMs: Math.round(elapsedMs * 1000) / 1000,
      };
      log(fields);
    });

    next();
  };
}
