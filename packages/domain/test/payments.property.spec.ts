import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { SimulatorVerdicts, simulatorVerdict } from '../src/payments';

/**
 * The verdict is a rule, so the properties that matter are totality and stability: every
 * amount the schema can carry gets exactly one verdict, and the same amount always gets
 * the same one. A test chooses a path by choosing a price, which is only honest if neither
 * of those can fail.
 */
describe('simulatorVerdict properties (ADR 004)', () => {
  it('is total over every amount the wire can carry', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2_147_483_647 }), (amount) => {
        expect(Object.values(SimulatorVerdicts)).toContain(simulatorVerdict(amount));
      }),
    );
  });

  it('is stable: the same amount always gets the same verdict', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2_147_483_647 }), (amount) => {
        return simulatorVerdict(amount) === simulatorVerdict(amount);
      }),
    );
  });

  it('depends only on the last two digits', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20_000_000 }), fc.integer({ min: 0, max: 20 }), (amount, hundreds) => {
        const shifted = amount + hundreds * 100;
        return simulatorVerdict(shifted) === simulatorVerdict(amount);
      }),
    );
  });

  it('declines exactly the amounts ending in 13 and times out exactly those ending in 17', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200_000 }), (amount) => {
        const expected =
          amount % 100 === 13
            ? SimulatorVerdicts.DECLINED
            : amount % 100 === 17
              ? SimulatorVerdicts.TIMEOUT
              : SimulatorVerdicts.CAPTURED;
        return simulatorVerdict(amount) === expected;
      }),
    );
  });
});
