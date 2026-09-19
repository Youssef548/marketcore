import { DependencyStates } from '@app/contracts';
import type { PrismaService } from '@app/runtime';
import { HealthRepository } from './health.repository';

/**
 * The client is stubbed here, deliberately and only here: the "database is down"
 * branch cannot be reached by an integration test without stopping PostgreSQL
 * mid-run. The e2e suite proves the real, connected path against a real
 * database; this covers the branch it cannot reach.
 */
const repositoryWith = (findFirst: jest.Mock) =>
  new HealthRepository({ user: { findFirst } } as unknown as PrismaService);

describe('HealthRepository', () => {
  it('round-trips a query through the builder rather than raw SQL', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = repositoryWith(findFirst);

    await expect(repository.databaseState()).resolves.toBe(DependencyStates.UP);
    // A projection, not a full row: the point is that the database answered, and
    // reading one column is enough to prove it.
    expect(findFirst).toHaveBeenCalledWith({ select: { id: true } });
  });

  it('reports the database down rather than throwing when it is unreachable', async () => {
    const repository = repositoryWith(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(repository.databaseState()).resolves.toBe(DependencyStates.DOWN);
  });

  it('reports up when the table is empty, because reachability is the question', async () => {
    // findFirst resolving to null means "no rows", not "no database".
    const repository = repositoryWith(jest.fn().mockResolvedValue(null));

    await expect(repository.databaseState()).resolves.toBe(DependencyStates.UP);
  });
});
