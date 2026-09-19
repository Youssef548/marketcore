import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { REQUEST_ID_HEADER } from '@app/contracts';
import { REQUEST_ID_MAX_LENGTH, REQUEST_ID_PATTERN } from '../constants';
import type { HttpMiddleware, RequestWithId } from './request.interface';

function isAcceptable(candidate: unknown): candidate is string {
  return (
    typeof candidate === 'string' &&
    candidate.length <= REQUEST_ID_MAX_LENGTH &&
    REQUEST_ID_PATTERN.test(candidate)
  );
}

/**
 * Gives every request an id and echoes it back, so a client complaint and a log
 * line can be joined. An inbound value is used only when it is short and made of
 * characters that cannot break a log line: an id carrying a newline is a
 * log-injection vector, since it can forge what looks like a second record.
 */
export const requestIdMiddleware: HttpMiddleware = (req, res, next) => {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const requestId = isAcceptable(candidate) ? candidate : `req_${randomUUID()}`;

  (req as RequestWithId).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
};

export function getRequestId(req: Request): string | undefined {
  return (req as RequestWithId).requestId;
}
