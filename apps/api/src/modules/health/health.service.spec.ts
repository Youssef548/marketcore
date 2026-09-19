import { DependencyStates, ReadinessStatuses } from '@app/contracts';
import type { HealthRepository } from './health.repository';
import { HealthService } from './health.service';

const serviceWith = (databaseState: jest.Mock) =>
  new HealthService({ databaseState } as unknown as HealthRepository);

/**
 * These tests exist to guard the layering, not to re-test the builder. If Prisma
 * reappears in this service — the mistake they were written after — the first
 * test fails, because there would be no repository to call.
 */
describe('HealthService', () => {
  it('asks the repository for the dependency state instead of touching Prisma', async () => {
    const databaseState = jest.fn().mockResolvedValue(DependencyStates.UP);

    await serviceWith(databaseState).checkReadiness();

    expect(databaseState).toHaveBeenCalledTimes(1);
  });

  it('derives the verdict from the checks it was given', async () => {
    const up = await serviceWith(jest.fn().mockResolvedValue(DependencyStates.UP)).checkReadiness();
    const down = await serviceWith(
      jest.fn().mockResolvedValue(DependencyStates.DOWN),
    ).checkReadiness();

    expect(up.status).toBe(ReadinessStatuses.OK);
    expect(down.status).toBe(ReadinessStatuses.DEGRADED);
  });
});
