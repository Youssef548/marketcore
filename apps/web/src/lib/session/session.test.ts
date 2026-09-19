import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@app/api-client';
import {
  ErrorCodes,
  MemberRoles,
  OrganizationStatuses,
  type Organization,
  type TokenPair,
  type UserSummary,
} from '@app/contracts';
import {
  loadSession,
  resolveActiveOrganization,
  type SessionApi,
  type SessionStore,
} from './session';

const USER: UserSummary = { id: 'u1', email: 'owner@marketcore.test' };

const organization = (id: string): Organization => ({
  id,
  name: `Org ${id}`,
  slug: `org-${id}`,
  status: OrganizationStatuses.ACTIVE,
  role: MemberRoles.OWNER,
});

const pair = (accessToken: string, refreshToken: string): TokenPair => ({
  accessToken,
  refreshToken,
});

/** The API's refusal, which is the ordinary case rather than an exceptional one. */
const refusal = () => new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Refresh token is not usable');

interface FakeStore extends SessionStore {
  saveTokens: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
}

function fakeStore(
  initial: { access?: string; refresh?: string; organization?: string } = {},
): FakeStore {
  const held = { ...initial };

  return {
    readAccessToken: () => held.access,
    readRefreshToken: () => held.refresh,
    readOrganizationId: () => held.organization,
    saveTokens: vi.fn((tokens: TokenPair) => {
      held.access = tokens.accessToken;
      held.refresh = tokens.refreshToken;
    }),
    clear: vi.fn(() => {
      held.access = undefined;
      held.refresh = undefined;
      held.organization = undefined;
    }),
  };
}

function fakeApi(overrides: Partial<SessionApi> = {}): SessionApi {
  return {
    me: vi.fn().mockResolvedValue(USER),
    organizations: vi.fn().mockResolvedValue([organization('org-1')]),
    ...overrides,
  };
}

