import { UserStatus, type Prisma } from '@prisma/client';

/**
 * Not a credential. This value is not a bcrypt hash, so it cannot authenticate
 * against anything, and it exists so the seed path has a real row to write. The
 * auth module in phase 2 replaces it with a hash produced by the real hasher.
 */
const SEED_PASSWORD_HASH = 'not-a-credential-seed-placeholder';

/**
 * Deterministic seed rows, typed against Prisma's own input type so a column
 * rename breaks this file at typecheck rather than at runtime.
 *
 * Every row carries a natural key (here, email) that the seed upserts on, which
 * is what makes seeding idempotent.
 */
export const SEED_USERS: readonly Prisma.UserCreateInput[] = [
  {
    email: 'demo@marketcore.test',
    passwordHash: SEED_PASSWORD_HASH,
    status: UserStatus.ACTIVE,
  },
];
