import { Injectable } from '@nestjs/common';
import { DependencyStates, type DependencyState } from '@app/contracts';
import { PrismaService } from '@app/runtime';

/**
 * All Prisma access for health lives here, so the service depends on a
 * repository rather than on the client. Every module in this project follows the
 * same layering: controller → service → repository → Prisma.
 */
@Injectable()
export class HealthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Round-trips a query, which is the only thing that actually proves the
   * database answers: an already-open connection can survive a restart that
   * makes every subsequent query fail, so `$connect()` would report a healthy
   * database that cannot serve a request.
   *
   * This is the one sanctioned raw query in the project. It stays until phase 2
   * adds the first model, at which point the probe becomes a model query and the
   * raw SQL goes away with it.
   */
  async databaseState(): Promise<DependencyState> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return DependencyStates.UP;
    } catch {
      return DependencyStates.DOWN;
    }
  }
}
