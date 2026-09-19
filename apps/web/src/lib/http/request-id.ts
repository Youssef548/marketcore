import { randomUUID } from 'node:crypto';

/**
 * An id for one server-side operation, sent to the API with every call it makes.
 *
 * Generated here rather than forwarded from the browser: a browser does not send
 * one, and the API validates whatever arrives against its own rules anyway, so
 * accepting an inbound value would only add a second, weaker copy of that check to
 * keep in step.
 *
 * The value is the point of the exercise. It travels with the request into the API,
 * appears in the API's structured request log, and is returned to the browser in
 * the error envelope — so a failure a user can see is one the API's log can be
 * searched for by id. That is the same join the API already offers its callers,
 * carried across a second hop.
 */
export function newRequestId(): string {
  return `req_${randomUUID()}`;
}
