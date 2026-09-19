import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * Deterministic seed data.
 *
 * There are no models yet — the schema begins in phase 2 — so this seeds no
 * rows. What it establishes is the *path*: `db:reset` applies migrations and
 * then runs this, against a clean database. Phase 2 adds the first rows here;
 * the command does not change.
 *
 * The migration-count query is deliberate rather than decorative: it fails if
 * the migrations table is absent, which is what proves reset applied migrations
 * *before* seeding instead of the two merely both having run.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const [applied] = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM _prisma_migrations
    `;
    console.log(
      `seed: connected; ${applied.count} migration(s) applied; no models to seed yet (phase 2)`,
    );
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
