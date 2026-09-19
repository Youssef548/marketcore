import { Module } from '@nestjs/common';
import { OrganizationRepository } from './organization.repository';
import { MembershipRepository } from './membership.repository';
import { OrganizationService } from './organization.service';

/**
 * No controller yet — Task 12 adds it. The repositories are exported because the
 * security module's OrganizationGuard resolves a request's tenant through them.
 */
@Module({
  providers: [OrganizationRepository, MembershipRepository, OrganizationService],
  exports: [OrganizationRepository, MembershipRepository, OrganizationService],
})
export class OrganizationsModule {}
