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
