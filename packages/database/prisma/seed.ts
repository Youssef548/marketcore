import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  SEED_INVENTORY_AVAILABLE,
  SEED_MEMBERSHIPS,
  SEED_ORGANIZATIONS,
  SEED_PRODUCTS,
  SEED_USERS,
} from './seed.constants';

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
    for (const organization of SEED_ORGANIZATIONS) {
      await prisma.organization.upsert({
        where: { slug: organization.slug },
        update: {},
        create: organization,
      });
    }

    for (const user of SEED_USERS) {
      await prisma.user.upsert({ where: { email: user.email }, update: {}, create: user });
    }

    for (const membership of SEED_MEMBERSHIPS) {
      await prisma.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: membership.organizationId,
            userId: membership.userId,
          },
        },
        update: {},
        create: membership,
      });
    }

    for (const product of SEED_PRODUCTS) {
      await prisma.product.upsert({ where: { id: product.id }, update: {}, create: product });
      await prisma.inventory.upsert({
        where: { productId: product.id },
        update: {},
        create: { productId: product.id, available: SEED_INVENTORY_AVAILABLE, reserved: 0 },
      });
    }

    const [organizations, members, products] = await Promise.all([
      prisma.organization.count(),
      prisma.organizationMember.count(),
      prisma.product.count(),
    ]);
    console.log(
      `seed: ${organizations} organization(s), ${members} membership(s), ${products} product(s)`,
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
