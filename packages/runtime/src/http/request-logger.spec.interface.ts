import type { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import type { Response } from 'express';
import type { RequestLogFields } from './request.interface';

/** A response that can say whether it was fully sent. */
export interface FinishFlag {
  writableFinished: boolean;
}

/** An express response a spec drives by emitting node's own events. */
export type FakeResponse = Response & EventEmitter & FinishFlag;

export interface LoggedServer {
  server: Server;
  port: number;
  /** Resolves with the first record the middleware logs. */
  record: Promise<RequestLogFields>;
  /** Resolves once the server has the hanging request in hand. */
  hanging: Promise<void>;
}
