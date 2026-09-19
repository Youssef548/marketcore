import type { NextFunction, Request, Response } from 'express';

/**
 * Express's `Request`, carrying the correlation id the middleware assigned.
 *
 * Declared rather than augmented onto Express's global namespace on purpose: a
 * hand-written `declare global` in a .d.ts is not emitted into `dist`, so it
 * would reach this package and silently not reach its consumers.
 */
export interface RequestWithId extends Request {
  requestId?: string;
}

export interface RequestLogFields {
  requestId?: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
}

/** Where a completed-request record goes. Injected so tests never touch a real logger. */
export type RequestLogSink = (fields: RequestLogFields) => void;

/** The express middleware shape, named so signatures read as prose. */
export type HttpMiddleware = (req: Request, res: Response, next: NextFunction) => void;
