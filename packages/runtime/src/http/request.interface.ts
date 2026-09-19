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
  /**
   * The hostname the client asked for. Behind a reverse proxy this is the public
   * name, not the socket's — which is the only way a log line can distinguish the
   * two, since the process itself sees a local connection either way.
   */
  host?: string;
  /** The scheme a proxy reported, absent when the request did not come through one. */
  forwardedProto?: string;
  /** The client address a proxy reported. */
  forwardedFor?: string;
}

/** Where a completed-request record goes. Injected so tests never touch a real logger. */
export type RequestLogSink = (fields: RequestLogFields) => void;

/** The express middleware shape, named so signatures read as prose. */
export type HttpMiddleware = (req: Request, res: Response, next: NextFunction) => void;
