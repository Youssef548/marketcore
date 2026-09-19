import { z } from 'zod';
import {
  DependencyStates,
  HealthStatuses,
  READINESS_HTTP_STATUS,
  ReadinessStatuses,
  wireValues,
} from './constants';

/**
 * These schemas deliberately carry **no** `.meta({ id })`, unlike the rest of
 * this package.
 *
 * `createZodDto` gives nestjs-zod its own handle on the schema, and `.meta()`
 * registers one globally. A schema that is both — a contract *and* a DTO source,
 * which is the normal case for a response — is therefore registered twice under
 * the same id, and `cleanupOpenApiDoc` throws:
 *
 *   Found multiple schemas with name `Health`
 *
 * rather than picking one. Leaving the id off lets the DTO class name the
 * component instead. `ErrorEnvelopeSchema` keeps its id because nothing builds a
 * DTO from it, so it has no second registration.
 */

/**
 * Liveness. Deliberately says nothing about dependencies, so a container or load
 * balancer can distinguish "the process is running" from "the process can serve
 * its workload" — the two need different responses.
 */
export const HealthSchema = z.object({ status: z.literal(HealthStatuses.OK) });
export type Health = z.infer<typeof HealthSchema>;

/** Every dependency the readiness endpoint reports on, keyed by name. */
export const ReadinessChecksSchema = z.object({
  database: z.enum(wireValues(DependencyStates)),
});
export type ReadinessChecks = z.infer<typeof ReadinessChecksSchema>;

/**
 * Readiness. A degraded process still answers, because a probe that cannot
 * describe its own failure is not useful for diagnosing one.
 */
export const ReadinessSchema = z
  .object({
    status: z.enum(wireValues(ReadinessStatuses)),
    checks: ReadinessChecksSchema,
  })
  .refine(
    // The two fields are not independent, and a payload that claims "ok" while
    // admitting a dead dependency would let a probe pass while the process
    // cannot serve. buildReadiness() below makes this unrepresentable when we
    // construct one; this keeps the wire contract honest for anything that
    // parses one.
    (readiness) => (readiness.status === ReadinessStatuses.OK) === allUp(readiness.checks),
    { message: 'status must be ok exactly when every check is up', path: ['status'] },
  );
export type Readiness = z.infer<typeof ReadinessSchema>;

function allUp(checks: ReadinessChecks): boolean {
  return Object.values(checks).every((state) => state === DependencyStates.UP);
}

/**
 * The only sanctioned way to construct a readiness payload. `status` is derived
 * from the checks rather than passed in, so the two can never disagree — which
 * is a stronger guarantee than validating the disagreement away afterwards.
 */
export function buildReadiness(checks: ReadinessChecks): Readiness {
  return {
    status: allUp(checks) ? ReadinessStatuses.OK : ReadinessStatuses.DEGRADED,
    checks,
  };
}

/** The HTTP status a readiness verdict answers with. Keeps callers from branching by hand. */
export function httpStatusForReadiness(readiness: Readiness): number {
  return READINESS_HTTP_STATUS[readiness.status];
}
