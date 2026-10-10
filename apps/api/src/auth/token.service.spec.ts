import { JwtService } from '@nestjs/jwt';
import { JWT_AUDIENCE, JWT_ISSUER } from './auth.constants';
import { TokenService } from './token.service';

const service = new TokenService(new JwtService({ secret: 'a'.repeat(32) }));

const claims = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

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
    // The refresh path looks tokens up by exact hash, so this is the only
    // comparison that happens — no constant-time compare is involved, because the
    // stored value is never the secret.
    const token = service.generateRefreshToken();

    expect(service.hashRefreshToken(token)).toBe(service.hashRefreshToken(token));
    expect(service.hashRefreshToken(token)).not.toBe(token);
  });

  it('stamps the access token with the issuer and audience it is verified against', async () => {
    // Without an issuer and audience, a token minted for one service is accepted by
    // any other that shares the secret — the claims are what scope it to this API.
    const decoded = claims(await service.signAccessToken('user_1'));

    expect(decoded.iss).toBe(JWT_ISSUER);
    expect(decoded.aud).toBe(JWT_AUDIENCE);
  });

  it('rejects an access token minted for a different audience', async () => {
    const minted = await new JwtService({ secret: 'a'.repeat(32) }).signAsync(
      { sub: 'user_1' },
      { issuer: JWT_ISSUER, audience: 'another-service' },
    );

    await expect(service.verifyAccessToken(minted)).rejects.toThrow();
  });

  it('rejects an access token minted by a different issuer', async () => {
    const minted = await new JwtService({ secret: 'a'.repeat(32) }).signAsync(
      { sub: 'user_1' },
      { issuer: 'another-service', audience: JWT_AUDIENCE },
    );

    await expect(service.verifyAccessToken(minted)).rejects.toThrow();
  });
});
