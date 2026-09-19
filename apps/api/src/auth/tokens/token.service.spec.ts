import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

const service = new TokenService(new JwtService({ secret: 'a'.repeat(32) }));

describe('TokenService', () => {
  it('signs an access token carrying the user id', async () => {
    const token = await service.signAccessToken('user_1');

    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({ sub: 'user_1' });
  });

  it('rejects a token signed with a different secret', async () => {
    const other = new TokenService(new JwtService({ secret: 'b'.repeat(32) }));
    const token = await other.signAccessToken('user_1');

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it('generates a high-entropy refresh token, never the same one twice', () => {
    const first = service.generateRefreshToken();
    const second = service.generateRefreshToken();

    expect(first).not.toBe(second);
    // 32 random bytes base64url-encoded. Below this the token is not the
    // unguessable string the fast hash relies on.
    expect(first.length).toBeGreaterThanOrEqual(43);
  });

  it('hashes a refresh token deterministically, so a lookup can find it', () => {
    const token = service.generateRefreshToken();

    expect(service.hashRefreshToken(token)).toBe(service.hashRefreshToken(token));
    expect(service.hashRefreshToken(token)).not.toBe(token);
  });

  it('compares refresh tokens without leaking a prefix through timing', () => {
    const token = service.generateRefreshToken();
    const stored = service.hashRefreshToken(token);

    expect(service.refreshTokenMatches(token, stored)).toBe(true);
    expect(service.refreshTokenMatches(`${token}x`, stored)).toBe(false);
  });
});
