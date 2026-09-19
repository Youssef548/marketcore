import { Injectable } from '@nestjs/common';
import type { Readiness } from '@app/contracts';
import { PrismaService } from '@app/runtime';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns a body rather than throwing. A probe that cannot describe its own
   * failure is not useful for diagnosing one, and an exception here would be
   * replaced by the error envelope, discarding which check failed.
   */
  async checkReadiness(): Promise<Readiness> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', checks: { database: 'up' } };
    } catch {
      return { status: 'degraded', checks: { database: 'down' } };
    }
  }
}
