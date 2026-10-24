// A tagged union: its literals are discriminants rather than options, so it is allowed here.
export type Outcome = { kind: 'ok' } | { kind: 'failed'; reason: string };
