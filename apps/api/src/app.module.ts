import { Module } from '@nestjs/common';
import { PrismaModule } from '@app/runtime';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './modules/health/health.controller';
import { HealthRepository } from './modules/health/health.repository';
import { HealthService } from './modules/health/health.service';

/**
 * The composition root. It stays thin on purpose: it wires infrastructure and
 * lists modules, nothing more.
 *
 * Add your feature modules to `imports` — one module per resource, each owning
 * its own controllers, services and DTOs. Cross-module access goes through the
 * owning module's exported service, never through its Prisma models directly.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [HealthController],
  // Repositories before services: the service depends on the repository, never
  // on the Prisma client directly.
  providers: [HealthRepository, HealthService],
})
export class AppModule {}
