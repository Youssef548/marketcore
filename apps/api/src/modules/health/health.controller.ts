import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Health, Readiness } from '@app/contracts';
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
    return { status: 'ok' };
  }

  /**
   * Readiness. Answers 503 when degraded so a load balancer stops routing to a
   * process that cannot serve, while still returning the body — a degraded
   * result is a successful evaluation of the probe, not a failed request, so it
   * never becomes the error envelope.
   */
  @Get('ready')
  @ApiOkResponse({ type: ReadinessDto })
  @ApiServiceUnavailableResponse({ type: ReadinessDto })
  async ready(@Res({ passthrough: true }) res: Response): Promise<Readiness> {
    const readiness = await this.healthService.checkReadiness();
    if (readiness.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return readiness;
  }
}
