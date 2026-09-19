import { randomUUID } from 'node:crypto';
import { CurrencyCodes, ORGANIZATION_ID_HEADER } from '@app/contracts';

/**
 * Deliberately a copy of the API suite's fixtures rather than an import of them:
 * the dependency-boundary rules forbid one app importing another, and a shared
 * test-support package for five one-line factories would be a package that exists
 * only to avoid five lines.
 *
 * Suffixed, because this suite shares its database with every other test in the run.
 */
export const unique = (prefix: string): string => `${prefix}-${randomUUID().slice(0, 8)}`;

export const TEST_PASSWORD = 'correct-horse-battery';

export const credentials = (email: string) => ({ email, password: TEST_PASSWORD });

export const organizationPayload = (prefix: string) => ({
  name: `${prefix} co`,
  slug: unique(prefix),
});

export function productPayload(
  overrides: Partial<{ name: string; priceMinor: number; currency: string }> = {},
) {
  return { name: 'Test Widget', priceMinor: 1000, currency: CurrencyCodes.EGP, ...overrides };
}

/** The headers a tenant-scoped request needs: the token and the organization it acts in. */
export function tenantHeaders(accessToken: string, organizationId: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    [ORGANIZATION_ID_HEADER]: organizationId,
  };
}
