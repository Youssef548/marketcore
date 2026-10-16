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
