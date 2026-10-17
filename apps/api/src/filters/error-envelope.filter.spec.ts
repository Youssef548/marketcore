import {
  ConflictException,
  NotFoundException,
  type ArgumentsHost,
  type LoggerService,
} from '@nestjs/common';
import { ErrorCodes } from '@app/contracts';
import { ErrorEnvelopeFilter } from './error-envelope.filter';

const silent: LoggerService = { log: () => undefined, error: () => undefined, warn: () => undefined };

function capture(requestId = 'req_test') {
  const sent: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return response;
    },
    json(body: unknown) {
      sent.body = body;
      return response;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ requestId }) }),
  } as unknown as ArgumentsHost;
  return { host, sent };
}

describe('ErrorEnvelopeFilter', () => {
  it('forwards typed details from an HttpException built with them (SRS §8)', () => {
    const { host, sent } = capture();
    const details = {
      lines: [{ productId: 'p1', reason: 'SOLD_OUT', available: 0, currentUnitPriceMinor: 100 }],
    };

    new ErrorEnvelopeFilter(silent).catch(
      new ConflictException({ message: 'Some lines cannot be ordered', details }),
      host,
    );

    expect(sent.status).toBe(409);
    expect(sent.body).toEqual({
      error: {
        code: ErrorCodes.CONFLICT,
        message: 'Some lines cannot be ordered',
        requestId: 'req_test',
        details,
      },
    });
  });

  it('leaves details out when an exception carries none', () => {
    const { host, sent } = capture();
    new ErrorEnvelopeFilter(silent).catch(new NotFoundException('Product not found'), host);

    expect(JSON.parse(JSON.stringify(sent.body))).toEqual({
      error: { code: ErrorCodes.NOT_FOUND, message: 'Product not found', requestId: 'req_test' },
    });
  });

  it('never leaks an internal error message', () => {
    const { host, sent } = capture();
    new ErrorEnvelopeFilter(silent).catch(new Error('connection string was …'), host);

    expect(sent.status).toBe(500);
    expect(JSON.stringify(sent.body)).not.toContain('connection string');
  });
});
