import { describe, expect, it } from 'vitest';
import {
  DependencyStates,
  HealthSchema,
  HealthStatuses,
  ReadinessSchema,
  ReadinessStatuses,
  buildReadiness,
  httpStatusForReadiness,
} from '../src/index';

describe('health contracts', () => {
  it('accepts a liveness payload and rejects an unknown status', () => {
    expect(HealthSchema.safeParse({ status: HealthStatuses.OK }).success).toBe(true);
    expect(HealthSchema.safeParse({ status: 'unrecognised' }).success).toBe(false);
  });

  it('accepts both readiness outcomes and rejects an unknown dependency state', () => {
    expect(
      ReadinessSchema.safeParse({
        status: ReadinessStatuses.OK,
        checks: { database: DependencyStates.UP },
      }).success,
    ).toBe(true);
    expect(
      ReadinessSchema.safeParse({
        status: ReadinessStatuses.DEGRADED,
        checks: { database: DependencyStates.DOWN },
      }).success,
    ).toBe(true);
    expect(
      ReadinessSchema.safeParse({
        status: ReadinessStatuses.OK,
        checks: { database: 'unrecognised' },
      }).success,
    ).toBe(false);
  });

  it('rejects a readiness payload that claims ok while reporting the database down', () => {
    // The two fields are not independent: an "ok" that admits the database is
    // down would let a probe pass while the process cannot serve its workload.
    expect(
      ReadinessSchema.safeParse({
        status: ReadinessStatuses.OK,
        checks: { database: DependencyStates.DOWN },
      }).success,
    ).toBe(false);
  });

  it('builds a payload whose status is derived, so the invalid pair is unrepresentable', () => {
    expect(buildReadiness({ database: DependencyStates.UP })).toEqual({
      status: ReadinessStatuses.OK,
      checks: { database: DependencyStates.UP },
    });
    expect(buildReadiness({ database: DependencyStates.DOWN })).toEqual({
      status: ReadinessStatuses.DEGRADED,
      checks: { database: DependencyStates.DOWN },
    });
    // Whatever the builder produces must satisfy the wire contract, including
    // its cross-field rule — that is what makes the derivation safe.
    for (const state of Object.values(DependencyStates)) {
      const built = buildReadiness({ database: state });
      expect(ReadinessSchema.safeParse(built).success).toBe(true);
    }
  });

  it('maps a readiness verdict to its HTTP status in one place', () => {
    expect(httpStatusForReadiness(buildReadiness({ database: DependencyStates.UP }))).toBe(200);
    expect(httpStatusForReadiness(buildReadiness({ database: DependencyStates.DOWN }))).toBe(503);
  });
});
