import type { RoutingDecisionKinds } from '../constants';

/**
 * The three answers the gate can give.
 *
 * A tagged union rather than a const-object enum: the arms carry different data, so
 * they are shapes rather than members of one set. The tags are the constants beside
 * it, and the union is built from them, so a decision's kind cannot drift from the
 * kind the middleware narrows on.
 */
export type RoutingDecision =
  | { kind: typeof RoutingDecisionKinds.NEXT }
  | { kind: typeof RoutingDecisionKinds.REDIRECT; to: string }
  /** This URL moved for good: a client should replace what it holds (D92). */
  | { kind: typeof RoutingDecisionKinds.MOVED; to: string };
