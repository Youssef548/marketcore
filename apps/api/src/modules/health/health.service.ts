import { Injectable } from '@nestjs/common';
import { buildReadiness, type Readiness } from '@app/contracts';
import { HealthRepository } from './health.repository';

@Injectable()
export class HealthService {
  constructor(private readonly healthRepository: HealthRepository) {}

  /**
   * Returns a body rather than throwing. A probe that cannot describe its own
   * failure is not useful for diagnosing one, and an exception here would be
   * replaced by the error envelope, discarding which check failed.
   *
   * The payload is built, not assembled by hand: `buildReadiness` derives
   * `status` from the checks, so a payload that claims "ok" while admitting a
   * dead dependency cannot be constructed at all.
   */
  async checkReadiness(): Promise<Readiness> {
    return buildReadiness({ database: await this.healthRepository.databaseState() });
  }
}
