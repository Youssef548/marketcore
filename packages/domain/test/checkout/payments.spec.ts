import { describe, expect, it } from 'vitest';
import {
  PROVIDER_OPERATION_KEY_PREFIX,
  SIMULATOR_DECLINED_MODULUS,
  SIMULATOR_TIMEOUT_MODULUS,
  SimulatorVerdicts,
  providerOperationKey,
  simulatedProviderRef,
  simulatorVerdict,
} from '../../src/checkout/payments';

describe('the provider operation key (ADR 004, D104)', () => {
  it('is derived from the checkout, so a retry in any process is the same operation', () => {
    expect(providerOperationKey('c1')).toBe(`${PROVIDER_OPERATION_KEY_PREFIX}c1`);
    expect(providerOperationKey('c1')).toBe(providerOperationKey('c1'));
  });

  it('separates two checkouts', () => {
    expect(providerOperationKey('c1')).not.toBe(providerOperationKey('c2'));
  });

  it('does not carry the amount, so two attempts for different totals are one operation', () => {
    expect(providerOperationKey('c1')).not.toContain('1000');
    expect(providerOperationKey('c1')).toBe(providerOperationKey('c1'));
  });
});

describe('the simulator verdict (ADR 004)', () => {
  it('declines an amount ending in 13 and times out an amount ending in 17', () => {
    expect(SIMULATOR_DECLINED_MODULUS).toBe(13);
    expect(SIMULATOR_TIMEOUT_MODULUS).toBe(17);
    expect(simulatorVerdict(1_013)).toBe(SimulatorVerdicts.DECLINED);
    expect(simulatorVerdict(2_517)).toBe(SimulatorVerdicts.TIMEOUT);
  });

  it('captures anything else, including the round numbers a seller is likely to choose', () => {
    for (const amount of [100, 1_000, 24_900, 43_800, 5_000, 99, 1]) {
      expect(simulatorVerdict(amount)).toBe(SimulatorVerdicts.CAPTURED);
    }
  });

  it('looks only at the last two digits', () => {
    expect(simulatorVerdict(13)).toBe(SimulatorVerdicts.DECLINED);
    expect(simulatorVerdict(113)).toBe(SimulatorVerdicts.DECLINED);
    expect(simulatorVerdict(99_913)).toBe(SimulatorVerdicts.DECLINED);
    expect(simulatorVerdict(17)).toBe(SimulatorVerdicts.TIMEOUT);
    expect(simulatorVerdict(99_917)).toBe(SimulatorVerdicts.TIMEOUT);
  });
});

describe('the simulated provider reference', () => {
  it('is stable for one operation and distinct between two', () => {
    expect(simulatedProviderRef(providerOperationKey('c1'))).toBe(simulatedProviderRef(providerOperationKey('c1')));
    expect(simulatedProviderRef(providerOperationKey('c1'))).not.toBe(
      simulatedProviderRef(providerOperationKey('c2')),
    );
  });

  it('is recognisably the simulator, not a real provider', () => {
    expect(simulatedProviderRef(providerOperationKey('c1'))).toMatch(/^sim_/);
  });
});
