import { z } from 'zod';

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
export const HealthSchema = z.object({ status: z.literal('ok') });
export type Health = z.infer<typeof HealthSchema>;

/**
 * Readiness. A degraded process still answers, because a probe that cannot
 * describe its own failure is not useful for diagnosing one.
 */
export const ReadinessSchema = z
  .object({
    status: z.enum(['ok', 'degraded']),
    checks: z.object({ database: z.enum(['up', 'down']) }),
  })
  .refine(
    // The two fields are not independent. An "ok" that admits the database is
    // down would let a probe pass while the process cannot serve its workload,
    // which is the one thing a readiness check exists to prevent.
    (readiness) => (readiness.status === 'ok') === (readiness.checks.database === 'up'),
    { message: 'status must be ok exactly when every check is up', path: ['status'] },
  );
export type Readiness = z.infer<typeof ReadinessSchema>;
