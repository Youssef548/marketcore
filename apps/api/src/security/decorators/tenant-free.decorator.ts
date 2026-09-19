import { SetMetadata } from '@nestjs/common';
import { SecurityMetadata } from '../security.constants';

/**
 * Authenticated, but not acting within a tenant — organization creation and
 * listing, where naming an organization would be circular.
 */
export const TenantFree = () => SetMetadata(SecurityMetadata.TENANT_FREE, true);
