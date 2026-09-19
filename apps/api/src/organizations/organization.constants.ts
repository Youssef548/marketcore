/**
 * Prisma's code for a unique constraint violation.
 *
 * Detected structurally rather than by importing Prisma's error class: the
 * generated client is a devDependency of this app (the integration tests import it
 * directly), so a runtime import here would be an extraneous dependency. The code
 * itself is the stable part of the contract.
 */
export const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/** Human-facing messages, one per failure. Clients branch on `code`, never on these. */
export const OrganizationMessages = {
  SLUG_TAKEN: 'That slug is already taken',
  NOT_A_MEMBER: 'Not a member',
  LAST_OWNER: 'An organization must retain at least one owner',
  NO_SUCH_USER: 'No user with that email',
  ALREADY_A_MEMBER: 'Already a member',
} as const;
