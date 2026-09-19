import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationRepository } from './organization.repository';
import { MembershipRepository } from './membership.repository';
import { OrganizationService } from './organization.service';

/**
 * The repositories are exported because the security module's OrganizationGuard
 * resolves a request's tenant through them.
 */
@Module({
  controllers: [OrganizationController],
  providers: [OrganizationRepository, MembershipRepository, OrganizationService],
  exports: [OrganizationRepository, MembershipRepository, OrganizationService],
})
export class OrganizationsModule {}
