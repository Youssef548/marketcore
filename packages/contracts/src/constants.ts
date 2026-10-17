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

/** A cart line holds 1 to 10 units (D72, RULE-CART-001). */
export const CART_LINE_MIN_QUANTITY = 1;
export const CART_LINE_MAX_QUANTITY = 10;

/** The most lines one checkout may carry (SRS §7). */
export const CHECKOUT_MAX_LINES = 50;

/** Public catalog page size (SRS-FR-CAT-001). */
export const STOREFRONT_PAGE_SIZE = 24;

/** Buyer order history page size (D89 — the SRS does not state one). */
export const BUYER_ORDERS_PAGE_SIZE = 20;

/** A cart line's live availability (SRS-FR-CART-005). */
export const CartLineAvailabilities = { OK: 'OK', SHORT: 'SHORT', SOLD_OUT: 'SOLD_OUT' } as const;
export type CartLineAvailability =
  (typeof CartLineAvailabilities)[keyof typeof CartLineAvailabilities];

/** Why a checkout line was refused (SRS-FR-CHK-003). Precedence is D85. */
export const CheckoutConflictReasons = {
  SOLD_OUT: 'SOLD_OUT',
  SHORT: 'SHORT',
  PRICE_CHANGED: 'PRICE_CHANGED',
} as const;
export type CheckoutConflictReason =
  (typeof CheckoutConflictReasons)[keyof typeof CheckoutConflictReasons];

/** A refusal about the request as a whole rather than one line (SRS-FR-CHK-006). */
export const CheckoutRefusals = { CART_CHANGED: 'CART_CHANGED' } as const;
export type CheckoutRefusal = (typeof CheckoutRefusals)[keyof typeof CheckoutRefusals];

/**
 * The largest value the database column can hold: every money and quantity column
 * in this schema is Postgres `INTEGER` (int4).
 *
 * A zod `z.int()` accepts any safe integer, so a value above this passes the
 * contract and the pipe and then fails inside Prisma — a 500 for what is really a
 * 400. A client validating with the same schema the server publishes cannot know
 * the real bound unless it is stated here (review finding, phase 4).
 */
export const POSTGRES_INT_MAX = 2_147_483_647;

/**
 * The smallest value the database column can hold: the mirror of the ceiling
 * above. A zod `z.int()` has no floor either, so a large negative value used
 * to pass the contract and then fail inside Prisma — the same 500 for a 400,
 * one direction over (phase-4 review finding).
 */
export const POSTGRES_INT_MIN = -2_147_483_648;

/**
 * Turns a const object of wire values into the non-empty tuple `z.enum` needs.
 * Shared because otherwise every enum in this package repeats the same cast.
 */
export function wireValues<T extends Record<string, string>>(
  source: T,
): [T[keyof T], ...T[keyof T][]] {
  return Object.values(source) as [T[keyof T], ...T[keyof T][]];
}
