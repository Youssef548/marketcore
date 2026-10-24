import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthRepository } from './repositories/health.repository';
import { HealthService } from './health.service';

/**
 * Liveness and readiness. Nothing is exported: no other module depends on the
 * health check, and readiness reaches Prisma through its own repository.
 */
@Module({
  controllers: [HealthController],
  providers: [HealthRepository, HealthService],
})
export class HealthModule {}
