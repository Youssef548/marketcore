import { describe, expect, it } from 'vitest';
import { HealthSchema, ReadinessSchema } from '../src/index';

describe('health contracts', () => {
  it('accepts a liveness payload and rejects an unknown status', () => {
    expect(HealthSchema.safeParse({ status: 'ok' }).success).toBe(true);
    expect(HealthSchema.safeParse({ status: 'nope' }).success).toBe(false);
  });

  it('accepts both readiness outcomes and rejects an unknown database state', () => {
    expect(
      ReadinessSchema.safeParse({ status: 'ok', checks: { database: 'up' } }).success,
    ).toBe(true);
    expect(
      ReadinessSchema.safeParse({ status: 'degraded', checks: { database: 'down' } }).success,
    ).toBe(true);
    expect(
      ReadinessSchema.safeParse({ status: 'ok', checks: { database: 'maybe' } }).success,
    ).toBe(false);
  });

  it('rejects a readiness payload that claims ok while reporting the database down', () => {
    // The two fields are not independent: a "ok" that admits the database is
    // down would let a probe pass while the process cannot serve its workload.
    expect(
      ReadinessSchema.safeParse({ status: 'ok', checks: { database: 'down' } }).success,
    ).toBe(false);
  });
});
