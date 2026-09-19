import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { SessionRevocationReasons } from '@app/contracts';
import type { PasswordHasher } from './password/password-hasher.interface';
import type { SessionsRepository } from './sessions.repository';
import type { TokenService } from './tokens/token.service';
import type { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

const FUTURE = new Date(Date.now() + 60_000);
const PAST = new Date(Date.now() - 60_000);

const tokenRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'tok-1',
  sessionId: 'sess-1',
  expiresAt: FUTURE,
  usedAt: null,
  sessionRevokedAt: null,
  // The session is the outer bound, so the fixture needs it: rotation renews the
  // token, not the session.
  sessionExpiresAt: FUTURE,
  ...overrides,
});

const build = (overrides: {
  findByEmail?: jest.Mock;
  findById?: jest.Mock;
  createUser?: jest.Mock;
  createSessionWithToken?: jest.Mock;
  loadByTokenHash?: jest.Mock;
  claimAndRotate?: jest.Mock;
} = {}) => {
  const repository = {
    findByEmail: overrides.findByEmail ?? jest.fn().mockResolvedValue(null),
    // Defaults to a miss, which is the case `getUser` has to refuse.
    findById: overrides.findById ?? jest.fn().mockResolvedValue(null),
    createUser: overrides.createUser ?? jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.test' }),
    createSessionWithToken:
      overrides.createSessionWithToken ?? jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthRepository;
  const hasher = {
    hash: jest.fn().mockResolvedValue('$argon2id$hash'),
    verify: jest.fn().mockResolvedValue(true),
  } as unknown as PasswordHasher;
  const tokens = {
    signAccessToken: jest.fn().mockResolvedValue('access'),
    generateRefreshToken: jest.fn().mockReturnValue('refresh'),
    hashRefreshToken: jest.fn().mockReturnValue('refresh-hash'),
  } as unknown as TokenService;
  const sessions = {
    loadByTokenHash: overrides.loadByTokenHash ?? jest.fn().mockResolvedValue(tokenRecord()),
    claimAndRotate: overrides.claimAndRotate ?? jest.fn().mockResolvedValue(true),
    revokeSession: jest.fn().mockResolvedValue(undefined),
    findUserIdBySession: jest.fn().mockResolvedValue('u1'),
  } as unknown as SessionsRepository;

  return {
    service: new AuthService(repository, hasher, tokens, sessions),
    repository,
    hasher,
    tokens,
    sessions,
  };
};

describe('AuthService', () => {
  it('rejects a password below the policy before hashing it', async () => {
    const { service, hasher } = build();

    await expect(service.register({ email: 'a@b.test', password: 'short' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // The order matters: a rejected password must not reach the hasher, or a
    // hostile request gets to spend CPU on argon2 before being refused.
    expect(hasher.hash).not.toHaveBeenCalled();
  });

  it('refuses a duplicate email', async () => {
    const email = 'taken@b.test';
    const { service } = build({ findByEmail: jest.fn().mockResolvedValue({ id: 'u1', email }) });

    await expect(service.register({ email, password: 'a'.repeat(12) })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('creates a user and never returns the hash', async () => {
    const { service } = build();

    const user = await service.register({ email: 'new@b.test', password: 'a'.repeat(12) });

    expect(user).toEqual({ id: 'u1', email: 'a@b.test' });
    expect(JSON.stringify(user)).not.toContain('argon2');
  });

  it('opens a session on login and returns a pair', async () => {
    const { service, repository } = build({
      findByEmail: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'a@b.test',
        passwordHash: '$argon2id$hash',
      }),
    });

    await expect(service.login({ email: 'a@b.test', password: 'a'.repeat(12) })).resolves.toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    expect(repository.createSessionWithToken).toHaveBeenCalledWith(
      'u1',
      'refresh-hash',
      expect.any(Date),
      expect.any(Date),
    );
  });

  it('answers the same way for an unknown email and a wrong password', async () => {
    // Distinguishing them would turn login into an account-enumeration oracle.
    const wrongPassword = build({
      findByEmail: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.test', passwordHash: 'h' }),
    });
    (wrongPassword.hasher.verify as jest.Mock).mockResolvedValue(false);

    await expect(
      wrongPassword.service.login({ email: 'a@b.test', password: 'a'.repeat(12) }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      build().service.login({ email: 'nobody@b.test', password: 'a'.repeat(12) }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates a usable refresh token and returns a fresh pair', async () => {
    const { service, sessions } = build();

    await expect(service.refresh('refresh')).resolves.toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    expect(sessions.claimAndRotate).toHaveBeenCalledTimes(1);
  });

  it('revokes the whole session when an already-rotated token is replayed', async () => {
    const { service, sessions } = build({
      loadByTokenHash: jest.fn().mockResolvedValue(tokenRecord({ usedAt: PAST })),
    });

    await expect(service.refresh('refresh')).rejects.toBeInstanceOf(UnauthorizedException);
    // The decisive assertion: a replay must kill the session, not merely fail the
    // request, or the leaked token could still be traded in later.
    expect(sessions.revokeSession).toHaveBeenCalledWith('sess-1', SessionRevocationReasons.REUSE_DETECTED);
    expect(sessions.claimAndRotate).not.toHaveBeenCalled();
  });

  it('revokes the session when it loses the rotation race', async () => {
    const { service, sessions } = build({
      claimAndRotate: jest.fn().mockResolvedValue(false),
    });

    await expect(service.refresh('refresh')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.revokeSession).toHaveBeenCalledWith('sess-1', SessionRevocationReasons.REUSE_DETECTED);
  });

  it('rejects an unknown or expired token without revoking anything', async () => {
    // A lookup miss is `null`, not a record with placeholder ids.
    const unknown = build({ loadByTokenHash: jest.fn().mockResolvedValue(null) });
    const expired = build({ loadByTokenHash: jest.fn().mockResolvedValue(tokenRecord({ expiresAt: PAST })) });
    const sessionExpired = build({
      loadByTokenHash: jest.fn().mockResolvedValue(tokenRecord({ sessionExpiresAt: PAST })),
    });

    await expect(unknown.service.refresh('refresh')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(expired.service.refresh('refresh')).rejects.toBeInstanceOf(UnauthorizedException);
    // A fresh token in a session past its own expiry is still refused: rotation
    // renews the token, not the session.
    await expect(sessionExpired.service.refresh('refresh')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // Nothing leaked in any of these cases, so there is nothing to revoke.
    expect(unknown.sessions.revokeSession).not.toHaveBeenCalled();
    expect(expired.sessions.revokeSession).not.toHaveBeenCalled();
    expect(sessionExpired.sessions.revokeSession).not.toHaveBeenCalled();
  });

  it('returns the user its token subject names, and never the hash', async () => {
    const { service, repository } = build({
      findById: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.test' }),
    });

    await expect(service.getUser('u1')).resolves.toEqual({ id: 'u1', email: 'a@b.test' });
    expect(repository.findById).toHaveBeenCalledWith('u1');
  });

  it('refuses a token whose user no longer exists', async () => {
    // Reachable rather than theoretical: an access token cannot be revoked, so
    // deleting the row leaves every token already issued for it valid until it
    // expires.
    await expect(build().service.getUser('u1')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes the session on logout, and treats an unknown token as success', async () => {
    const { service, sessions } = build();
    await service.logout('refresh');
    expect(sessions.revokeSession).toHaveBeenCalledWith('sess-1', SessionRevocationReasons.LOGOUT);

    const gone = build({ loadByTokenHash: jest.fn().mockResolvedValue(null) });
    await expect(gone.service.logout('refresh')).resolves.toBeUndefined();
    expect(gone.sessions.revokeSession).not.toHaveBeenCalled();
  });
});
