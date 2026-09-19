import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/runtime';
import type { SessionRevocationReason } from '@app/contracts';
import type { RefreshTokenRecord } from './sessions.interface';

@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One query, because the decision needs the token and its session together.
   *
   * `null` when no row matched the hash. There is no empty-id sentinel: absence is
   * not a token state, and a sentinel would put placeholder identifiers in reach of
   * code that only ever runs for a token that exists.
   */
  async loadByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        sessionId: true,
        expiresAt: true,
        usedAt: true,
        session: { select: { revokedAt: true, expiresAt: true } },
      },
    });

    if (token === null) return null;

    return {
      id: token.id,
      sessionId: token.sessionId,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt,
      sessionRevokedAt: token.session.revokedAt,
      sessionExpiresAt: token.session.expiresAt,
    };
  }

  /**
   * Claims the presented token and issues its replacement in one transaction.
   *
   * The transaction alone would NOT be enough, and that is the whole point of
   * this method. Postgres runs at READ COMMITTED, so two concurrent refreshes can
   * both read `usedAt IS NULL` and both rotate — issuing two live tokens and
   * defeating reuse detection entirely. The guard is the `usedAt: null` predicate:
   * `count === 0` means this caller lost the race, so the answer is `false` and
   * the replay branch applies instead.
   *
   * Returns true only when this call performed the rotation.
   */
  async claimAndRotate(
    tokenId: string,
    sessionId: string,
    newTokenHash: string,
    newExpiresAt: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: tokenId, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) return false;

      await tx.refreshToken.create({
        data: { sessionId, tokenHash: newTokenHash, expiresAt: newExpiresAt },
      });
      await tx.session.update({ where: { id: sessionId }, data: { lastUsedAt: new Date() } });
      return true;
    });
  }

  async revokeSession(sessionId: string, reason: SessionRevocationReason): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** The subject for the access token a rotation issues. */
  async findUserIdBySession(sessionId: string): Promise<string | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    return session?.userId ?? null;
  }
}
