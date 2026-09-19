import { SetMetadata } from '@nestjs/common';
import { SecurityMetadata } from '../security.constants';

/** Requires the caller's membership role to be owner. Enforced by RolesGuard. */
export const OwnerOnly = () => SetMetadata(SecurityMetadata.OWNER_ONLY, true);
