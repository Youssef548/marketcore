import { ORGANIZATION_ID_HEADER } from '@app/contracts';

/** Metadata keys the guards read. Named so no guard writes a string literal. */
export const SecurityMetadata = {
  PUBLIC: 'security:public',
  TENANT_FREE: 'security:tenant-free',
  OWNER_ONLY: 'security:owner-only',
} as const;

export const SecurityMessages = {
  MISSING_TENANT: `Missing or malformed ${ORGANIZATION_ID_HEADER} header`,
  NOT_A_MEMBER: 'Not a member of that organization',
  ORGANIZATION_INACTIVE: 'That organization is not active',
  OWNER_ONLY: 'This action requires the owner role',
  MISSING_TOKEN: 'Missing or invalid access token',
} as const;
