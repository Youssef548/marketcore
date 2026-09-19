import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_BYTES } from '../auth.constants';
import type { AccessTokenPayload } from './access-token.interface';

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  signAccessToken(userId: string): Promise<string> {
    return this.jwtService.signAsync({ sub: userId }, { expiresIn: ACCESS_TOKEN_TTL });
  }

  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwtService.verifyAsync<AccessTokenPayload>(token);
  }

  /**
   * Opaque rather than a JWT: the only thing that reads it is this service, and a
   * random string carries no claims to leak or to be tempted to trust.
   */
  generateRefreshToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  /**
   * SHA-256, not argon2id, and that is a decision rather than a shortcut. The
   * input is 256 bits of randomness, so it is not guessable and a slow KDF buys
   * nothing — while this runs on every refresh. Passwords are the opposite case,
   * which is why they use argon2id.
   */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Constant-time compare, so a mismatch cannot be timed to reveal a prefix. */
  refreshTokenMatches(candidate: string, storedHash: string): boolean {
    const candidateHash = Buffer.from(this.hashRefreshToken(candidate));
    const stored = Buffer.from(storedHash);
    return candidateHash.length === stored.length && timingSafeEqual(candidateHash, stored);
  }
}
