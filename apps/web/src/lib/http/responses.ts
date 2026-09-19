import { ApiError } from '@app/api-client';
import { ErrorCodes } from '@app/contracts';
import { failureResponse, type FailureResponse } from './envelope';

/**
 * The responses this layer produces, so a route handler reads as the decision it
 * makes rather than as the plumbing that expresses it.
 *
 * Every failure goes through `failureResponse`, which means every refusal a browser
 * receives has the API's envelope shape and the API's code — whether the API
 * produced it or this layer did. Two servers, one error contract.
 */
export function respondTo(failure: FailureResponse): Response {
  return Response.json(failure.body, { status: failure.status });
}

export function failure(error: unknown, requestId: string): Response {
  return respondTo(failureResponse(error, requestId));
}

/** There is no session to serve. A refusal rather than a 404: the caller is the resource. */
export function noSession(requestId: string): Response {
  return failure(new ApiError(401, ErrorCodes.UNAUTHORIZED, 'No session'), requestId);
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}
