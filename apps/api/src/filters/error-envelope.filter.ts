import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  type LoggerService,
} from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import type { Request, Response } from 'express';
import { ErrorCodes, type ErrorCode } from '@app/contracts';
import { UNKNOWN_REQUEST_ID, createLogger, getRequestId } from '@app/runtime';

/**
 * The only way a failure leaves the API. Clients get a stable machine-readable
 * `code` plus a human `message`, and branch on the former.
 *
 * @Catch() with no argument catches everything, including non-HttpException
 * throws, so an unexpected bug still produces the envelope instead of Nest's
 * default body.
 *
 * The logger is injected rather than taken from `@nestjs/common`'s `Logger`
 * because that class types its second argument as a stack string, which would
 * force the request id into the message text instead of a structured field.
 */
@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService = createLogger('filter')) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const requestId = getRequestId(http.getRequest<Request>()) ?? UNKNOWN_REQUEST_ID;
    const { status, code, message, details } = this.map(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception), {
        requestId,
      });
    }

    response.status(status).json({ error: { code, message, requestId, details } });
  }

  private map(exception: unknown): {
    status: number;
    code: ErrorCode;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof ZodValidationException) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: (exception.getZodError() as { issues?: unknown }).issues,
      };
    }

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string }).message ?? exception.message);
      return { status: exception.getStatus(), code: this.codeFor(exception), message };
    }

    // Never surface an internal message to the caller; it is logged above.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCodes.INTERNAL,
      message: 'Internal server error',
    };
  }

  private codeFor(exception: HttpException): ErrorCode {
    switch (exception.getStatus()) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCodes.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCodes.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCodes.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCodes.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCodes.CONFLICT;
      default:
        return ErrorCodes.INTERNAL;
    }
  }
}
