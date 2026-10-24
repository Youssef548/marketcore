import { Module } from '@nestjs/common';
import { PrismaModule } from '@app/runtime';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { CatalogModule } from './catalog/catalog.module';
import { HealthModule } from './health/health.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { SecurityModule } from './security/security.module';
import { StorefrontModule } from './storefront/storefront.module';

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
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    CatalogModule,
    StorefrontModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    SecurityModule,
  ],
})
export class AppModule {}
