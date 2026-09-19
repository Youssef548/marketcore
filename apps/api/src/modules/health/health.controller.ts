import { Controller, Get, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  HealthStatuses,
  httpStatusForReadiness,
  type Health,
  type Readiness,
} from '@app/contracts';
import { Public } from '../../security/decorators/public.decorator';
import { HealthDto, ReadinessDto } from './health.dto';
import { HealthService } from './health.service';

/**
 * Public, and this marker is not optional. A global AccessTokenGuard closes every
 * route by default, including this one — and a liveness probe that requires a
 * token is a probe a load balancer cannot use. The failure this prevents is a
 * health suite that fails the moment the guard lands, which is the guard proving
 * it is installed rather than a reason to weaken it.
 */
@Public()
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
