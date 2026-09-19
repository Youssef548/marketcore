import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

const MAX_LENGTH = 64;
const SAFE = /^[A-Za-z0-9._:-]+$/;

/**
 * Declared rather than augmented onto Express's global namespace on purpose: a
 * hand-written `declare global` in a .d.ts is not emitted into `dist`, so it
 * would reach this package and silently not reach its consumers.
 */
export interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * Gives every request an id and echoes it back, so a client complaint and a log
 * line can be joined. An inbound value is used only when it is short and made of
 * characters that cannot break a log line: an id carrying a newline is a
 * log-injection vector, since it can forge what looks like a second record.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const accepted =
    candidate && candidate.length <= MAX_LENGTH && SAFE.test(candidate) ? candidate : undefined;

  const requestId = accepted ?? `req_${randomUUID()}`;
  (req as RequestWithId).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

export function getRequestId(req: Request): string | undefined {
  return (req as RequestWithId).requestId;
}
