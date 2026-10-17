import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AccessTokenGuard } from './guards/access-token.guard';
import { BuyerGuard } from './guards/buyer.guard';
import { OrganizationGuard } from './guards/organization.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * The whole authorization surface, in one place, denying by default.
 *
 * Order is load-bearing and is the order below: the access token establishes who
 * is calling, the organization guard establishes which tenant they may act in,
 * the buyer guard which buyer a tenant-free route acts for, and the roles guard
 * authorizes within a tenant. Nest applies APP_GUARD providers in
 * the order they are declared, so the tenant exists by the time RolesGuard runs.
 *
 * Every route is therefore guarded unless it opts out with `@Public()`,
 * `@TenantFree()` or `@OwnerOnly()`, and those markers are greppable — which is
 * the audit.
 */
@Global()
@Module({
  imports: [AuthModule, OrganizationsModule],
  providers: [
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: OrganizationGuard },
    { provide: APP_GUARD, useClass: BuyerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class SecurityModule {}
