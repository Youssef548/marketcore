import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { SEED_USERS } from './seed.constants';

/**
 * Deterministic seed data.
 *
 * Idempotent by construction: every row is upserted on its natural key, so
 * `db:seed` runs any number of times and the database ends in the same state.
 *
 * Writing the rows is also what proves migrations ran first — the insert fails on
 * a database with no `users` table. That replaces an earlier `SELECT count(*) FROM
 * _prisma_migrations`, which needed raw SQL to answer a question a real write
 * answers for free.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    for (const user of SEED_USERS) {
      await prisma.user.upsert({
        where: { email: user.email },
        update: {},
        create: user,
      });
    }

    const users = await prisma.user.count();
    console.log(`seed: upserted ${SEED_USERS.length} user(s); users table now holds ${users}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('seed failed:', error);
  // Non-zero so `db:reset` and CI fail loudly rather than reporting success for
  // a seed that never ran.
  process.exitCode = 1;
});
