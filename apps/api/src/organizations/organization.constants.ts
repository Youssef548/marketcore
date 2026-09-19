/**
 * Prisma's code for a unique constraint violation.
 *
 * Detected structurally rather than by importing Prisma's error class: the
 * generated client is a devDependency of this app (the integration tests import it
 * directly), so a runtime import here would be an extraneous dependency. The code
 * itself is the stable part of the contract.
 */
export const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
