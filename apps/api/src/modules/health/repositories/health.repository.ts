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
   * Reads a single column through the query builder.
   *
   * Reachability is the question, so an empty table answering is a healthy
   * result: `null` means no rows, not no database.
   *
   * It has to be a real round-trip, and that is measured rather than assumed.
   * `$connect()` resolved every second for 18 seconds after Postgres was
   * stopped, so it reports `up` against a dead database; a builder query failed
   * within one second and recovered on its own. An earlier version used
   * `$queryRaw` for the same reason — it needed no model. Now that one exists,
   * the query goes through the builder like every other query in the project.
   */
  async databaseState(): Promise<DependencyState> {
    try {
      await this.prisma.user.findFirst({ select: { id: true } });
      return DependencyStates.UP;
    } catch {
      return DependencyStates.DOWN;
    }
  }
}
