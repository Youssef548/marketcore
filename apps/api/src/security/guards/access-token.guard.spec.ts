import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccessTokenGuard } from './access-token.guard';
import { TokenService } from '../../auth/tokens/token.service';

/**
 * The 401 boundary had no test until this file existed, and that was a real hole:
 * if this guard regressed to pass-through, every protected route would still
 * answer 403 — the organization guard would find no user and refuse — so no
 * existing test would have noticed. Deny-by-default is only a posture if
 * something asserts the denying.
 */
const tokens = new TokenService(new JwtService({ secret: 'a'.repeat(32) }));

const contextFor = (headers: Record<string, string>, isPublic = false) => {
  const request: { headers: Record<string, string>; user?: { id: string } } = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(isPublic) } as never;

  return { context, request, reflector };
};

describe('AccessTokenGuard', () => {
  it('refuses a request with no Authorization header', async () => {
    const { context, reflector } = contextFor({});

    await expect(new AccessTokenGuard(tokens, reflector).canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a header that is not a bearer scheme', async () => {
    const { context, reflector } = contextFor({ authorization: 'Basic dXNlcjpwYXNz' });

    await expect(new AccessTokenGuard(tokens, reflector).canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a malformed token', async () => {
    const { context, reflector } = contextFor({ authorization: 'Bearer not-a-jwt' });

    await expect(new AccessTokenGuard(tokens, reflector).canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a token signed with another secret', async () => {
    const other = new TokenService(new JwtService({ secret: 'b'.repeat(32) }));
    const { context, reflector } = contextFor({ authorization: `Bearer ${await other.signAccessToken('u1')}` });

    await expect(new AccessTokenGuard(tokens, reflector).canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the caller on a valid token', async () => {
    const { context, request, reflector } = contextFor({
      authorization: `Bearer ${await tokens.signAccessToken('user_1')}`,
    });

    await expect(new AccessTokenGuard(tokens, reflector).canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'user_1' });
  });

  it('lets a public route through with no token at all', async () => {
    // The marker is the only way out, which is what makes `grep @Public` the
    // complete list of unauthenticated routes.
    const { context, reflector } = contextFor({}, true);

    await expect(new AccessTokenGuard(tokens, reflector).canActivate(context)).resolves.toBe(true);
  });
});
