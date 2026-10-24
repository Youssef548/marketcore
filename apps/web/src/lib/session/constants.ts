/**
 * The tag values of the session module's tagged unions, named once (BL-004).
 *
 * The unions stay tagged unions — their arms carry different data, so they are shapes
 * rather than members of one set — but each is *built from* these constants, and every
 * comparison and construction passes the member rather than the string. The types are
 * derived from the values, the same shape as `@app/contracts` keeps for `ProductStatuses`.
 */

/** The states of reading `/api/session`, narrowed by the shells and the provider. */
export const SessionStatuses = {
  LOADING: 'loading',
  /** A refusal: there is no session. Distinct from a failure to ask. */
  ANONYMOUS: 'anonymous',
  /** The server could not be reached, or answered something unusable. */
  FAILED: 'failed',
  READY: 'ready',
} as const;
export type SessionStatus = (typeof SessionStatuses)[keyof typeof SessionStatuses];

/** The answers the route gate can give, turned into responses by the middleware. */
export const RoutingDecisionKinds = {
  NEXT: 'next',
  REDIRECT: 'redirect',
  MOVED: 'moved',
} as const;
export type RoutingDecisionKind = (typeof RoutingDecisionKinds)[keyof typeof RoutingDecisionKinds];

/**
 * The API's word for "there is no session": the one status that is a refusal rather than a
 * failure, read by the session provider and by sign-out.
 */
export const UNAUTHORIZED_STATUS = 401;
