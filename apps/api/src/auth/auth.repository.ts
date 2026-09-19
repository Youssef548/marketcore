import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/runtime';
import type { UserSummary } from '@app/contracts';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
}

/**
 * Every Prisma call the auth module makes. The service depends on this and never
 * on PrismaService (conventions Rule 4).
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });
  }

  async createUser(email: string, passwordHash: string): Promise<UserSummary> {
    return this.prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true },
    });
  }

  /**
   * One transaction, because a session without its first refresh token is a
   * session nobody can use and nobody will clean up.
   *
   * Both expiry instants are passed in: the service owns the policy, so this
   * layer holds no opinion about how long either token should live.
   */
  async createSessionWithToken(
    userId: string,
    refreshTokenHash: string,
    sessionExpiresAt: Date,
    tokenExpiresAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: { userId, expiresAt: sessionExpiresAt },
        select: { id: true },
      });
      await tx.refreshToken.create({
        data: { sessionId: session.id, tokenHash: refreshTokenHash, expiresAt: tokenExpiresAt },
      });
    });
  }
}
