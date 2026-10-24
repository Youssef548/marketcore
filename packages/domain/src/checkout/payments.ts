/**
 * The provider boundary's rules (ADR 004), kept pure so the adapter that talks to a
 * provider has no decisions of its own to get wrong.
 */

/** The operation key's prefix, so a provider (or a log) can tell these from anything else. */
export const PROVIDER_OPERATION_KEY_PREFIX = 'pay_';

/** An amount whose last two digits are 13 is declined by the simulator. */
export const SIMULATOR_DECLINED_MODULUS = 13;

/** An amount whose last two digits are 17 times out after the simulator has charged it. */
export const SIMULATOR_TIMEOUT_MODULUS = 17;

/** The simulator's provider reference is recognisably not a real provider's. */
export const SIMULATOR_PROVIDER_REF_PREFIX = 'sim_';

/** What the provider says about one charge (ADR 004). An option set, so the adapter's switch is total. */
export const SimulatorVerdicts = {
  CAPTURED: 'CAPTURED',
  DECLINED: 'DECLINED',
  TIMEOUT: 'TIMEOUT',
} as const;
export type SimulatorVerdict = (typeof SimulatorVerdicts)[keyof typeof SimulatorVerdicts];

/**
 * The provider's operation key for a checkout (ADR 004, D104).
 *
 * Derived, never minted per attempt. That is the deliberate opposite of ADR 003's client
 * key, and the reason is the failure it prevents: a retry after a crash runs in another
 * process with nothing in memory, so the only way it can present the *same* provider
 * operation — and so the only way the provider can refuse to charge twice — is for the
 * key to be a function of data both attempts already have. The checkout id is that data.
 *
 * It carries no amount, no attempt number and no timestamp: any of those would make a
 * retry a different operation, which is the bug.
 */
export function providerOperationKey(checkoutId: string): string {
  return `${PROVIDER_OPERATION_KEY_PREFIX}${checkoutId}`;
}

/**
 * What the simulator decides for an amount (ADR 004).
 *
 * A pure function, so a test chooses a path by choosing a price and no test can pass by
 * accident of a mock's configuration — and so the same amount gets the same verdict in
 * any process, in any order. `CAPTURED` is the ordinary case; the two special endings are
 * deliberately unlikely (a seller pricing at 13 or 17 minor units) and documented in the
 * ADR, which is where a person looks when a payment declines in a test.
 */
export function simulatorVerdict(amountMinor: number): SimulatorVerdict {
  const remainder = Math.abs(amountMinor) % 100;
  if (remainder === SIMULATOR_DECLINED_MODULUS) return SimulatorVerdicts.DECLINED;
  if (remainder === SIMULATOR_TIMEOUT_MODULUS) return SimulatorVerdicts.TIMEOUT;
  return SimulatorVerdicts.CAPTURED;
}

/**
 * The reference a captured charge carries (ADR 004).
 *
 * Stable for one operation, because phase 8 posts the ledger against it: a fresh id per
 * call would make the same charge look like two. Derived from the key rather than
 * random for exactly that reason.
 */
export function simulatedProviderRef(operationKey: string): string {
  return `${SIMULATOR_PROVIDER_REF_PREFIX}${operationKey}`;
}
