import type { CurrencyCode } from '@app/contracts';
import { CurrencyCodes } from '@app/contracts';
import { SimulatorVerdicts, providerOperationKey, simulatedProviderRef } from '@app/domain';
import { SimulatorPaymentProvider } from './simulator-payment.provider';
import type { ProviderChargeRecord, ProviderChargeStore } from './interfaces/provider-charge.interface';

/**
 * An in-memory store with the one rule the real table enforces: one row per operation
 * key. The adapter's decisions are what this spec is about; the table's constraints are
 * proven separately, by writing around Prisma.
 */
class FakeStore implements ProviderChargeStore {
  readonly rows = new Map<string, ProviderChargeRecord>();
  async find(operationKey: string): Promise<ProviderChargeRecord | null> {
    return this.rows.get(operationKey) ?? null;
  }
  async record(charge: ProviderChargeRecord): Promise<void> {
    if (this.rows.has(charge.operationKey)) throw new Error('duplicate operation key');
    this.rows.set(charge.operationKey, charge);
  }
}

const amountCaptured = 24_900;
const amountDeclined = 1_013;
const amountTimeout = 2_517;
const currency: CurrencyCode = CurrencyCodes.EGP;

function setup() {
  const store = new FakeStore();
  return { store, provider: new SimulatorPaymentProvider(store) };
}

const request = (amountMinor: number) => ({
  operationKey: providerOperationKey('c1'),
  amountMinor,
  currency,
});

describe('SimulatorPaymentProvider (ADR 004)', () => {
  it('captures an ordinary amount, records the charge and answers with a stable ref', async () => {
    const { store, provider } = setup();

    const outcome = await provider.capture(request(amountCaptured));

    expect(outcome.kind).toBe(SimulatorVerdicts.CAPTURED);
    if (outcome.kind !== SimulatorVerdicts.CAPTURED) throw new Error('unreachable');
    expect(outcome.providerRef).toBe(simulatedProviderRef(providerOperationKey('c1')));
    expect(outcome.capturedAt).toBeInstanceOf(Date);
    expect(store.rows.size).toBe(1);
  });

  it('declines a 13 amount and records nothing — a decline is not a charge', async () => {
    const { store, provider } = setup();

    expect(await provider.capture(request(amountDeclined))).toEqual({ kind: SimulatorVerdicts.DECLINED });
    expect(store.rows.size).toBe(0);
  });

  it('records a charge and then answers TIMEOUT, so the response can be lost', async () => {
    const { store, provider } = setup();

    expect(await provider.capture(request(amountTimeout))).toEqual({ kind: SimulatorVerdicts.TIMEOUT });
    // The charge happened; only the answer is missing. That is the whole point.
    expect(store.rows.size).toBe(1);
  });

  it('answers a retry of a timed-out charge with CAPTURED and the same ref (the provider idempotency rule)', async () => {
    const { store, provider } = setup();
    await provider.capture(request(amountTimeout));

    const retry = await provider.capture(request(amountTimeout));

    expect(retry.kind).toBe(SimulatorVerdicts.CAPTURED);
    if (retry.kind !== SimulatorVerdicts.CAPTURED) throw new Error('unreachable');
    expect(retry.providerRef).toBe(simulatedProviderRef(providerOperationKey('c1')));
    expect(store.rows.size).toBe(1);
  });

  it('never writes a second row, however many times it is asked', async () => {
    const { store, provider } = setup();
    await provider.capture(request(amountCaptured));

    const second = await provider.capture(request(amountCaptured));
    const third = await provider.capture(request(amountCaptured));

    expect(second.kind).toBe(SimulatorVerdicts.CAPTURED);
    expect(third.kind).toBe(SimulatorVerdicts.CAPTURED);
    expect(store.rows.size).toBe(1);
  });

  it('reads the store before the rule, so a recorded charge wins over the amount that timed out', async () => {
    // The amount still says TIMEOUT; the record says the charge happened. A provider that
    // re-derived the verdict would tell the caller to try again forever.
    const { store, provider } = setup();
    await provider.capture(request(amountTimeout));

    const second = await provider.capture(request(amountTimeout));

    expect(second.kind).toBe(SimulatorVerdicts.CAPTURED);
    expect(store.rows.get(providerOperationKey('c1'))?.providerRef).toBe(simulatedProviderRef(providerOperationKey('c1')));
  });
});
