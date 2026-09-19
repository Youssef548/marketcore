import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER, requestIdMiddleware } from './request-id.middleware';

function fakeReq(headers: Record<string, unknown> = {}): Request {
  return { headers } as unknown as Request;
}

function fakeRes(): Response & { setHeader: ReturnType<typeof vi.fn> } {
  return { setHeader: vi.fn() } as unknown as Response & { setHeader: ReturnType<typeof vi.fn> };
}

const idOf = (req: Request) => (req as unknown as { requestId?: string }).requestId;

describe('requestIdMiddleware', () => {
  it('generates an id when none is supplied, echoes it back, and continues', () => {
    const req = fakeReq();
    const res = fakeRes();
    const next = vi.fn() as unknown as NextFunction;

    requestIdMiddleware(req, res, next);

    expect(idOf(req)).toMatch(/^req_/);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, idOf(req));
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reuses a well-formed incoming id', () => {
    const req = fakeReq({ [REQUEST_ID_HEADER]: 'req_abc123' });
    const res = fakeRes();

    requestIdMiddleware(req, res, vi.fn() as unknown as NextFunction);

    expect(idOf(req)).toBe('req_abc123');
  });

  it('replaces an oversized incoming id rather than logging it', () => {
    const oversized = 'x'.repeat(200);
    const req = fakeReq({ [REQUEST_ID_HEADER]: oversized });
    const res = fakeRes();

    requestIdMiddleware(req, res, vi.fn() as unknown as NextFunction);

    expect(idOf(req)).not.toBe(oversized);
    expect(idOf(req)).toMatch(/^req_/);
  });

  it('replaces an id containing characters that would break a log line', () => {
    // A newline in a value that reaches a log line is a log-injection vector:
    // the attacker appends what looks like a second, forged record.
    const forged = 'req_ok\n{"level":"error","event":"forged"}';
    const req = fakeReq({ [REQUEST_ID_HEADER]: forged });
    const res = fakeRes();

    requestIdMiddleware(req, res, vi.fn() as unknown as NextFunction);

    expect(idOf(req)).not.toBe(forged);
    expect(idOf(req)).not.toContain('\n');
  });

  it('uses the first value when the header arrives repeated', () => {
    const req = fakeReq({ [REQUEST_ID_HEADER]: ['req_first', 'req_second'] });
    const res = fakeRes();

    requestIdMiddleware(req, res, vi.fn() as unknown as NextFunction);

    expect(idOf(req)).toBe('req_first');
  });
});
