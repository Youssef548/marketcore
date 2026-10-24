import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  type ArgumentsHost,
  type LoggerService,
} from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';
import { ErrorCodes, ErrorEnvelopeSchema } from '@app/contracts';
import { ErrorEnvelopeFilter } from './error-envelope.filter';

const REQUEST_ID = 'req_test';

interface Sent {
  status?: number;
  body?: unknown;
}

interface SpyLogger extends LoggerService {
  error: jest.Mock;
}

function silentLogger(): SpyLogger {
  return { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
}

function capture() {
  const sent: Sent = {};
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
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ requestId: REQUEST_ID }),
    }),
  } as unknown as ArgumentsHost;
  return { host, sent };
}

function run(exception: unknown) {
  const { host, sent } = capture();
  const logger = silentLogger();
  new ErrorEnvelopeFilter(logger).catch(exception, host);
  return { sent, logger };
}

/** What body-parser throws: an `http-errors` error, not an HttpException. */
function bodyParserError(status: number, message: string, expose: boolean): Error {
  return Object.assign(new Error(message), { status, statusCode: status, expose });
}

describe('ErrorEnvelopeFilter', () => {
  it('forwards typed details from an HttpException built with them (SRS §8)', () => {
    const details = {
      lines: [{ productId: 'p1', reason: 'SOLD_OUT', available: 0, currentUnitPriceMinor: 100 }],
    };

    const { sent } = run(new ConflictException({ message: 'Some lines cannot be ordered', details }));

    expect(sent.status).toBe(HttpStatus.CONFLICT);
    expect(sent.body).toEqual({
      error: {
        code: ErrorCodes.CONFLICT,
        message: 'Some lines cannot be ordered',
        requestId: REQUEST_ID,
        details,
      },
    });
  });

  it('leaves details out when an exception carries none', () => {
    const { sent } = run(new NotFoundException('Product not found'));

    expect(JSON.parse(JSON.stringify(sent.body))).toEqual({
      error: { code: ErrorCodes.NOT_FOUND, message: 'Product not found', requestId: REQUEST_ID },
    });
  });

  it('never leaks an internal error message', () => {
    const { sent } = run(new Error('connection string was …'));

    expect(sent.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(JSON.stringify(sent.body)).not.toContain('connection string');
  });

  it('answers a zod rejection with VALIDATION_ERROR and the issues as details', () => {
    const parsed = z.object({ name: z.string() }).safeParse({});
    if (parsed.success) throw new Error('the probe schema must reject an empty object');

    const { sent } = run(new ZodValidationException(parsed.error));

    expect(sent.status).toBe(HttpStatus.BAD_REQUEST);
    expect(sent.body).toMatchObject({
      error: { code: ErrorCodes.VALIDATION_ERROR, details: parsed.error.issues },
    });
  });

  it('gives a 4xx without a code of its own CLIENT_ERROR, never INTERNAL', () => {
    const { sent } = run(new PayloadTooLargeException());

    expect(sent.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(sent.body).toMatchObject({ error: { code: ErrorCodes.CLIENT_ERROR } });
  });

  it('keeps the message a string when an HttpException carries a list of them', () => {
    const { sent } = run(new BadRequestException(['name is required', 'price is required']));

    expect(() => ErrorEnvelopeSchema.parse(sent.body)).not.toThrow();
    // Nest's own fallback when the body's message is not a string.
    expect(sent.body).toMatchObject({ error: { message: 'Bad Request Exception' } });
  });

  it('hides the message and details of an HttpException thrown with a 5xx', () => {
    const { sent } = run(
      new ServiceUnavailableException({ message: 'db host 10.0.0.5 down', details: { host: '10.0.0.5' } }),
    );

    expect(sent.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(sent.body).toEqual({
      error: { code: ErrorCodes.INTERNAL, message: 'Internal server error', requestId: REQUEST_ID },
    });
  });

  it('survives an HttpException whose body is null', () => {
    const { sent } = run(new HttpException(null as unknown as string, HttpStatus.BAD_REQUEST));

    expect(sent.status).toBe(HttpStatus.BAD_REQUEST);
    expect(() => ErrorEnvelopeSchema.parse(sent.body)).not.toThrow();
  });

  it("answers a body-parser rejection with its own status and message, unlogged", () => {
    const { sent, logger } = run(
      bodyParserError(HttpStatus.PAYLOAD_TOO_LARGE, 'request entity too large', true),
    );

    expect(sent.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(sent.body).toEqual({
      error: {
        code: ErrorCodes.CLIENT_ERROR,
        message: 'request entity too large',
        requestId: REQUEST_ID,
      },
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('treats a status-carrying error that is not marked exposable as internal', () => {
    const { sent } = run(bodyParserError(HttpStatus.BAD_REQUEST, 'secret detail', false));

    expect(sent.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(JSON.stringify(sent.body)).not.toContain('secret detail');
  });

  it('never exposes a 5xx message even when the error says it may', () => {
    const { sent } = run(bodyParserError(HttpStatus.BAD_GATEWAY, 'upstream secret', true));

    expect(sent.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(JSON.stringify(sent.body)).not.toContain('upstream secret');
  });

  it('logs a server failure with its request id, and not a client one', () => {
    const server = run(new ServiceUnavailableException());
    const client = run(new NotFoundException());

    expect(server.logger.error).toHaveBeenCalledWith(expect.any(String), { requestId: REQUEST_ID });
    expect(client.logger.error).not.toHaveBeenCalled();
  });
});
