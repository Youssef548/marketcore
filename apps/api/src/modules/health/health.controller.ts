import { Controller, Get, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  HealthStatuses,
  httpStatusForReadiness,
  type Health,
  type Readiness,
} from '@app/contracts';
import { HealthDto, ReadinessDto } from './health.dto';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness only — deliberately does not touch the database, so it stays useful
   * as a container/load-balancer check even when Postgres is down. Readiness,
   * which does touch it, is a separate endpoint for exactly that reason.
   */
  @Get()
  @ApiOkResponse({ type: HealthDto })
  check(): Health {
    return { status: HealthStatuses.OK };
  }

  /**
   * Readiness. The status comes from the contract's mapping rather than a
   * conditional here, so every endpoint that reports a verdict — this one and
   * the worker's later — answers the same way for the same reason.
   *
   * Setting 200 explicitly rather than leaving it implicit is what removes the
   * branch: there is one code path, and the mapping decides.
   */
  @Get('ready')
  @ApiOkResponse({ type: ReadinessDto })
  @ApiServiceUnavailableResponse({ type: ReadinessDto })
  async ready(@Res({ passthrough: true }) res: Response): Promise<Readiness> {
    const readiness = await this.healthService.checkReadiness();
    res.status(httpStatusForReadiness(readiness));
    return readiness;
  }
}