describe('loadSession', () => {
  it('reports no session without a refresh token, and asks the API nothing', async () => {
    const api = fakeApi();

    await expect(
      loadSession({ store: fakeStore(), api, refresh: vi.fn(async () => pair('a', 'b')) }),
    ).resolves.toBeNull();

    expect(api.me).not.toHaveBeenCalled();
    expect(api.organizations).not.toHaveBeenCalled();
  });

  it('loads the session without rotating when the held access token still works', async () => {
    const store = fakeStore({ access: 'at-1', refresh: 'rt-1' });
    const refresh = vi.fn(async () => pair('at-2', 'rt-2'));

    await expect(loadSession({ store, api: fakeApi(), refresh })).resolves.toEqual({
      user: USER,
      organizations: [organization('org-1')],
      // One membership is not a choice, so it is selected without asking.
      activeOrganizationId: 'org-1',
    });

    expect(refresh).not.toHaveBeenCalled();
    expect(store.saveTokens).not.toHaveBeenCalled();
  });

  it('rotates once and retries when the held access token is stale', async () => {
    const store = fakeStore({ access: 'at-1', refresh: 'rt-1' });
    const me = vi.fn().mockRejectedValueOnce(refusal()).mockResolvedValue(USER);
    const refresh = vi.fn(async () => pair('at-2', 'rt-2'));

    await expect(loadSession({ store, api: fakeApi({ me }), refresh })).resolves.toMatchObject({
      user: USER,
    });

    // Rotated with the token the request was holding, stored, and retried with the
    // replacement — one rotation, one retry.
    expect(refresh).toHaveBeenCalledWith('rt-1');
    expect(store.saveTokens).toHaveBeenCalledWith(pair('at-2', 'rt-2'));
    expect(me).toHaveBeenCalledTimes(2);
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('rotates without a first attempt when no access token is held', async () => {
    const store = fakeStore({ refresh: 'rt-1' });
    const me = vi.fn().mockResolvedValue(USER);
    const refresh = vi.fn(async () => pair('at-2', 'rt-2'));

    await expect(loadSession({ store, api: fakeApi({ me }), refresh })).resolves.toMatchObject({
      user: USER,
    });

    expect(me).toHaveBeenCalledTimes(1);
    expect(me).toHaveBeenCalledWith('at-2');
  });

  it('forgets the session when the refresh token is refused', async () => {
    const store = fakeStore({ access: 'at-1', refresh: 'rt-1' });
    const me = vi.fn().mockRejectedValue(refusal());
    const refresh = vi.fn(async () => {
      throw refusal();
    });

    await expect(loadSession({ store, api: fakeApi({ me }), refresh })).resolves.toBeNull();
    expect(store.clear).toHaveBeenCalledTimes(1);
  });

  it('forgets the session when the rotated token is refused too, without rotating twice', async () => {
    const store = fakeStore({ access: 'at-1', refresh: 'rt-1' });
    const me = vi.fn().mockRejectedValue(refusal());
    const refresh = vi.fn(async () => pair('at-2', 'rt-2'));

    await expect(loadSession({ store, api: fakeApi({ me }), refresh })).resolves.toBeNull();

    // A second rotation here would be the replay the API revokes a session over.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(store.clear).toHaveBeenCalledTimes(1);
  });

  it('does not swallow a failure that is not a refusal', async () => {
    const store = fakeStore({ access: 'at-1', refresh: 'rt-1' });
    const me = vi.fn().mockRejectedValue(new ApiError(500, ErrorCodes.INTERNAL, 'boom'));

    await expect(
      loadSession({ store, api: fakeApi({ me }), refresh: vi.fn(async () => pair('a', 'b')) }),
    ).rejects.toThrow('boom');

    // Clearing here would sign a user out over a server bug and lose a session that
    // is still perfectly valid.
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('remembers a chosen organization that is still a membership', async () => {
    const store = fakeStore({
      access: 'at-1',
      refresh: 'rt-1',
      organization: 'org-2',
    });
    const organizations = vi.fn().mockResolvedValue([organization('org-1'), organization('org-2')]);

    await expect(
      loadSession({ store, api: fakeApi({ organizations }), refresh: vi.fn(async () => pair('a', 'b')) }),
    ).resolves.toMatchObject({ activeOrganizationId: 'org-2' });
  });

  it('drops a remembered organization the caller is no longer a member of', async () => {
    const store = fakeStore({
      access: 'at-1',
      refresh: 'rt-1',
      organization: 'org-revoked',
    });
    const organizations = vi.fn().mockResolvedValue([organization('org-1'), organization('org-2')]);

    await expect(
      loadSession({ store, api: fakeApi({ organizations }), refresh: vi.fn(async () => pair('a', 'b')) }),
    ).resolves.toMatchObject({ activeOrganizationId: null });
  });
});

describe('resolveActiveOrganization', () => {
  const twoOrganizations = [organization('org-1'), organization('org-2')];

  it('keeps a remembered choice that is still a membership', () => {
    expect(resolveActiveOrganization('org-2', twoOrganizations)).toBe('org-2');
  });

  it('refuses a remembered choice that is not one', () => {
    // Carrying a revoked id forward would have every later request refused by the API
    // while the UI went on claiming to act inside it.
    expect(resolveActiveOrganization('org-9', twoOrganizations)).toBeNull();
  });

  it('selects the only membership without asking', () => {
    expect(resolveActiveOrganization(undefined, [organization('org-1')])).toBe('org-1');
  });

  it('answers null when there are several and none is remembered', () => {
    // A real state, not an error: the caller has to choose.
    expect(resolveActiveOrganization(undefined, twoOrganizations)).toBeNull();
  });

  it('answers null when the caller belongs to nothing', () => {
    expect(resolveActiveOrganization(undefined, [])).toBeNull();
    expect(resolveActiveOrganization('org-1', [])).toBeNull();
  });
});
