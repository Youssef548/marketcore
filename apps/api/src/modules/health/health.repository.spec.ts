import { DependencyStates } from '@app/contracts';
import type { PrismaService } from '@app/runtime';
import { HealthRepository } from './health.repository';

/**
 * The client is stubbed here, deliberately and only here: the "database is down"
 * branch cannot be reached by an integration test without stopping PostgreSQL
 * mid-run. The e2e suite proves the real, connected path against a real
 * database; this covers the branch it cannot reach.
 */
const repositoryWith = (queryRaw: jest.Mock) =>
  new HealthRepository({ $queryRaw: queryRaw } as unknown as PrismaService);

describe('HealthRepository', () => {
  it('reports the database up when the probe succeeds', async () => {
    const repository = repositoryWith(jest.fn().mockResolvedValue([{ '?column?': 1 }]));

    await expect(repository.databaseState()).resolves.toBe(DependencyStates.UP);
  });

  it('reports the database down rather than throwing when it is unreachable', async () => {
    const repository = repositoryWith(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(repository.databaseState()).resolves.toBe(DependencyStates.DOWN);
  });
});
