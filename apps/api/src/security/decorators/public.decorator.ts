import { SetMetadata } from '@nestjs/common';
import { SecurityMetadata } from '../security.constants';

/**
 * Opts a route out of the whole guard chain.
 *
 * Deny-by-default only works if being outside the boundary is something the code
 * says out loud: `grep '@Public'` is then the complete list of routes that need
 * no token, which is the point of the marker rather than an implied default.
 */
export const Public = () => SetMetadata(SecurityMetadata.PUBLIC, true);
