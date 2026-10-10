import { z } from 'zod';
import { createApiClient } from '@app/api-client';
import {
  OrganizationSchema,
  ProductSchema,
  TokenPairSchema,
  UserSummarySchema,
  type CreateOrganizationRequest,
  type LoginRequest,
  type Organization,
  type Product,
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

    /**
     * Creates an organization, with the caller as its owner — one operation, because an
     * organization nobody belongs to is a row nobody can use.
     *
     * Tenant-free at the API, and it has to be: a user with no memberships has no tenant
     * to name, so a request that required a header could never create the first one.
     * `slug` is left to the API, which derives it from the name.
     */
    createOrganization: (body: CreateOrganizationRequest): Promise<Organization> =>
      client.post('/organizations', OrganizationSchema, { body }),

    /**
     * The caller's products, inside one organization.
     *
     * The organization travels as `x-organization-id` — the header the guard resolves
     * into a `TenantContext` — rather than as a path segment or a query parameter. A
     * request without it is refused with 400 rather than answered with everything,
     * which is what makes a missing header a loud failure instead of a leak.
     */
    products: (organizationId: string): Promise<Product[]> =>
      client.get('/products', z.array(ProductSchema), {
        headers: { 'x-organization-id': organizationId },
      }),
  };
}
