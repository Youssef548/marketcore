import type { PrismaService } from '@app/runtime';
import { HealthService } from './health.service';

/**
 * The probe is stubbed here, deliberately and only here: the "database is down"
 * branch cannot be reached by an integration test without stopping PostgreSQL
 * mid-run. The e2e suite proves the real, connected path against a real
 * database; this covers the branch it cannot reach.
 */
const serviceWith = (queryRaw: jest.Mock) =>
  new HealthService({ $queryRaw: queryRaw } as unknown as PrismaService);

describe('HealthService', () => {
  it('reports the database up when the probe succeeds', async () => {
    const service = serviceWith(jest.fn().mockResolvedValue([{ '?column?': 1 }]));

    await expect(service.checkReadiness()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('reports degraded rather than throwing when the database is unreachable', async () => {
    const service = serviceWith(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(service.checkReadiness()).resolves.toEqual({
      status: 'degraded',
      checks: { database: 'down' },
    });
  });
});
