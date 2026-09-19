import { API_PREFIX } from '@app/contracts';

/** Where the API lives when the environment says nothing — the README's local default. */
export const DEFAULT_API_ORIGIN = 'http://localhost:3001';

/**
 * The API's base URL, prefix included, resolved at call time rather than at module
 * load.
 *
 * A module-scope read would let `next build` bake a development origin into the
 * bundle, so the same image could not then run anywhere else. The prefix is
 * appended from `@app/contracts` rather than written here, because the API and this
 * app have to agree on it and a guess would fail every call as a 404 that reads
 * like a missing route.
 */
export function apiBaseUrl(): string {
  const origin = process.env.API_BASE_URL ?? DEFAULT_API_ORIGIN;
  return `${origin.replace(/\/+$/, '')}${API_PREFIX}`;
}
