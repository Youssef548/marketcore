import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from '@jest/globals';
import type { PrismaService } from '@app/runtime';
import { SessionsRepository } from '../../src/auth/sessions.repository';
import { testPrisma } from '../support/db';

/**
 * Two concurrent refreshes of the same token must produce exactly one rotation.
 *
 * A bare transaction does NOT give this, which is the whole reason the repository
 * uses a conditional update: Postgres runs at READ COMMITTED, so both calls can
 * read `usedAt IS NULL` and both rotate, issuing two live tokens and defeating
 * reuse detection entirely. Against real Postgres, this test fails on the naive
 * implementation and passes on the guarded one.
 */
describe('refresh rotation under concurrency', () => {
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('lets exactly one of two concurrent claims rotate a token', async () => {
    const user = await testPrisma.user.create({
      data: { email: `race-${randomUUID()}@marketcore.test`, passwordHash: 'x' },
    });
    const session = await testPrisma.session.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + 100_000) },
    });
    const token = await testPrisma.refreshToken.create({
      data: {
        sessionId: session.id,
        tokenHash: `race-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 100_000),
      },
    });

    const repository = new SessionsRepository(testPrisma as unknown as PrismaService);
    const [first, second] = await Promise.all([
      repository.claimAndRotate(
        token.id,
        session.id,
        `next-a-${randomUUID()}`,
        new Date(Date.now() + 100_000),
      ),
      repository.claimAndRotate(
        token.id,
        session.id,
        `next-b-${randomUUID()}`,
        new Date(Date.now() + 100_000),
      ),
    ]);

    // Exactly one winner. Two would mean two live tokens from one; zero would mean
    // a legitimate refresh was refused.
    expect([first, second].filter(Boolean)).toHaveLength(1);

    const rotated = await testPrisma.refreshToken.count({ where: { sessionId: session.id } });
    expect(rotated).toBe(2); // the original, plus exactly one replacement
  });
});
