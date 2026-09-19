import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER } from '@app/contracts';
import { REQUEST_ID_MAX_LENGTH, REQUEST_ID_PATTERN } from '../constants';
import { requestIdMiddleware } from './request-id.middleware';

/**
 * The middleware's decision is "echo it if it is short enough and made of
 * characters that cannot forge a log line". The example suite covers the shapes
 * someone thought of (newline, oversized, repeated); these properties cover the
 * whole input space, which is the space an attacker picks from.
 */
function fakeReq(headers: Record<string, unknown> = {}): Request {
  return { headers } as unknown as Request;
}

function fakeRes(): Response {
  return { setHeader: () => undefined } as unknown as Response;
}

const next = (() => undefined) as unknown as NextFunction;

const idOf = (req: Request) => (req as unknown as { requestId?: string }).requestId;

/** The rule, stated independently of the implementation so the two can disagree. */
const acceptable = (candidate: string): boolean =>
  candidate.length <= REQUEST_ID_MAX_LENGTH && REQUEST_ID_PATTERN.test(candidate);

describe('requestIdMiddleware (property)', () => {
  it('echoes the candidate exactly when it is short and made of safe characters', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: REQUEST_ID_MAX_LENGTH + 20 }), (candidate) => {
        const request = fakeReq({ [REQUEST_ID_HEADER]: candidate });

        requestIdMiddleware(request, fakeRes(), next);

        expect(idOf(request) === candidate).toBe(acceptable(candidate));
      }),
    );
  });

  it('replaces every candidate it rejects with a generated id', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: REQUEST_ID_MAX_LENGTH + 20 }), (candidate) => {
        fc.pre(!acceptable(candidate));

        const request = fakeReq({ [REQUEST_ID_HEADER]: candidate });
        requestIdMiddleware(request, fakeRes(), next);

        expect(idOf(request)).toMatch(/^req_/);
      }),
    );
  });

  it('never lets anything reaching the logs contain a newline', () => {
    // The log-injection vector: a value carrying a newline can forge what looks
    // like a second structured record.
    fc.assert(
      fc.property(fc.string({ maxLength: REQUEST_ID_MAX_LENGTH + 20 }), (candidate) => {
        const request = fakeReq({ [REQUEST_ID_HEADER]: candidate });

        requestIdMiddleware(request, fakeRes(), next);

        expect(idOf(request)).not.toContain('\n');
      }),
    );
  });

  it('bounds the id it assigns, whatever arrives', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: REQUEST_ID_MAX_LENGTH + 20 }), (candidate) => {
        const request = fakeReq({ [REQUEST_ID_HEADER]: candidate });

        requestIdMiddleware(request, fakeRes(), next);

        expect((idOf(request) ?? '').length).toBeLessThanOrEqual(REQUEST_ID_MAX_LENGTH);
      }),
    );
  });
});
