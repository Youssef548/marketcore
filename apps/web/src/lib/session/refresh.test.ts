import { describe, expect, it, vi } from 'vitest';
import type { TokenPair } from '@app/contracts';
import { createRefreshCoordinator } from './refresh';

const pair = (accessToken: string, refreshToken: string): TokenPair => ({
  accessToken,
  refreshToken,
});

/**
 * The invariant: concurrent loads that all find their access token stale must
 * produce exactly one rotation.
 *
 * The failure being prevented is not an error response. The API answers a replayed
 * refresh token by revoking the whole session — correct behaviour, and its
 * client-side consequence is a user logged out for refreshing twice. So these tests
 * assert on the **number of calls to the API**, not on the value that comes back:
 * an implementation that rotated twice would still return a usable-looking pair.
 */
describe('refresh coordinator', () => {
  it('exchanges once while several callers present the same token', async () => {
    let settle!: (value: TokenPair) => void;
    const exchange = vi.fn().mockImplementation(
      () =>
        new Promise<TokenPair>((resolve) => {
          settle = resolve;
        }),
    );
    const coordinator = createRefreshCoordinator(exchange);

    // Called synchronously, so nothing has answered yet. One exchange is outstanding
    // and the others are waiting on it rather than starting their own.
    const callers = Promise.all([
      coordinator.refresh('rt-1'),
      coordinator.refresh('rt-1'),
      coordinator.refresh('rt-1'),
    ]);
    expect(exchange).toHaveBeenCalledTimes(1);

    settle(pair('at-2', 'rt-2'));
    await expect(callers).resolves.toEqual([
      pair('at-2', 'rt-2'),
      pair('at-2', 'rt-2'),
      pair('at-2', 'rt-2'),
    ]);
    // The decisive assertion. Three rotations here would be three replays.
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('answers a late caller holding the superseded token with the rotation it missed', async () => {
    // The near-miss case, which a bare in-flight map does not cover: the browser
    // attaches the cookie it held when the request started, so this request arrives
    // after the rotation settled still carrying the token that was just replaced.
    const exchange = vi.fn().mockResolvedValue(pair('at-2', 'rt-2'));
    const coordinator = createRefreshCoordinator(exchange);

    await coordinator.refresh('rt-1');

    await expect(coordinator.refresh('rt-1')).resolves.toEqual(pair('at-2', 'rt-2'));
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('still exchanges a token that is not the one it just replaced', async () => {
    const exchange = vi
      .fn()
      .mockResolvedValueOnce(pair('at-2', 'rt-2'))
      .mockResolvedValueOnce(pair('at-3', 'rt-3'));
    const coordinator = createRefreshCoordinator(exchange);

    await coordinator.refresh('rt-1');

    await expect(coordinator.refresh('rt-2')).resolves.toEqual(pair('at-3', 'rt-3'));
    expect(exchange).toHaveBeenCalledTimes(2);
  });

  it('lets a replay older than the last rotation reach the API', async () => {
    // The memory is one step deep on purpose. A token from two rotations ago is a
    // genuine replay, and reaching the API is what must happen: detecting it is how a
    // leaked session gets revoked, and absorbing it here would hide exactly the
    // signal the server exists to produce.
    const exchange = vi
      .fn()
      .mockResolvedValueOnce(pair('at-2', 'rt-2'))
      .mockResolvedValueOnce(pair('at-3', 'rt-3'))
      .mockResolvedValueOnce(pair('at-4', 'rt-4'));
    const coordinator = createRefreshCoordinator(exchange);

    await coordinator.refresh('rt-1');
    await coordinator.refresh('rt-2');
    await coordinator.refresh('rt-1');

    expect(exchange).toHaveBeenCalledTimes(3);
  });

  it('does not remember a failed rotation as a rotation', async () => {
    // Otherwise a refused token would be answered from memory forever, and a
    // recovered session could never be refreshed again.
    const exchange = vi.fn().mockRejectedValueOnce(new Error('refused'));
    const coordinator = createRefreshCoordinator(exchange);

    await expect(coordinator.refresh('rt-1')).rejects.toThrow('refused');

    exchange.mockResolvedValueOnce(pair('at-2', 'rt-2'));
    await expect(coordinator.refresh('rt-1')).resolves.toEqual(pair('at-2', 'rt-2'));
    expect(exchange).toHaveBeenCalledTimes(2);
  });

  it('fails every caller waiting on a rotation that fails', async () => {
    const exchange = vi.fn().mockRejectedValue(new Error('refused'));
    const coordinator = createRefreshCoordinator(exchange);

    const results = await Promise.allSettled([
      coordinator.refresh('rt-1'),
      coordinator.refresh('rt-1'),
    ]);

    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(exchange).toHaveBeenCalledTimes(1);
  });
});
