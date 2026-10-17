/**
 * The three answers the gate can give.
 *
 * A tagged union rather than a const-object enum: the arms carry different data, so
 * they are shapes rather than members of one set.
 */
export type RoutingDecision =
  | { kind: 'next' }
  | { kind: 'redirect'; to: string }
  /** This URL moved for good: a client should replace what it holds (D92). */
  | { kind: 'moved'; to: string };
