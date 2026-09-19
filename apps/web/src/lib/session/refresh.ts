import type { TokenPair } from '@app/contracts';

/** Performs one rotation against the API. Injected so the coordinator holds no transport. */
export type ExchangeRefreshToken = (refreshToken: string) => Promise<TokenPair>;

export interface RefreshCoordinator {
  /**
   * A new token pair, for whichever refresh token the caller was holding when its
   * request began.
   */
  refresh(presentedToken: string): Promise<TokenPair>;
}

/**
 * Rotation, serialized.
 *
 * This exists because the API revokes an entire session when a refresh token is
 * replayed. That is the correct server behaviour — it is how a leaked token is
 * contained — and it turns a client-side race into a sign-out: two requests that
 * both find their access token stale, both call refresh, and the second one is a
 * replay. The server is right and the user is logged out anyway.
 *
 * Two mechanisms stop that:
 *
 * 1. **Single flight.** Callers presenting the same token share one exchange
 *    instead of starting a second.
 * 2. **One step of rotation memory.** The dangerous case is not simultaneity but
 *    near-misses. A browser attaches the cookie it held when the request started,
 *    so a request can arrive *after* the first rotation has completed still
 *    carrying the token that was just superseded. Sharing an in-flight promise
 *    would not help — that promise has already settled — so the last rotation is
 *    remembered as a `from → to` pair and a caller presenting `from` is handed
 *    `to`.
 *
 * The memory is deliberately one entry deep. It absorbs the immediate predecessor
 * and nothing older: a genuine replay from before the last rotation still reaches
 * the API and still revokes the session, which is the signal the server exists to
 * produce. Bounded this way it cannot accumulate, and it never grows a timer.
 *
 * State lives in the closure, so a coordinator must be created once per process to
 * mean anything.
 */
export function createRefreshCoordinator(exchange: ExchangeRefreshToken): RefreshCoordinator {
  const inFlight = new Map<string, Promise<TokenPair>>();
  let lastRotation: { from: string; to: TokenPair } | null = null;

  return {
    refresh(presentedToken: string): Promise<TokenPair> {
      if (lastRotation !== null && lastRotation.from === presentedToken) {
        return Promise.resolve(lastRotation.to);
      }

      const alreadyRunning = inFlight.get(presentedToken);
      if (alreadyRunning !== undefined) return alreadyRunning;

      const rotation = exchange(presentedToken)
        .then((next) => {
          lastRotation = { from: presentedToken, to: next };
          return next;
        })
        .finally(() => {
          // Removed once settled so a token that failed is retried rather than
          // cached forever. A success is still answered from `lastRotation`.
          inFlight.delete(presentedToken);
        });

      inFlight.set(presentedToken, rotation);
      return rotation;
    },
  };
}
