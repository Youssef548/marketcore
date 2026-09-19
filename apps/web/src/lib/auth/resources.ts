import { z } from 'zod';
import { createApiClient } from '@app/api-client';
import {
  OrganizationSchema,
  TokenPairSchema,
  UserSummarySchema,
  type LoginRequest,
  type Organization,
  type RegisterRequest,
  type TokenPair,
  type UserSummary,
} from '@app/contracts';
import { apiBaseUrl } from '../api/config';

/**
 * The calls this app makes to the API.
 *
 * Resource methods belong to the app that owns the resource — that is the reason
 * `@app/api-client` ships none, and it is written in that package's own comment.
 * These live here, on top of its generic verbs.
 *
 * The access token is a parameter rather than construction-time state, so there is
 * no long-lived client holding a token that may already have been rotated. Every
 * call re-parses its response with the contract the API validated it with, so a
 * server that drifts from the contract raises here rather than handing a malformed
 * object to a page.
 */
export function createResources(accessToken?: string) {
  const client = createApiClient({
    baseUrl: apiBaseUrl(),
    getAccessToken: () => accessToken,
  });

  return {
    /** Creates a user and nothing else — no session, deliberately. */
    register: (body: RegisterRequest): Promise<UserSummary> =>
      client.post('/auth/register', UserSummarySchema, { body }),

    login: (body: LoginRequest): Promise<TokenPair> =>
      client.post('/auth/login', TokenPairSchema, { body }),

    /** Rotates a refresh token. The coordinator above decides when this is called. */
    refresh: (refreshToken: string): Promise<TokenPair> =>
      client.post('/auth/refresh', TokenPairSchema, { body: { refreshToken } }),

    /** 204, so the contract for the body is `null` rather than a shape. */
    logout: (refreshToken: string): Promise<null> =>
      client.post('/auth/logout', z.null(), { body: { refreshToken } }),

    me: (): Promise<UserSummary> => client.get('/auth/me', UserSummarySchema),

    /** Tenant-free: this is how a client learns which organizations it may act in. */
    organizations: (): Promise<Organization[]> =>
      client.get('/organizations', z.array(OrganizationSchema)),
  };
}
