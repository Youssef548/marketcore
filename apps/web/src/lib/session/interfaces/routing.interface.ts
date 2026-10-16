export type RoutingDecision = { kind: 'next' } | { kind: 'redirect'; to: string };
