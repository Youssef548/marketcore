import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from '@jest/globals';
import { CurrencyCodes, type CurrencyCode } from '@app/contracts';
import { SimulatorVerdicts, providerOperationKey, simulatedProviderRef } from '@app/domain';
import type { PrismaService } from '@app/runtime';
import { ProviderChargeRepository } from '../../src/payments/repositories/provider-charge.repository';
import { SimulatorPaymentProvider } from '../../src/payments/simulator-payment.provider';
import { testPrisma } from '../support/db';

/**
 * The provider's store against the real table, and the adapter through the port.
 *
 * The unit spec proves the adapter's decisions against a fake; this proves the store they
 * rest on — insert-if-absent, then read — and then that the two together behave as ADR 004
 * says a provider does: a timed-out charge is found by the retry rather than made again.
 */
afterAll(async () => {
  await testPrisma.$disconnect();
});

const repository = new ProviderChargeRepository(testPrisma as unknown as PrismaService);
const provider = new SimulatorPaymentProvider(repository);

const currency: CurrencyCode = CurrencyCodes.EGP;
const aCharge = (operationKey: string, amountMinor = 24_900) => ({
  operationKey,
  providerRef: simulatedProviderRef(operationKey),
  amountMinor,
  currency,
  capturedAt: new Date(),
});

describe('ProviderChargeRepository (ADR 004)', () => {
  it('records a charge and reports that it did', async () => {
    const charge = aCharge(providerOperationKey(randomUUID()));

    const outcome = await repository.record(charge);

    expect(outcome.created).toBe(true);
    expect(await repository.find(charge.operationKey)).toMatchObject({
      providerRef: charge.providerRef,
      amountMinor: charge.amountMinor,
    });
  });

  it('answers an already-recorded key with the row that exists, not with the candidate', async () => {
    const operationKey = providerOperationKey(randomUUID());
    const first = aCharge(operationKey, 24_900);
    await repository.record(first);

    // A second attempt for the same operation, with different numbers: the store's answer
    // is what happened, never what this caller wanted to happen.
    const outcome = await repository.record(aCharge(operationKey, 9_999));

    expect(outcome.created).toBe(false);
    expect(outcome.charge.amountMinor).toBe(24_900);
    expect(outcome.charge.providerRef).toBe(first.providerRef);
    expect(await testPrisma.providerCharge.count({ where: { operationKey } })).toBe(1);
  });

  it('survives two records arriving together: one creates, the loser reads', async () => {
    const charge = aCharge(providerOperationKey(randomUUID()));

    const [first, second] = await Promise.all([repository.record(charge), repository.record(charge)]);

    expect([first.created, second.created].sort()).toEqual([false, true]);
    expect(first.charge.providerRef).toBe(second.charge.providerRef);
    expect(await testPrisma.providerCharge.count({ where: { operationKey: charge.operationKey } })).toBe(1);
  });

  it('finds nothing for an operation that never charged', async () => {
    expect(await repository.find(providerOperationKey(randomUUID()))).toBeNull();
  });
});

describe('the simulator against the real table (ADR 004)', () => {
  it('captures an ordinary amount once and answers with the same reference every time', async () => {
    const operationKey = providerOperationKey(randomUUID());

    const first = await provider.capture({ operationKey, amountMinor: 24_900, currency });
    const second = await provider.capture({ operationKey, amountMinor: 24_900, currency });

    expect(first.kind).toBe(SimulatorVerdicts.CAPTURED);
    if (first.kind !== SimulatorVerdicts.CAPTURED || second.kind !== SimulatorVerdicts.CAPTURED) {
      throw new Error('unreachable');
    }
    expect(second.providerRef).toBe(first.providerRef);
    expect(await testPrisma.providerCharge.count({ where: { operationKey } })).toBe(1);
  });

  it('charges, loses the answer, and lets the retry find the charge instead of making another', async () => {
    const operationKey = providerOperationKey(randomUUID());
    const timedOut = { operationKey, amountMinor: 2_517, currency };

    expect(await provider.capture(timedOut)).toEqual({ kind: SimulatorVerdicts.TIMEOUT });
    // The charge is on disk even though the caller was told nothing: that row is the whole
    // reason a retry cannot become a second charge.
    expect(await testPrisma.providerCharge.count({ where: { operationKey } })).toBe(1);

    const retry = await provider.capture(timedOut);

    expect(retry.kind).toBe(SimulatorVerdicts.CAPTURED);
    if (retry.kind !== SimulatorVerdicts.CAPTURED) throw new Error('unreachable');
    expect(retry.providerRef).toBe(simulatedProviderRef(operationKey));
    expect(await testPrisma.providerCharge.count({ where: { operationKey } })).toBe(1);
  });

  it('records nothing for a declined charge — no money moved, so there is nothing to find', async () => {
    const operationKey = providerOperationKey(randomUUID());

    expect(await provider.capture({ operationKey, amountMinor: 1_013, currency })).toEqual({
      kind: SimulatorVerdicts.DECLINED,
    });
    expect(await testPrisma.providerCharge.count({ where: { operationKey } })).toBe(0);
  });
});
