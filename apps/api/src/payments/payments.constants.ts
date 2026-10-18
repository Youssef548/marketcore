/**
 * The DI token the provider port is provided under, the `PASSWORD_HASHER` pattern: what
 * phase 7 replaces is a binding, not a call site.
 */
export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

/**
 * The store token, and it is not ceremony: `ProviderChargeStore` is an interface, which
 * does not exist at runtime, so a constructor parameter typed as one is a parameter Nest
 * cannot resolve. The adapter asks for this token; the module binds it to the Prisma
 * repository. The unit spec still constructs the adapter directly, with its fake.
 */
export const PROVIDER_CHARGE_STORE = 'PROVIDER_CHARGE_STORE';

/** The payments module's structured logger, the ORDERS_LOGGER pattern. */
export const PAYMENTS_LOGGER = 'PAYMENTS_LOGGER';

/**
 * What one capture resolved to (D102, D106, D107, D111).
 *
 * `PENDING` is the timeout's answer and the reason it is a distinct outcome: the charge may
 * have happened, so the buyer must not be told "declined" or "paid". The payment row stays
 * `PROCESSING` and the next attempt resolves it — the client retries, or phase 10's sweep
 * does.
 */
export const PayCheckoutOutcomes = {
  PAID: 'PAID',
  ALREADY_PAID: 'ALREADY_PAID',
  DECLINED: 'DECLINED',
  PENDING: 'PENDING',
  CANCELLED: 'CANCELLED',
} as const;

/** Human-facing. Clients branch on `code` and `details`, never on these. */
export const PaymentMessages = {
  NOT_FOUND: 'Checkout not found',
  DECLINED: 'The payment was declined',
  PENDING: 'The payment could not be confirmed; try again',
  CANCELLED: 'This checkout was cancelled',
} as const;

/** Why the system refunded a charge (D107). Stored on the row, so the books explain themselves. */
export const PaymentRefundReasons = { CHECKOUT_CANCELLED: 'CHECKOUT_CANCELLED' } as const;
