import { describe, expect, it } from 'vitest';
import { ApiError } from '@app/api-client';
import { ErrorCodes, ErrorEnvelopeSchema } from '@app/contracts';
import { failureResponse } from './envelope';

/**
 * The web app is a second server the browser talks to, and this repository's third
 * invariant is that every failure has one shape. These tests hold this layer to it:
 * a browser branches on the same `code` whether the refusal came from the API or was
 * produced here.
 */
describe('failureResponse', () => {
  it('passes an ApiError through with its code intact', () => {
    const { status, body } = failureResponse(
      new ApiError(409, ErrorCodes.CONFLICT, 'Email is already registered'),
      'req_1',
    );

    expect(status).toBe(409);
    expect(body).toEqual({
      error: {
        code: 'CONFLICT',
        message: 'Email is already registered',
        requestId: 'req_1',
      },
    });
  });

  it('carries the details through when the API sent them', () => {
    const details = [{ path: ['email'], message: 'Invalid' }];

    const { body } = failureResponse(new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'bad', details), 'req_2');

    expect(body.error.details).toEqual(details);
  });

  it('omits details rather than sending an undefined field', () => {
    const { body } = failureResponse(new ApiError(404, ErrorCodes.NOT_FOUND, 'gone'), 'req_3');

    expect(body.error).not.toHaveProperty('details');
  });

  it('reports anything else as INTERNAL and leaks nothing about this process', () => {
    const { status, body } = failureResponse(
      new Error('connect ECONNREFUSED 127.0.0.1:3001'),
      'req_4',
    );

    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL');
    // The API's address, and any stack, must not reach a browser.
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(body)).not.toContain('stack');
  });

  it('produces a body the shared envelope contract accepts, in every case', () => {
    const errors: unknown[] = [
      new ApiError(401, ErrorCodes.UNAUTHORIZED, 'no'),
      new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'bad', { any: 'thing' }),
      new Error('x'),
      'not even an error',
      undefined,
    ];

    for (const error of errors) {
      const parsed = ErrorEnvelopeSchema.safeParse(failureResponse(error, 'req_5').body);
      expect(parsed.success, `${String(error)} produced an invalid envelope`).toBe(true);
    }
  });
});
