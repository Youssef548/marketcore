import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AccessTokenGuard } from './guards/access-token.guard';
import { OrganizationGuard } from './guards/organization.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * The whole authorization surface, in one place, denying by default.
 *
 * Order is load-bearing and is the order below: the access token establishes who
 * is calling, the organization guard establishes which tenant they may act in,
 * and the roles guard authorizes within it. Nest applies APP_GUARD providers in
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
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class SecurityModule {}
