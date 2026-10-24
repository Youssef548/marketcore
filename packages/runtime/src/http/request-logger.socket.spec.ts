import { once } from 'node:events';
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { requestLoggerMiddleware } from './request-logger.middleware';
import type { RequestLogFields } from './request.interface';

/** A route that answers at once. */
const DONE_PATH = '/done';
/** A route that never answers, so only the client can end it. */
const HANG_PATH = '/hang';

interface LoggedServer {
  server: Server;
  port: number;
  /** Resolves with the first record the middleware logs. */
  record: Promise<RequestLogFields>;
  /** Resolves once the server has the hanging request in hand. */
  hanging: Promise<void>;
}

/**
 * The fake-response spec assumes node's ordering: `close` follows `finish` on a
 * sent response and arrives alone on a dropped one. This proves it on a real socket.
 */
async function startLoggedServer(): Promise<LoggedServer> {
  let resolveRecord!: (fields: RequestLogFields) => void;
  let resolveHanging!: () => void;
  const record = new Promise<RequestLogFields>((resolve) => (resolveRecord = resolve));
  const hanging = new Promise<void>((resolve) => (resolveHanging = resolve));
  const middleware = requestLoggerMiddleware(resolveRecord);

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    middleware(req as Request, res as Response, (() => {
      if (req.url === HANG_PATH) {
        resolveHanging();
        return;
      }
      res.end('ok');
    }) as NextFunction);
  });
  server.listen(0);
  await once(server, 'listening');
  return { server, port: (server.address() as AddressInfo).port, record, hanging };
}

describe('requestLoggerMiddleware on a real socket', () => {
  let server: Server | undefined;

  afterEach(async () => {
    server?.closeAllConnections();
    await new Promise((resolve) => server?.close(resolve));
    server = undefined;
  });

  it('logs a sent response once, as not aborted', async () => {
    const logged = await startLoggedServer();
    server = logged.server;

    const req = request({ port: logged.port, path: DONE_PATH });
    req.end();
    const [res] = (await once(req, 'response')) as [IncomingMessage];
    res.resume();

    await expect(logged.record).resolves.toMatchObject({ path: DONE_PATH, status: 200, aborted: false });
  });

  it('logs a request the client dropped before any response, as aborted', async () => {
    const logged = await startLoggedServer();
    server = logged.server;

    const req = request({ port: logged.port, path: HANG_PATH });
    req.on('error', () => undefined);
    req.end();
    await logged.hanging;
    req.destroy();

    await expect(logged.record).resolves.toMatchObject({ path: HANG_PATH, aborted: true });
  });
});
