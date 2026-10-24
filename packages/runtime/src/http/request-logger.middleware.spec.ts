import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request } from 'express';
import { FORWARDED_FOR_HEADER, FORWARDED_PROTO_HEADER } from '@app/contracts';
import { requestLoggerMiddleware } from './request-logger.middleware';
import type { FakeResponse } from './request-logger.spec.interface';

function fakeReq(
  requestId?: string,
  headers: Record<string, string | string[]> = {},
): Request {
  return {
    method: 'POST',
    originalUrl: '/api/v1/checkout',
    requestId,
    headers,
  } as unknown as Request;
}

function fakeRes(statusCode = 201): FakeResponse {
  const emitter = new EventEmitter() as FakeResponse;
  (emitter as unknown as { statusCode: number }).statusCode = statusCode;
  emitter.writableFinished = false;
  return emitter;
}

/** What node does when the response was fully sent: `finish`, then `close`. */
function completeResponse(res: FakeResponse): void {
  res.writableFinished = true;
  res.emit('finish');
  res.emit('close');
}

/** What node does when the client disconnects first: `close` alone. */
function abortResponse(res: FakeResponse): void {
  res.emit('close');
}

describe('requestLoggerMiddleware', () => {
  it('emits nothing until the response finishes', () => {
    const log = vi.fn();
    const res = fakeRes();

    requestLoggerMiddleware(log)(fakeReq('req_1'), res, vi.fn() as unknown as NextFunction);

    expect(log).not.toHaveBeenCalled();
  });

  it('calls next immediately so logging never delays the request', () => {
    const log = vi.fn();
    const next = vi.fn() as unknown as NextFunction;

    requestLoggerMiddleware(log)(fakeReq('req_1'), fakeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it('emits one record on finish carrying the request id', () => {
    const log = vi.fn();
    const res = fakeRes(201);

    requestLoggerMiddleware(log)(fakeReq('req_abc'), res, vi.fn() as unknown as NextFunction);
    completeResponse(res);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req_abc',
        method: 'POST',
        path: '/api/v1/checkout',
        status: 201,
        durationMs: expect.any(Number),
      }),
    );
  });

  it('reports a missing request id as undefined rather than dropping the record', () => {
    // A request that never passed the id middleware is still worth logging.
    const log = vi.fn();
    const res = fakeRes(200);

    requestLoggerMiddleware(log)(fakeReq(undefined), res, vi.fn() as unknown as NextFunction);
    completeResponse(res);

    expect(log).toHaveBeenCalledWith(expect.objectContaining({ requestId: undefined, status: 200 }));
  });

  it('records the host and forwarded values, which are unobservable from inside the process', () => {
    // Behind a proxy the socket says only "a connection arrived". The log line is
    // the one place the public hostname and scheme can be seen, which is what makes
    // the proxy headers verifiable at all.
    const log = vi.fn();
    const res = fakeRes(200);

    requestLoggerMiddleware(log)(
      fakeReq('req_proxy', {
        host: 'api.marketcore.test',
        [FORWARDED_PROTO_HEADER]: 'https',
        [FORWARDED_FOR_HEADER]: '203.0.113.5',
      }),
      res,
      vi.fn() as unknown as NextFunction,
    );
    completeResponse(res);

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'api.marketcore.test',
        forwardedProto: 'https',
        forwardedFor: '203.0.113.5',
      }),
    );
  });

  it('takes the first value when a proxy chain sends a repeated forwarded header', () => {
    const log = vi.fn();
    const res = fakeRes(200);

    requestLoggerMiddleware(log)(
      fakeReq('req_chain', { [FORWARDED_FOR_HEADER]: ['203.0.113.5', '10.0.0.1'] }),
      res,
      vi.fn() as unknown as NextFunction,
    );
    completeResponse(res);

    expect(log).toHaveBeenCalledWith(expect.objectContaining({ forwardedFor: '203.0.113.5' }));
  });

  it('leaves the forwarded fields undefined when no proxy was involved', () => {
    const log = vi.fn();
    const res = fakeRes(200);

    requestLoggerMiddleware(log)(
      fakeReq('req_direct', { host: 'localhost:3001' }),
      res,
      vi.fn() as unknown as NextFunction,
    );
    completeResponse(res);

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'localhost:3001',
        forwardedProto: undefined,
        forwardedFor: undefined,
      }),
    );
  });

  it('marks a completed response as not aborted, once, though both finish and close fire', () => {
    const log = vi.fn();
    const res = fakeRes(201);

    requestLoggerMiddleware(log)(fakeReq('req_done'), res, vi.fn() as unknown as NextFunction);
    completeResponse(res);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'req_done', aborted: false }));
  });

  it('still emits one record, marked aborted, when the client disconnects before the response finishes', () => {
    // `finish` never fires for these. They are the slow and hung requests a
    // client gave up on, the ones most worth seeing in the log.
    const log = vi.fn();
    const res = fakeRes(200);

    requestLoggerMiddleware(log)(fakeReq('req_gone'), res, vi.fn() as unknown as NextFunction);
    abortResponse(res);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req_gone', aborted: true, durationMs: expect.any(Number) }),
    );
  });
});
