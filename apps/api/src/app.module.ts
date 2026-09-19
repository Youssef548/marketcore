import { Module } from '@nestjs/common';
import { PrismaModule } from '@app/runtime';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { HealthController } from './modules/health/health.controller';
import { HealthRepository } from './modules/health/health.repository';
import { HealthService } from './modules/health/health.service';
import { OrganizationsModule } from './organizations/organizations.module';
import { SecurityModule } from './security/security.module';

/**
 * The composition root. It stays thin on purpose: it wires infrastructure and
 * lists modules, nothing more.
 *
 * Add your feature modules to `imports` — one module per resource, each owning
 * its own controllers, services and DTOs. Cross-module access goes through the
 * owning module's exported service, never through its Prisma models directly.
 */
@Module({
  // SecurityModule last: it registers the global guards, and their providers come
  // from the modules above it.
  imports: [PrismaModule, AuthModule, OrganizationsModule, CatalogModule, SecurityModule],
  controllers: [HealthController],
  // Repositories before services: the service depends on the repository, never
  // on the Prisma client directly.
  providers: [HealthRepository, HealthService],
})
export class AppModule {}
