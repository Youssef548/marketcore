import { z } from 'zod';
import { ApiError } from '@app/api-client';
import {
  ErrorCodes,
  OrganizationSchema,
  UserSummarySchema,
  type Organization,
  type TokenPair,
  type UserSummary,
} from '@app/contracts';

/**
 * What the browser is told about its session.
 *
 * This is *this* app's wire format, not the API's: the browser talks to the BFF and
 * never to the API, so the schema belongs here rather than in `@app/contracts`. It
 * is still assembled from the API's own schemas, so a user and an organization have
 * one definition each and this cannot describe them differently.
 */
export const SessionViewSchema = z.object({
  user: UserSummarySchema,
  organizations: z.array(OrganizationSchema),
  activeOrganizationId: z.string().nullable(),
});
export type SessionView = z.infer<typeof SessionViewSchema>;

/**
 * Choosing which organization the session acts in.
 *
 * Part of this app's wire format rather than the API's: the API takes the
 * organization as a header per request, and has no notion of a stored preference.
 */
export const SelectOrganizationRequestSchema = z.object({ organizationId: z.string().min(1) });
export type SelectOrganizationRequest = z.infer<typeof SelectOrganizationRequestSchema>;

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

/**
 * Which organization the session is acting in.
 *
 * A remembered choice counts only while it is still one the caller belongs to.
 * Membership can be revoked, and a stale id carried forward would be refused by the
 * API on every later request while the UI went on claiming to act in it.
 *
 * One membership is not a choice, so it is selected without asking. Several with
 * nothing valid remembered answers null, which is a real state — the caller has to
 * pick — rather than an error.
 */
export function resolveActiveOrganization(
  preferredId: string | undefined,
  organizations: Organization[],
): string | null {
  if (preferredId !== undefined && organizations.some(({ id }) => id === preferredId)) {
    return preferredId;
  }
  return organizations.length === 1 ? organizations[0].id : null;
}

/**
 * The caller's session, or null when there is none.
 *
 * **One refresh and one retry, never two.** The first attempt uses the held access
 * token; that it fails with 401 is the ordinary case rather than an exceptional
 * one, because the access cookie deliberately outlives the fifteen-minute token
 * inside it and the API's 401 is the only thing that says so. A second failure
 * after a successful rotation means the refresh token itself is finished, and
 * trying again would be the replay the API revokes a session over.
 */
export async function loadSession(deps: SessionDeps): Promise<SessionView | null> {
  const refreshToken = deps.store.readRefreshToken();
  // No refresh token is no session: there is nothing to attempt and nothing to
  // clear, since the access token cannot outlive it.
  if (refreshToken === undefined) return null;

  const held = deps.store.readAccessToken();
  if (held !== undefined) {
    try {
      return await read(deps, held);
    } catch (error) {
      if (!isUnauthorized(error)) throw error;
    }
  }

  try {
    const rotated = await deps.refresh(refreshToken);
    deps.store.saveTokens(rotated);
    return await read(deps, rotated.accessToken);
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
    // Revoked, replayed, expired, or a user row that no longer exists. Holding on
    // to any of it would only reproduce this on the next request.
    deps.store.clear();
    return null;
  }
}

async function read(deps: SessionDeps, accessToken: string): Promise<SessionView> {
  const [user, organizations] = await Promise.all([
    deps.api.me(accessToken),
    deps.api.organizations(accessToken),
  ]);

  return {
    user,
    organizations,
    activeOrganizationId: resolveActiveOrganization(
      deps.store.readOrganizationId(),
      organizations,
    ),
  };
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.code === ErrorCodes.UNAUTHORIZED;
}
