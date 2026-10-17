/**
 * Wire-level literal values, defined once.
 *
 * No value in this repository is written into logic as a literal. Anything that
 * appears in a schema, a header, a log field and a test is one value, and it has
 * one definition here. `ErrorCodes` in ./error.ts follows the same shape — a
 * const object with its type derived from it — and is the precedent this file
 * extends rather than replaces.
 */

/** Header carrying the correlation id. Shared by the API, the worker and any client. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * The prefix every route sits behind, defined once because it is part of the
 * address a client calls rather than an implementation detail of the server that
 * serves it.
 *
 * It was a literal in `apps/api/src/app.setup.ts` until the web app needed to
 * build the same URLs: a client that guesses this wrong fails every call, and it
 * would have failed silently, as a 404 that looks like a missing route.
 */
export const API_PREFIX = '/api/v1';

export const HealthStatuses = { OK: 'ok' } as const;
export type HealthStatus = (typeof HealthStatuses)[keyof typeof HealthStatuses];

export const ReadinessStatuses = { OK: 'ok', DEGRADED: 'degraded' } as const;
export type ReadinessStatus = (typeof ReadinessStatuses)[keyof typeof ReadinessStatuses];

export const DependencyStates = { UP: 'up', DOWN: 'down' } as const;
export type DependencyState = (typeof DependencyStates)[keyof typeof DependencyStates];

export const MemberRoles = { OWNER: 'OWNER', MEMBER: 'MEMBER' } as const;
export type MemberRole = (typeof MemberRoles)[keyof typeof MemberRoles];

/**
 * The readiness verdict as an HTTP status, so no caller hand-writes the mapping
 * and none can disagree with another about what "degraded" answers.
 */
export const READINESS_HTTP_STATUS: Record<ReadinessStatus, number> = {
  [ReadinessStatuses.OK]: 200,
  [ReadinessStatuses.DEGRADED]: 503,
};

/** Header naming the organization a request acts within. Shared with any client. */
export const ORGANIZATION_ID_HEADER = 'x-organization-id';

/**
 * Set by a reverse proxy to the scheme and client address it saw.
 *
 * These are request headers, so they are only trustworthy once a trusted proxy has
 * overwritten them — a client can send them itself, which is exactly why the value
 * is logged as *forwarded* rather than as a verified fact.
 */
export const FORWARDED_PROTO_HEADER = 'x-forwarded-proto';
export const FORWARDED_FOR_HEADER = 'x-forwarded-for';

export const OrganizationStatuses = { ACTIVE: 'ACTIVE', DISABLED: 'DISABLED' } as const;
export type OrganizationStatus = (typeof OrganizationStatuses)[keyof typeof OrganizationStatuses];

export const ProductStatuses = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED' } as const;
export type ProductStatus = (typeof ProductStatuses)[keyof typeof ProductStatuses];

/**
 * A closed set. Adding a member is a deliberate, tested change — cross-currency
 * balancing is a rule the ledger depends on from phase 8.
 */
export const CurrencyCodes = { USD: 'USD', EUR: 'EUR', EGP: 'EGP' } as const;
export type CurrencyCode = (typeof CurrencyCodes)[keyof typeof CurrencyCodes];

/**
 * The password policy's one browser-visible fact.
 *
 * Defined here, in the wire contract, rather than only in `@app/domain`, because the
 * registration form has to state it and the two must not drift. The domain imports
 * this and owns the rule that applies it; the browser repeats only the number.
 */
export const PASSWORD_MIN_LENGTH = 12;

export const SessionRevocationReasons = {
  LOGOUT: 'LOGOUT',
  REUSE_DETECTED: 'REUSE_DETECTED',
} as const;
export type SessionRevocationReason =
  (typeof SessionRevocationReasons)[keyof typeof SessionRevocationReasons];

/** A slug is the organization's public handle, so its shape is wire-level. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 50;

/**
 * A checkout's states in phase 4 (D84). `PAID` arrives in phase 6 with the first
 * code that can write it — a state no operation can enter is scaffolding.
 */
export const CheckoutStatuses = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CANCELLED: 'CANCELLED',
} as const;
export type CheckoutStatus = (typeof CheckoutStatuses)[keyof typeof CheckoutStatuses];

/** Every order of a checkout moves with it (domain-model §5), so the sets are equal. */
export const OrderStatuses = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatuses)[keyof typeof OrderStatuses];

/**
 * How long a checkout may stay unpaid before the worker cancels it (D70).
 * Wire-level for the reason PASSWORD_MIN_LENGTH is: the placed screen states it,
 * and the browser must not hold a second copy.
 */
export const CHECKOUT_PAYMENT_WINDOW_MINUTES = 30;

/**
 * Turns a const object of wire values into the non-empty tuple `z.enum` needs.
 * Shared because otherwise every enum in this package repeats the same cast.
 */
export function wireValues<T extends Record<string, string>>(
  source: T,
): [T[keyof T], ...T[keyof T][]] {
  return Object.values(source) as [T[keyof T], ...T[keyof T][]];
}
