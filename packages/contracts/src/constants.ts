/**
 * Wire-level literal values, defined once.
 *
 * No value in this repository is written into logic as a literal. Anything that
 * appears in a schema, a header, a log field and a test is one value, and it has
 * one definition here. `ErrorCodes` in ./error.ts follows the same shape — a
 * const object with its type derived from it — and is the precedent this file
 * extends rather than replaces.
 */

/** Header carrying the correlation id. Shared by the API, the worker and any client. */
export const REQUEST_ID_HEADER = 'x-request-id';

export const HealthStatuses = { OK: 'ok' } as const;
export type HealthStatus = (typeof HealthStatuses)[keyof typeof HealthStatuses];

export const ReadinessStatuses = { OK: 'ok', DEGRADED: 'degraded' } as const;
export type ReadinessStatus = (typeof ReadinessStatuses)[keyof typeof ReadinessStatuses];

export const DependencyStates = { UP: 'up', DOWN: 'down' } as const;
export type DependencyState = (typeof DependencyStates)[keyof typeof DependencyStates];

/**
 * The readiness verdict as an HTTP status, so no caller hand-writes the mapping
 * and none can disagree with another about what "degraded" answers.
 */
export const READINESS_HTTP_STATUS: Record<ReadinessStatus, number> = {
  [ReadinessStatuses.OK]: 200,
  [ReadinessStatuses.DEGRADED]: 503,
};

/**
 * Turns a const object of wire values into the non-empty tuple `z.enum` needs.
 * Shared because otherwise every enum in this package repeats the same cast.
 */
export function wireValues<T extends Record<string, string>>(
  source: T,
): [T[keyof T], ...T[keyof T][]] {
  return Object.values(source) as [T[keyof T], ...T[keyof T][]];
}
