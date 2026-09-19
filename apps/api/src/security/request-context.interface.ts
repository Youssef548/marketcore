import type { RequestWithId } from '@app/runtime';
import type { TenantContext } from '@app/domain';

export interface AuthenticatedUser {
  id: string;
}

/**
 * Express's request, carrying what the guard chain attached.
 *
 * Declared as an interface rather than augmented onto Express's global namespace
 * for the reason `@app/runtime` already records: a hand-written `declare global`
 * in a .d.ts is not emitted into dist, so it would reach this package and
 * silently not reach its consumers.
 */
export interface AuthenticatedRequest extends RequestWithId {
  user?: AuthenticatedUser;
  tenant?: TenantContext;
}
