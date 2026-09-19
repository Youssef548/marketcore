import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { requestLoggerMiddleware } from './request-logger.middleware';

function fakeReq(requestId?: string): Request {
  return { method: 'POST', originalUrl: '/api/v1/checkout', requestId } as unknown as Request;
}

function fakeRes(statusCode = 201): Response & EventEmitter {
  const emitter = new EventEmitter() as Response & EventEmitter;
  (emitter as unknown as { statusCode: number }).statusCode = statusCode;
  return emitter;
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
    res.emit('finish');

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
    res.emit('finish');

    expect(log).toHaveBeenCalledWith(expect.objectContaining({ requestId: undefined, status: 200 }));
  });
});
