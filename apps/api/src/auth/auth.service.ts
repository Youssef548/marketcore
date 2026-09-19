import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  checkPasswordPolicy,
  decideRefreshTokenUse,
  RefreshTokenVerdicts,
} from '@app/domain';
import {
  SessionRevocationReasons,
  type LoginRequest,
  type RegisterRequest,
  type TokenPair,
  type UserSummary,
} from '@app/contracts';
import { PASSWORD_HASHER, PasswordPolicyMessages, REFRESH_TOKEN_TTL_MS } from './auth.constants';
import { AuthRepository } from './auth.repository';
import { PasswordHasher } from './password/password-hasher.interface';
import { SessionsRepository } from './sessions.repository';
import { TokenService } from './tokens/token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
    private readonly sessionsRepository: SessionsRepository,
  ) {}

  /**
   * Creates the user only. Registration is user creation; a session is a separate
   * concern, so this path carries no token logic to get wrong.
   */
  async register(request: RegisterRequest): Promise<UserSummary> {
    const violation = checkPasswordPolicy(request.password);
    if (violation !== null) {
      throw new BadRequestException(PasswordPolicyMessages[violation]);
    }

    const existing = await this.authRepository.findByEmail(request.email);
    if (existing !== null) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await this.passwordHasher.hash(request.password);
    return this.authRepository.createUser(request.email, passwordHash);
  }

  async login(request: LoginRequest): Promise<TokenPair> {
    const user = await this.authRepository.findByEmail(request.email);
    // One answer for an unknown email and a wrong password: distinguishing them
    // would make this endpoint an account-enumeration oracle.
    if (user === null || !(await this.passwordHasher.verify(user.passwordHash, request.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issuePair(user.id);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const record = await this.sessionsRepository.loadByTokenHash(
      this.tokenService.hashRefreshToken(refreshToken),
    );
    const verdict = decideRefreshTokenUse(record, new Date());

    if (verdict === RefreshTokenVerdicts.REPLAYED) {
      // The whole session dies, not just this token: a replay means the token
      // leaked, and any descendant of it is untrustworthy.
      await this.revokeForReuse(record.sessionId);
    }

    if (verdict === RefreshTokenVerdicts.REJECTED) {
      throw new UnauthorizedException('Refresh token is not usable');
    }

    const nextToken = this.tokenService.generateRefreshToken();
    const rotated = await this.sessionsRepository.claimAndRotate(
      record.id,
      record.sessionId,
      this.tokenService.hashRefreshToken(nextToken),
      new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    );

    if (!rotated) {
      // Lost the race between the decision and the claim: another request already
      // used this token, which is the same signal as a replay.
      await this.revokeForReuse(record.sessionId);
    }

    // The access token is signed from the user id, which the session holds — not
    // from the session id, and never from anything the caller supplied.
    const userId = await this.sessionsRepository.findUserIdBySession(record.sessionId);
    if (userId === null) throw new UnauthorizedException('Session no longer exists');

    return { accessToken: await this.tokenService.signAccessToken(userId), refreshToken: nextToken };
  }

  async logout(refreshToken: string): Promise<void> {
    const record = await this.sessionsRepository.loadByTokenHash(
      this.tokenService.hashRefreshToken(refreshToken),
    );
    // Already gone is not an error to report to the caller.
    if (!record.exists) return;

    await this.sessionsRepository.revokeSession(record.sessionId, SessionRevocationReasons.LOGOUT);
  }

  private async revokeForReuse(sessionId: string): Promise<never> {
    await this.sessionsRepository.revokeSession(
      sessionId,
      SessionRevocationReasons.REUSE_DETECTED,
    );
    throw new UnauthorizedException('Refresh token was already used');
  }

  private async issuePair(userId: string): Promise<TokenPair> {
    const refreshToken = this.tokenService.generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.authRepository.createSessionWithToken(
      userId,
      this.tokenService.hashRefreshToken(refreshToken),
      expiresAt,
      expiresAt,
    );

    return { accessToken: await this.tokenService.signAccessToken(userId), refreshToken };
  }
}
