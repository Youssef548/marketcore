import { ApiError } from '@app/api-client';
import { ErrorCodes, type ErrorEnvelope } from '@app/contracts';

export interface FailureResponse {
  status: number;
  body: ErrorEnvelope;
}

/**
 * The API's error shape, produced by the web layer.
 *
 * The web app is a second server the browser talks to, and this repository's third
 * invariant is that every failure has one shape. Inventing a second one would break
 * that; mapping the API's codes onto a new set would create a translation to keep in
 * step. So an `ApiError` is passed through with its `code` intact — a form branches
 * on exactly the codes the API emits — and only the request id is replaced, with the
 * one this side actually sent.
 */
export function failureResponse(error: unknown, requestId: string): FailureResponse {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          requestId,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      },
    };
  }

  // Not an ApiError means the API never refused this: the failure is in this layer.
  // It is reported as INTERNAL with nothing attached, because the alternative is
  // handing a browser a stack trace.
  return {
    status: 500,
    body: {
      error: {
        code: ErrorCodes.INTERNAL,
        message: 'Unexpected error',
        requestId,
      },
    },
  };
}
