import { PrismaClient } from '@prisma/client';

/**
 * A client of its own, used by tests that deliberately write *around* the
 * application. Going through a repository to prove a database constraint would
 * prove the repository instead, which is the opposite of the question.
 *
 * PrismaService is not reused because it is request-scoped wiring; these tests are
 * not requests.
 */
export const testPrisma = new PrismaClient();
