import type { Organization, TokenPair, UserSummary } from '@app/contracts';

/** Where the tokens live. Injected so the rules below run without a Next request. */
export interface SessionStore {
  readAccessToken(): string | undefined;
  readRefreshToken(): string | undefined;
  readOrganizationId(): string | undefined;
  saveTokens(pair: TokenPair): void;
  clear(): void;
}

export interface SessionApi {
  me(accessToken: string): Promise<UserSummary>;
  organizations(accessToken: string): Promise<Organization[]>;
}

export interface SessionDeps {
  store: SessionStore;
  api: SessionApi;
  /** Rotates a refresh token. Single-flight, so concurrent loads share one rotation. */
  refresh(presentedToken: string): Promise<TokenPair>;
}
