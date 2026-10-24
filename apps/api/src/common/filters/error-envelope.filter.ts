import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  type LoggerService,
} from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import type { Request, Response } from 'express';
import { ErrorCodes, type ErrorCode, type ErrorEnvelope } from '@app/contracts';
import { UNKNOWN_REQUEST_ID, createLogger, getRequestId } from '@app/runtime';
import {
  ERROR_CODE_BY_STATUS,
  ERROR_FILTER_LOGGER_CONTEXT,
  ErrorEnvelopeMessages,
} from './error-envelope.constants';

/** A failure classified, before the request id turns it into an envelope. */
interface Failure {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/**
 * What body-parser throws, and anything else built on `http-errors`. `expose`
 * is that library's own verdict that the message is safe to show the caller.
 */
interface ExposedHttpError extends Error {
  status: number;
  expose: true;
}

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
  constructor(
    private readonly logger: LoggerService = createLogger(ERROR_FILTER_LOGGER_CONTEXT),
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const requestId = getRequestId(http.getRequest<Request>()) ?? UNKNOWN_REQUEST_ID;
    const { status, code, message, details } = this.classify(exception);

    if (isServerError(status)) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception), {
        requestId,
      });
    }

    const envelope: ErrorEnvelope = { error: { code, message, requestId, details } };
    http.getResponse<Response>().status(status).json(envelope);
  }

  private classify(exception: unknown): Failure {
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError();
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCodes.VALIDATION_ERROR,
        message: ErrorEnvelopeMessages.VALIDATION_FAILED,
        details: zodError instanceof ZodError ? zodError.issues : undefined,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // A deliberate 5xx keeps its status, but its text may name a host or a
      // query, so it leaves like any other internal failure.
      if (isServerError(status)) {
        return { status, code: ErrorCodes.INTERNAL, message: ErrorEnvelopeMessages.INTERNAL };
      }
      // Nest already reduces the body to one string here: the body itself, or its
      // `message` when that is a string — never the array a list of messages gives.
      return {
        status,
        code: codeFor(status),
        message: exception.message,
        details: detailsOf(exception.getResponse()),
      };
    }

    if (isExposedClientError(exception)) {
      return { status: exception.status, code: codeFor(exception.status), message: exception.message };
    }

    // Never surface an internal message to the caller; it is logged above.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCodes.INTERNAL,
      message: ErrorEnvelopeMessages.INTERNAL,
    };
  }
}

function codeFor(status: number): ErrorCode {
  return (
    ERROR_CODE_BY_STATUS[status] ??
    (isClientError(status) ? ErrorCodes.CLIENT_ERROR : ErrorCodes.INTERNAL)
  );
}

function isClientError(status: number): boolean {
  return status >= HttpStatus.BAD_REQUEST && !isServerError(status);
}

function isServerError(status: number): boolean {
  return status >= HttpStatus.INTERNAL_SERVER_ERROR;
}

/**
 * A typed refusal (checkout's 409) is thrown as `new ConflictException({
 * message, details })`; its details are contract, not decoration.
 */
function detailsOf(body: string | object): unknown {
  return typeof body === 'object' && body !== null && 'details' in body ? body.details : undefined;
}

/** Only a 4xx: a 5xx message stays hidden even when its error says it may be shown. */
function isExposedClientError(exception: unknown): exception is ExposedHttpError {
  return (
    exception instanceof Error &&
    'expose' in exception &&
    exception.expose === true &&
    'status' in exception &&
    typeof exception.status === 'number' &&
    isClientError(exception.status)
  );
}
